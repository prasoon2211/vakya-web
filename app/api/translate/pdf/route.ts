import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { db, users, articles } from "@/lib/db";
import { eq, sql } from "drizzle-orm";
import { extractTextFromPDF } from "@/lib/pdf/extract-text";
import { GoogleGenAI } from "@google/genai";
import { getCefrGuidelines } from "@/lib/cefr-guidelines";
import {
  PDFValidationError,
  PDFExtractionError,
  PDFUploadError,
  toAppError,
  type ArticleStatus,
} from "@/lib/errors";
import { handleApiError, unauthorized, badRequest } from "@/lib/api-error-handler";
import { withTimeout } from "@/lib/utils/async";
import { generatePdfStorageKey, generatePdfTitle } from "@/lib/utils/safe-name";

// ============================================================================
// Clients
// ============================================================================

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

let geminiClient: GoogleGenAI | null = null;
function getGemini() {
  if (!geminiClient && process.env.GOOGLE_AI_API_KEY) {
    geminiClient = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });
  }
  return geminiClient;
}

// ============================================================================
// Types
// ============================================================================

interface TranslationBlock {
  original: string;
  translated: string;
  bridge?: string;
}

// ============================================================================
// Status Helpers
// ============================================================================

async function updateArticleStatus(
  articleId: string,
  status: ArticleStatus,
  extras?: Record<string, unknown>
) {
  await db
    .update(articles)
    .set({
      status,
      updatedAt: new Date(),
      ...extras,
    })
    .where(eq(articles.id, articleId));
}

