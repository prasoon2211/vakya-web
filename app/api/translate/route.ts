import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { db, users, articles } from "@/lib/db";
import { eq, and } from "drizzle-orm";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Timeout wrapper for fetch
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = 30000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

interface TranslationBlock {
  original: string;
  translated: string;
}

// Extract main article content using Readability
function extractArticleContent(html: string, url: string): { title: string; content: string } | null {
  try {
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article) {
      return null;
    }

    return {
      title: article.title || "Untitled",
      content: article.textContent || "",
    };
  } catch (error) {
    console.error("Readability extraction failed:", error);
    return null;
  }
}

// Smart paragraph chunking for optimal translation
const CHUNK_CONFIG = {
  MIN_WORDS: 50,      // Merge chunks smaller than this
  TARGET_WORDS: 250,  // Ideal chunk size
  MAX_WORDS: 500,     // Split chunks larger than this
};

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

function splitAtSentences(text: string, maxWords: number): string[] {
  // Match sentences ending with . ! ? followed by space or end
  // Also handle common abbreviations to avoid false splits
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
      if (current.trim()) {
        chunks.push(current.trim());
      }
      current = sentence;
      currentWords = sentenceWords;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

function smartChunkContent(content: string): string[] {
  const { MIN_WORDS, TARGET_WORDS, MAX_WORDS } = CHUNK_CONFIG;

  // Step 1: Split on natural paragraph boundaries
  let segments = content
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  // If no double newlines, try single newlines for very long content
  if (segments.length <= 1 && countWords(content) > MAX_WORDS) {
    segments = content
      .split(/\n+/)
      .map(p => p.trim())
      .filter(p => p.length > 0);
  }

  // Step 2: Split oversized segments at sentence boundaries
  segments = segments.flatMap(segment => {
    const words = countWords(segment);
    if (words <= MAX_WORDS) {
      return [segment];
    }
    return splitAtSentences(segment, TARGET_WORDS);
  });

  // Step 3: Merge small segments with neighbors
  const merged: string[] = [];
  let buffer = '';
  let bufferWords = 0;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const segmentWords = countWords(segment);

    if (buffer.length === 0) {
      buffer = segment;
      bufferWords = segmentWords;
      continue;
    }

    const shouldMerge =
      // Merge if buffer is small
      bufferWords < MIN_WORDS ||
      // Merge if segment is small
      segmentWords < MIN_WORDS ||
      // Merge if combined is still under target and both are small-ish
      (bufferWords < TARGET_WORDS && segmentWords < TARGET_WORDS && bufferWords + segmentWords <= MAX_WORDS);

    if (shouldMerge && bufferWords + segmentWords <= MAX_WORDS) {
      // Merge with double newline to preserve some structure
      buffer = buffer + '\n\n' + segment;
      bufferWords += segmentWords;
    } else {
      // Push buffer and start new one
      if (buffer.trim()) {
        merged.push(buffer.trim());
      }
      buffer = segment;
      bufferWords = segmentWords;
    }
  }

  // Don't forget the last buffer
  if (buffer.trim()) {
    merged.push(buffer.trim());
  }

  // Step 4: Final pass - if we still have very small chunks at the end, merge with previous
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

  // Filter out any empty chunks
  return merged.filter(chunk => chunk.trim().length > 0);
}

// Translate a single chunk of text
async function translateChunk(
  text: string,
  targetLanguage: string,
  cefrLevel: string
): Promise<TranslationBlock> {
  const systemPrompt = `You are a language learning assistant. Translate text to ${targetLanguage} at CEFR level ${cefrLevel}.

CEFR ${cefrLevel} guidelines:
- A1: Basic vocabulary (500 words), simple present, short sentences
- A2: Elementary vocabulary, simple past/future, compound sentences
- B1: Intermediate vocabulary, all common tenses, opinions allowed
- B2: Upper-intermediate, complex sentences, idioms acceptable
- C1: Advanced vocabulary, nuanced expression
- C2: Native-level expression

Preserve paragraph structure (blank lines). Return JSON: {"original": "input text", "translated": "your translation"}`;

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: text },
    ],
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (content) {
    try {
      const parsed = JSON.parse(content);
      if (parsed.translated) {
        return { original: text, translated: parsed.translated };
      }
    } catch {
      // If parsing fails, return original as translated (fallback)
    }
  }

  // Fallback: return original text as translation
  return { original: text, translated: text };
}

