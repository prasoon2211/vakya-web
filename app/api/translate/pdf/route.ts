import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { db, users, articles } from "@/lib/db";
import { eq } from "drizzle-orm";
import { extractTextFromPDF } from "@/lib/pdf/extract-text";
import { v4 as uuidv4 } from "uuid";

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

// Import translation functions from main translate route
// We need to recreate some logic here since we can't easily import from route files
import { GoogleGenAI } from "@google/genai";
import { getCefrGuidelines } from "@/lib/cefr-guidelines";

let geminiClient: GoogleGenAI | null = null;
function getGemini() {
  if (!geminiClient && process.env.GOOGLE_AI_API_KEY) {
    geminiClient = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });
  }
  return geminiClient;
}

interface TranslationBlock {
  original: string;
  translated: string;
}

// Chunking config
const CHUNK_CONFIG = {
  MIN_WORDS: 50,
  TARGET_WORDS: 250,
  MAX_WORDS: 500,
};

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

function splitAtSentences(text: string, maxWords: number): string[] {
  const sentencePattern = /[^.!?]*[.!?]+(?:\s+|$)/g;
  const sentences = text.match(sentencePattern) || [text];

  const chunks: string[] = [];
  let current = '';
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
    .map(p => p.trim())
    .filter(p => p.length > 0);

  if (segments.length <= 1 && countWords(content) > MAX_WORDS) {
    segments = content
      .split(/\n+/)
      .map(p => p.trim())
      .filter(p => p.length > 0);
  }

  segments = segments.flatMap(segment => {
    const words = countWords(segment);
    if (words <= MAX_WORDS) return [segment];
    return splitAtSentences(segment, TARGET_WORDS);
  });

  const merged: string[] = [];
  let buffer = '';
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
      (bufferWords < TARGET_WORDS && segmentWords < TARGET_WORDS && bufferWords + segmentWords <= MAX_WORDS);

    if (shouldMerge && bufferWords + segmentWords <= MAX_WORDS) {
      buffer = buffer + '\n\n' + segment;
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
        merged[merged.length - 2] = secondLast + '\n\n' + lastChunk;
        merged.pop();
      }
    }
  }

  return merged.filter(chunk => chunk.trim().length > 0);
}

async function detectLanguage(text: string): Promise<string> {
  const gemini = getGemini();
  if (!gemini) return "Unknown";

  const sample = text.slice(0, 500);
  const prompt = `Detect the language of the following text. Return ONLY the language name in English. No explanation.\n\nText:\n${sample}`;

  try {
    const response = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { thinkingConfig: { thinkingBudget: 0 } },
    });

    const detected = response.text?.trim();
    if (detected) {
      const normalized = detected.replace(/[^a-zA-Z]/g, '');
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
  "original": "brief description of source content",
  "translated": "the complete adapted ${targetLanguage} text at ${cefrLevel} level"
}