async function markArticleFailed(articleId: string, error: unknown) {
  const appError = toAppError(error);
  await db
    .update(articles)
    .set({
      status: "failed",
      errorMessage: appError.userMessage,
      errorCode: appError.code,
      retryCount: sql`${articles.retryCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(articles.id, articleId));
}

// ============================================================================
// PDF Validation
// ============================================================================

interface PDFValidationResult {
  isValid: boolean;
  error?: string;
  sizeBytes: number;
}

function validatePdfFile(file: File, buffer: Buffer): PDFValidationResult {
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB

  // Check size
  if (buffer.length > MAX_SIZE) {
    return {
      isValid: false,
      error: `PDF is too large (${(buffer.length / 1024 / 1024).toFixed(1)}MB). Maximum size is 10MB.`,
      sizeBytes: buffer.length,
    };
  }

  if (buffer.length < 100) {
    return {
      isValid: false,
      error: "File appears to be empty or corrupted.",
      sizeBytes: buffer.length,
    };
  }

  // Check PDF magic bytes
  const header = buffer.slice(0, 5).toString("ascii");
  if (header !== "%PDF-") {
    return {
      isValid: false,
      error: "File is not a valid PDF document.",
      sizeBytes: buffer.length,
    };
  }

  // Check file extension
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return {
      isValid: false,
      error: "Only PDF files are supported.",
      sizeBytes: buffer.length,
    };
  }

  return {
    isValid: true,
    sizeBytes: buffer.length,
  };
}

// ============================================================================
// Chunking (shared with main translate route)
// ============================================================================

const CHUNK_CONFIG = {
  MIN_WORDS: 50,
  TARGET_WORDS: 250,
  MAX_WORDS: 500,
};

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

function splitAtSentences(text: string, maxWords: number): string[] {
  const sentencePattern = /[^.!?]*[.!?]+(?:\s+|$)/g;
  const sentences = text.match(sentencePattern) || [text];

  const chunks: string[] = [];
  let current = "";
  let currentWords = 0;

  for (const sentence of sentences) {
    const sentenceWords = countWords(sentence);
    if (currentWords + sentenceWords <= maxWords) {
      current += sentence;
      currentWords += sentenceWords;
    } else {
      if (current.trim()) chunks.push(current.trim());
      current = sentence;
      currentWords = sentenceWords;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function smartChunkContent(content: string): string[] {
  const { MIN_WORDS, TARGET_WORDS, MAX_WORDS } = CHUNK_CONFIG;

  let segments = content
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (segments.length <= 1 && countWords(content) > MAX_WORDS) {
    segments = content
      .split(/\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  }

  segments = segments.flatMap((segment) => {
    const words = countWords(segment);
    if (words <= MAX_WORDS) return [segment];
    return splitAtSentences(segment, TARGET_WORDS);
  });

  const merged: string[] = [];
  let buffer = "";
  let bufferWords = 0;

  for (const segment of segments) {
    const segmentWords = countWords(segment);

    if (buffer.length === 0) {
      buffer = segment;
      bufferWords = segmentWords;
      continue;
    }

    const shouldMerge =
      bufferWords < MIN_WORDS ||
      segmentWords < MIN_WORDS ||
      (bufferWords < TARGET_WORDS &&
        segmentWords < TARGET_WORDS &&
        bufferWords + segmentWords <= MAX_WORDS);

    if (shouldMerge && bufferWords + segmentWords <= MAX_WORDS) {
      buffer = buffer + "\n\n" + segment;
      bufferWords += segmentWords;
    } else {
      if (buffer.trim()) merged.push(buffer.trim());
      buffer = segment;
      bufferWords = segmentWords;
    }
  }

  if (buffer.trim()) merged.push(buffer.trim());

  if (merged.length > 1) {
    const lastChunk = merged[merged.length - 1];
    const lastWords = countWords(lastChunk);
    if (lastWords < MIN_WORDS) {
      const secondLast = merged[merged.length - 2];
      const secondLastWords = countWords(secondLast);
      if (secondLastWords + lastWords <= MAX_WORDS) {
        merged[merged.length - 2] = secondLast + "\n\n" + lastChunk;
        merged.pop();
      }
    }
  }

  return merged.filter((chunk) => chunk.trim().length > 0);
}

// ============================================================================
// Language Detection & Translation
// ============================================================================

async function detectLanguage(text: string): Promise<string> {
  const gemini = getGemini();
  if (!gemini) return "Unknown";

  const sample = text.slice(0, 500);
  const prompt = `Detect the language of the following text. Return ONLY the language name in English. No explanation.\n\nText:\n${sample}`;

  try {
    const response = await withTimeout(
      gemini.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: { thinkingConfig: { thinkingBudget: 0 } },
      }),
      30000,
      "Language detection"
    );

    const detected = response.text?.trim();
    if (detected) {
      const normalized = detected.replace(/[^a-zA-Z]/g, "");
      return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
    }
  } catch (error) {
    console.error("Language detection error:", error);
  }

  return "Unknown";
}

async function translateChunk(
  text: string,
  targetLanguage: string,
  cefrLevel: string
): Promise<TranslationBlock> {
  const gemini = getGemini();
  if (!gemini) {
    return { original: text, translated: text };
  }

  const levelGuidelines = getCefrGuidelines(targetLanguage, cefrLevel);

  const prompt = `You are a professional language learning content adapter. Translate/adapt the following text into ${targetLanguage} for a ${cefrLevel} learner.

${levelGuidelines}

Return JSON format:
{
  "original": "the source text (preserve exactly)",
  "translated": "the complete adapted ${targetLanguage} text at ${cefrLevel} level",
  "bridge": "English translation that maps 1-1 to your translated text"
}

INPUT:
${text}`;

  try {
    const response = await withTimeout(
      gemini.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: { responseMimeType: "application/json" },
      }),
      60000,
      "Translation"
    );

    const content = response.text;
    if (content) {
      const parsed = JSON.parse(content);
      if (parsed.translated) {
        return {
          original: text,
          translated: parsed.translated,
          bridge: parsed.bridge || undefined,
        };
      }
    }
  } catch (error) {
    console.error("Translation error:", error);
  }

  return { original: text, translated: text };
}

// ============================================================================
// Background Processing
// ============================================================================

async function processPdfInBackground(
  articleId: string,
  pdfBuffer: Buffer,
  pdfKey: string,
  targetLanguage: string,
  cefrLevel: string,
  displayTitle: string
) {
  try {
    // Phase 1: Upload PDF to R2
    await updateArticleStatus(articleId, "fetching");
    console.log(`[${articleId}] Uploading PDF to R2: ${pdfKey}`);

    try {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: pdfKey,
          Body: pdfBuffer,
          ContentType: "application/pdf",
        })
      );
    } catch (error) {
      throw new PDFUploadError(error instanceof Error ? error.message : "Upload failed");
    }

    // Phase 2: Extract text from PDF
    await updateArticleStatus(articleId, "extracting");
    console.log(`[${articleId}] Extracting text from PDF...`);

    let extracted;
    try {
      extracted = await extractTextFromPDF(pdfBuffer, displayTitle);
    } catch (error) {
      throw new PDFExtractionError(error instanceof Error ? error.message : "Extraction failed");
    }

    if (!extracted.content || extracted.content.length < 50) {
      throw new PDFExtractionError(
        "Could not extract enough text from this PDF. It may be scanned or image-only."
      );
    }

    const title = extracted.title || displayTitle;

    // Phase 3: Detect language
    await updateArticleStatus(articleId, "detecting", { title });
    console.log(`[${articleId}] Detecting source language...`);

    const sourceLanguage = await detectLanguage(extracted.content.slice(0, 500));
    console.log(`[${articleId}] Detected: ${sourceLanguage}`);

    // Phase 4: Chunk content
    const paragraphs = smartChunkContent(extracted.content);
    console.log(`[${articleId}] ${paragraphs.length} chunks to translate`);

    // Update with extracted content
    await updateArticleStatus(articleId, "translating", {
      title,
      originalContent: JSON.stringify(paragraphs),
      sourceLanguage,
      totalParagraphs: paragraphs.length,
      translationProgress: 0,
    });

    // Phase 5: Translate in parallel waves
    const translatedBlocks: TranslationBlock[] = [];
    const MAX_PARALLEL = 15;

    for (let i = 0; i < paragraphs.length; i += MAX_PARALLEL) {
      const wave = paragraphs.slice(i, i + MAX_PARALLEL);

      console.log(
        `[${articleId}] Translating chunks ${i + 1}-${Math.min(i + MAX_PARALLEL, paragraphs.length)}`
      );

      const results = await Promise.allSettled(
        wave.map((chunk) => translateChunk(chunk, targetLanguage, cefrLevel))
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const originalChunk = wave[j];

        if (result.status === "fulfilled") {
          const block = result.value;
          if (block.translated && block.translated.trim().length > 0) {
            translatedBlocks.push(block);
          }
        } else {
          translatedBlocks.push({
            original: originalChunk,
            translated: originalChunk,
          });
        }
      }

      // Save progress after each wave
      await db
        .update(articles)
        .set({
          translatedContent: JSON.stringify(translatedBlocks),
          translationProgress: translatedBlocks.length,
          updatedAt: new Date(),
        })
        .where(eq(articles.id, articleId));

      console.log(`[${articleId}] Progress: ${translatedBlocks.length}/${paragraphs.length}`);
    }

    // Calculate word count and mark complete
    const wordCount = translatedBlocks.reduce((acc, block) => {
      return acc + (block.translated?.split(/\s+/).length || 0);
    }, 0);

    await updateArticleStatus(articleId, "completed", {
      translatedContent: JSON.stringify(translatedBlocks),
      wordCount,
      translationProgress: paragraphs.length,
    });

    console.log(`[${articleId}] PDF translation completed! ${wordCount} words`);
  } catch (error) {
    console.error(`[${articleId}] PDF processing error:`, error);
    await markArticleFailed(articleId, error);
  }
}

// ============================================================================
// API Handler
// ============================================================================

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return unauthorized();
    }

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const targetLanguage = formData.get("targetLanguage") as string;
    const cefrLevel = formData.get("cefrLevel") as string;
    const customTitle = formData.get("title") as string | null;

    // Validate required fields
    if (!file) {
      return badRequest("No file provided");
    }

    if (!targetLanguage || !cefrLevel) {
      return badRequest("Missing required fields: targetLanguage, cefrLevel");
    }

    // Convert file to buffer for validation
    const arrayBuffer = await file.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);

    // Validate PDF
    const validation = validatePdfFile(file, pdfBuffer);
    if (!validation.isValid) {
      return NextResponse.json(
        {
          error: validation.error,
          code: "PDF_INVALID",
          isRetryable: false,
        },
        { status: 400 }
      );
    }

    console.log(`[PDF] Received file: ${file.name} (${validation.sizeBytes} bytes)`);

    // Get or create user
    let user = await db.query.users.findFirst({
      where: eq(users.clerkId, userId),
      columns: { id: true },
    });

    if (!user) {
      const [newUser] = await db
        .insert(users)
        .values({ clerkId: userId })
        .returning({ id: users.id });
      user = newUser;
    }

    // Generate safe storage key and display title
    const pdfKey = generatePdfStorageKey(file.name);
    const displayTitle = customTitle?.trim() || generatePdfTitle(file.name);

    // Create article record immediately with "queued" status
    // This ensures the article appears in the user's list right away
    const [newArticle] = await db
      .insert(articles)
      .values({
        userId: user.id,
        sourceType: "pdf",
        sourceUrl: null,
        pdfUrl: pdfKey,
        title: displayTitle,
        targetLanguage,
        cefrLevel,
        status: "queued",
        totalParagraphs: 0,
        translationProgress: 0,
      })
      .returning({ id: articles.id });

    const articleId = newArticle.id;
    console.log(`[${articleId}] Created PDF article, starting background processing...`);

    // Start background processing
    processPdfInBackground(
      articleId,
      pdfBuffer,
      pdfKey,
      targetLanguage,
      cefrLevel,
      displayTitle
    ).catch((error) => {
      console.error(`[${articleId}] Background PDF processing error:`, error);
    });

    // Return immediately
    return NextResponse.json({
      articleId,
      status: "queued",
      progress: 0,
      total: 0,
      title: displayTitle,
    });
  } catch (error) {
    return handleApiError(error, "PDF upload");
  }
}