// Wrapper for backward compatibility (translates array of chunks)
async function translateBatch(
  batch: string[],
  targetLanguage: string,
  cefrLevel: string
): Promise<TranslationBlock[]> {
  // For single chunk (our main use case now), call directly
  if (batch.length === 1) {
    const result = await translateChunk(batch[0], targetLanguage, cefrLevel);
    return [result];
  }

  // For multiple chunks, translate each
  const results = await Promise.all(
    batch.map(chunk => translateChunk(chunk, targetLanguage, cefrLevel))
  );
  return results;
}

// Background translation worker
async function processTranslation(
  articleId: string,
  sourceUrl: string,
  targetLanguage: string,
  cefrLevel: string,
  existingParagraphs: string[],
  existingBlocks: TranslationBlock[]
) {
  let paragraphs = existingParagraphs;
  let translatedBlocks = [...existingBlocks];
  let title = "Untitled";

  try {
    // Phase 1: Fetch content if needed
    if (paragraphs.length === 0) {
      console.log(`[${articleId}] Fetching article from ${sourceUrl}`);

      const jinaUrl = `https://r.jina.ai/${encodeURIComponent(sourceUrl)}`;
      const jinaResponse = await fetchWithTimeout(jinaUrl, {
        headers: {
          Authorization: `Bearer ${process.env.JINA_API_KEY}`,
          Accept: "text/html",
          "X-Return-Format": "html",
        },
      }, 45000);

      if (!jinaResponse.ok) {
        await db
          .update(articles)
          .set({ status: "failed", errorMessage: "Failed to fetch article content" })
          .where(eq(articles.id, articleId));
        return;
      }

      const html = await jinaResponse.text();
      const extracted = extractArticleContent(html, sourceUrl);

      if (!extracted || !extracted.content || extracted.content.length < 100) {
        await db
          .update(articles)
          .set({ status: "failed", errorMessage: "Article content too short or couldn't be extracted" })
          .where(eq(articles.id, articleId));
        return;
      }

      title = extracted.title;

      // Smart chunk the content for optimal translation
      paragraphs = smartChunkContent(extracted.content);

      console.log(`[${articleId}] Smart chunking: ${countWords(extracted.content)} words → ${paragraphs.length} chunks`);
      console.log(`[${articleId}] Chunk sizes: ${paragraphs.map(p => countWords(p)).join(', ')} words`);

      // Save original content and update status
      await db
        .update(articles)
        .set({
          title,
          originalContent: JSON.stringify(paragraphs),
          status: "translating",
          totalParagraphs: paragraphs.length,
          translationProgress: 0,
        })
        .where(eq(articles.id, articleId));

      console.log(`[${articleId}] Extracted ${paragraphs.length} paragraphs`);
    }

    // Phase 2: Translate in parallel
    // OpenAI allows 30,000+ RPM for gpt-5-mini, so we translate each chunk individually
    // This maximizes parallelism - each API call is fast, and we run many in parallel
    const MAX_PARALLEL = 15; // 15 parallel requests for speed
    const startIndex = translatedBlocks.length;
    const remainingParagraphs = paragraphs.slice(startIndex);

    // Update status to translating immediately so UI shows progress
    if (startIndex === 0) {
      await db
        .update(articles)
        .set({ status: "translating" })
        .where(eq(articles.id, articleId));
    }

    console.log(`[${articleId}] Starting translation: ${remainingParagraphs.length} chunks remaining`);

    // Process chunks in parallel waves
    // Each chunk gets its own API call for maximum speed
    for (let i = 0; i < remainingParagraphs.length; i += MAX_PARALLEL) {
      const wave = remainingParagraphs.slice(i, i + MAX_PARALLEL);
      const waveIndices = wave.map((_, idx) => startIndex + i + idx);

      console.log(`[${articleId}] Translating chunks ${i + 1}-${Math.min(i + MAX_PARALLEL, remainingParagraphs.length)} of ${remainingParagraphs.length} (${wave.length} parallel)`);

      // Run parallel translations - each chunk gets its own API call
      const results = await Promise.allSettled(
        wave.map((chunk) => translateBatch([chunk], targetLanguage, cefrLevel))
      );

      // Process results in order
      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const originalChunk = wave[j];

        if (result.status === "fulfilled" && result.value.length > 0) {
          translatedBlocks.push(result.value[0]);
        } else {
          // On failure, use original text as fallback and continue
          if (result.status === "rejected") {
            console.error(`[${articleId}] Chunk ${waveIndices[j] + 1} failed:`, result.reason);
          }
          translatedBlocks.push({
            original: originalChunk,
            translated: originalChunk, // Fallback to original
          });
        }
      }

      // Save progress after each wave
      const progress = Math.min(translatedBlocks.length, paragraphs.length);
      await db
        .update(articles)
        .set({
          translatedContent: JSON.stringify(translatedBlocks),
          translationProgress: progress,
        })
        .where(eq(articles.id, articleId));

      console.log(`[${articleId}] Progress: ${progress}/${paragraphs.length}`);
    }

    // Calculate word count
    const wordCount = translatedBlocks.reduce((acc, block) => {
      return acc + (block.translated?.split(/\s+/).length || 0);
    }, 0);

    // Mark as completed
    await db
      .update(articles)
      .set({
        translatedContent: JSON.stringify(translatedBlocks),
        status: "completed",
        wordCount,
        translationProgress: paragraphs.length,
      })
      .where(eq(articles.id, articleId));

    console.log(`[${articleId}] Translation completed! ${wordCount} words`);

  } catch (error) {
    console.error(`[${articleId}] Translation error:`, error);

    // Save progress and mark as failed
    await db
      .update(articles)
      .set({
        translatedContent: translatedBlocks.length > 0 ? JSON.stringify(translatedBlocks) : null,
        translationProgress: translatedBlocks.length,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Translation failed. You can retry to continue.",
      })
      .where(eq(articles.id, articleId));
  }
}