INPUT:
${text}`;

  try {
    const response = await gemini.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: { responseMimeType: "application/json" },
    });

    const content = response.text;
    if (content) {
      const parsed = JSON.parse(content);
      if (parsed.translated) {
        return { original: text, translated: parsed.translated };
      }
    }
  } catch (error) {
    console.error("Translation error:", error);
  }

  return { original: text, translated: text };
}

// Background processing for PDF translation
async function processPdfTranslation(
  articleId: string,
  paragraphs: string[],
  targetLanguage: string,
  cefrLevel: string
) {
  const translatedBlocks: TranslationBlock[] = [];

  try {
    const MAX_PARALLEL = 15;

    console.log(`[${articleId}] Starting PDF translation: ${paragraphs.length} chunks`);

    for (let i = 0; i < paragraphs.length; i += MAX_PARALLEL) {
      const wave = paragraphs.slice(i, i + MAX_PARALLEL);

      console.log(`[${articleId}] Translating chunks ${i + 1}-${Math.min(i + MAX_PARALLEL, paragraphs.length)} of ${paragraphs.length}`);

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

      await db
        .update(articles)
        .set({
          translatedContent: JSON.stringify(translatedBlocks),
          translationProgress: translatedBlocks.length,
        })
        .where(eq(articles.id, articleId));

      console.log(`[${articleId}] Progress: ${translatedBlocks.length}/${paragraphs.length}`);
    }

    const wordCount = translatedBlocks.reduce((acc, block) => {
      return acc + (block.translated?.split(/\s+/).length || 0);
    }, 0);

    await db
      .update(articles)
      .set({
        translatedContent: JSON.stringify(translatedBlocks),
        status: "completed",
        wordCount,
        translationProgress: paragraphs.length,
      })
      .where(eq(articles.id, articleId));

    console.log(`[${articleId}] PDF translation completed! ${wordCount} words`);

  } catch (error) {
    console.error(`[${articleId}] PDF translation error:`, error);

    await db
      .update(articles)
      .set({
        translatedContent: translatedBlocks.length > 0 ? JSON.stringify(translatedBlocks) : null,
        translationProgress: translatedBlocks.length,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Translation failed",
      })
      .where(eq(articles.id, articleId));
  }
}

// POST - Upload and translate PDF
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const targetLanguage = formData.get("targetLanguage") as string;
    const cefrLevel = formData.get("cefrLevel") as string;
    const customTitle = formData.get("title") as string | null;

    if (!file || !targetLanguage || !cefrLevel) {
      return NextResponse.json(
        { error: "Missing required fields: file, targetLanguage, cefrLevel" },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        { error: "Only PDF files are supported" },
        { status: 400 }
      );
    }

    // Size limit: 10MB
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10MB" },
        { status: 400 }
      );
    }

    console.log(`[PDF] Received file: ${file.name} (${file.size} bytes)`);

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

    // Generate unique ID for this PDF
    const pdfId = uuidv4();
    const pdfKey = `pdfs/${pdfId}.pdf`;

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);

    // Upload PDF to R2
    console.log(`[PDF] Uploading to R2: ${pdfKey}`);
    await s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: pdfKey,
        Body: pdfBuffer,
        ContentType: "application/pdf",
      })
    );

    // Extract text from PDF using Gemini
    console.log(`[PDF] Extracting text...`);
    const extracted = await extractTextFromPDF(pdfBuffer, file.name);

    if (!extracted.content || extracted.content.length < 50) {
      return NextResponse.json(
        { error: "Could not extract text from PDF. The file may be image-only or corrupted." },
        { status: 400 }
      );
    }

    // Use custom title if provided, otherwise use extracted title
    const title = customTitle?.trim() || extracted.title;

    // Chunk the content
    const paragraphs = smartChunkContent(extracted.content);

    // Detect source language
    const sourceLanguage = await detectLanguage(extracted.content.slice(0, 500));

    // Create article record
    const [newArticle] = await db
      .insert(articles)
      .values({
        userId: user.id,
        sourceType: "pdf",
        sourceUrl: null,
        pdfUrl: pdfKey,
        title,
        originalContent: JSON.stringify(paragraphs),
        sourceLanguage,
        targetLanguage,
        cefrLevel,
        status: "translating",
        totalParagraphs: paragraphs.length,
        translationProgress: 0,
      })
      .returning({ id: articles.id });

    const articleId = newArticle.id;

    console.log(`[PDF] Created article ${articleId}, starting translation...`);

    // Start translation in background
    processPdfTranslation(
      articleId,
      paragraphs,
      targetLanguage,
      cefrLevel
    ).catch((error) => {
      console.error(`[${articleId}] Background PDF processing error:`, error);
    });

    return NextResponse.json({
      articleId,
      status: "translating",
      progress: 0,
      total: paragraphs.length,
      title,
    });

  } catch (error) {
    console.error("PDF translation error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `PDF processing failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}