// POST - Start or resume article translation
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { url, targetLanguage, cefrLevel } = body;

    if (!url || !targetLanguage || !cefrLevel) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

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

    // Check if article already exists
    const existingArticle = await db.query.articles.findFirst({
      where: and(
        eq(articles.userId, user.id),
        eq(articles.sourceUrl, url),
        eq(articles.targetLanguage, targetLanguage),
        eq(articles.cefrLevel, cefrLevel)
      ),
    });

    // If completed, return immediately
    if (existingArticle?.status === "completed") {
      return NextResponse.json({ articleId: existingArticle.id, status: "completed" });
    }

    let articleId: string;
    let existingBlocks: TranslationBlock[] = [];
    let paragraphs: string[] = [];

    if (existingArticle) {
      // Resume existing article
      articleId = existingArticle.id;

      if (existingArticle.originalContent) {
        try {
          paragraphs = JSON.parse(existingArticle.originalContent);
        } catch {
          paragraphs = [];
        }
      }
      if (existingArticle.translatedContent) {
        try {
          existingBlocks = JSON.parse(existingArticle.translatedContent);
        } catch {
          existingBlocks = [];
        }
      }

      // Update status to indicate we're resuming
      const newStatus = paragraphs.length === 0 ? "fetching" : "translating";
      await db
        .update(articles)
        .set({ status: newStatus, errorMessage: null })
        .where(eq(articles.id, articleId));
    } else {
      // Create new article record
      const [newArticle] = await db
        .insert(articles)
        .values({
          userId: user.id,
          sourceUrl: url,
          targetLanguage,
          cefrLevel,
          status: "fetching",
        })
        .returning({ id: articles.id });
      articleId = newArticle.id;
    }

    // Start background processing (fire and forget)
    // The promise continues even after we return the response
    processTranslation(
      articleId,
      url,
      targetLanguage,
      cefrLevel,
      paragraphs,
      existingBlocks
    ).catch((error) => {
      console.error(`[${articleId}] Background processing error:`, error);
    });

    // Return immediately so the client can start polling
    return NextResponse.json({
      articleId,
      status: paragraphs.length === 0 ? "fetching" : "translating",
      progress: existingBlocks.length,
      total: paragraphs.length,
    });

  } catch (error) {
    console.error("Translation error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Translation failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}
