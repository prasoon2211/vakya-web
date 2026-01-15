import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";
import { db, users, articles } from "@/lib/db";
import { eq, and, sql } from "drizzle-orm";
import { getCefrGuidelines } from "@/lib/cefr-guidelines";
import {
  FetchError,
  ExtractionError,
  ContentTooShortError,
  toAppError,
  type ArticleStatus,
} from "@/lib/errors";
import {
  handleApiError,
  unauthorized,
  badRequest,
} from "@/lib/api-error-handler";
import { withTimeout } from "@/lib/utils/async";

// Lazy-init Gemini client
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
// Status Update Helper
// ============================================================================

async function updateArticleStatus(
  articleId: string,
  status: ArticleStatus,
  extras?: {
    title?: string;
    originalContent?: string;
    translatedContent?: string;
    sourceLanguage?: string;
    translationProgress?: number;
    totalParagraphs?: number;
    wordCount?: number;
    errorMessage?: string;
    errorCode?: string;
  }
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
// Fetch Logic
// ============================================================================

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = 30000
): Promise<Response> {
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

async function fetchHtmlDirect(
  url: string
): Promise<{ html: string; success: boolean; error?: string }> {
  try {
    const urlObj = new URL(url);
    const response = await fetchWithTimeout(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9,fr;q=0.8,de;q=0.7",
          "Cache-Control": "no-cache",
          Referer: urlObj.origin,
        },
      },
      30000
    );

    if (!response.ok) {
      return { html: "", success: false, error: `HTTP ${response.status}` };
    }

    const html = await response.text();
    if (!html || html.length < 500) {
      return { html: "", success: false, error: "Response too short" };
    }

    return { html, success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { html: "", success: false, error: message };
  }
}

async function fetchHtmlViaJina(
  url: string
): Promise<{ html: string; success: boolean; error?: string }> {
  try {
    const jinaUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;
    const response = await fetchWithTimeout(
      jinaUrl,
      {
        headers: {
          Authorization: `Bearer ${process.env.JINA_API_KEY}`,
          Accept: "text/html",
          "X-Return-Format": "html",
        },
      },
      45000
    );

    if (!response.ok) {
      return {
        html: "",
        success: false,
        error: `Jina HTTP ${response.status}`,
      };
    }

    const html = await response.text();
    if (!html || html.length < 500) {
      return { html: "", success: false, error: "Jina response too short" };
    }

    return { html, success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { html: "", success: false, error: message };
  }
}

async function fetchArticleHtml(
  url: string,
  articleId: string
): Promise<{ html: string; method: string }> {
  console.log(`[${articleId}] Trying direct fetch...`);
  const directResult = await fetchHtmlDirect(url);

  if (directResult.success) {
    console.log(
      `[${articleId}] Direct fetch succeeded (${directResult.html.length} bytes)`
    );
    return { html: directResult.html, method: "direct" };
  }

  console.log(
    `[${articleId}] Direct fetch failed: ${directResult.error}. Falling back to Jina...`
  );

  const jinaResult = await fetchHtmlViaJina(url);

  if (jinaResult.success) {
    console.log(
      `[${articleId}] Jina fetch succeeded (${jinaResult.html.length} bytes)`
    );
    return { html: jinaResult.html, method: "jina" };
  }

  console.log(`[${articleId}] Jina fetch also failed: ${jinaResult.error}`);
  throw new FetchError(
    url,
    `Direct: ${directResult.error}, Jina: ${jinaResult.error}`
  );
}

// ============================================================================
// Content Extraction
// ============================================================================

/**
 * Strip unnecessary HTML elements before parsing to speed up DOM creation
 * Removes scripts, styles, SVGs, comments, etc. that Readability doesn't need
 */
function stripUnnecessaryHtml(html: string): string {
  return (
    html
      // Remove script tags and contents
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      // Remove style tags and contents
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
      // Remove SVG tags and contents
      .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, "")
      // Remove noscript tags
      .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, "")
      // Remove HTML comments
      .replace(/<!--[\s\S]*?-->/g, "")
      // Remove inline event handlers
      .replace(/\s+on\w+="[^"]*"/gi, "")
      .replace(/\s+on\w+='[^']*'/gi, "")
  );
}

function extractArticleContent(
  html: string,
  url: string
): { title: string; content: string } | null {
  try {
    // Strip unnecessary content for faster parsing
    const strippedHtml = stripUnnecessaryHtml(html);

    // Use linkedom instead of jsdom for much faster parsing
    const { document } = parseHTML(strippedHtml);

    // Set document URL for Readability
    Object.defineProperty(document, "baseURI", { value: url });
    Object.defineProperty(document, "documentURI", { value: url });

    const reader = new Readability(document as unknown as Document);
    const article = reader.parse();

    if (!article) return null;

    const content = article.textContent || "";
    return {
      title: article.title || "Untitled",
      content,
    };
  } catch (error) {
    console.error("Readability extraction failed:", error);
    return null;
  }
}

// ============================================================================
// Site-Specific Configurations
// ============================================================================

interface SiteConfig {
  patterns: string[];
  noChunk?: boolean;
  skipReadability?: boolean;
  returnCleanOriginal?: boolean;
}

const SITE_CONFIGS: SiteConfig[] = [
  {
    patterns: ["lemonde.fr"],
    noChunk: true,
    skipReadability: true,
    returnCleanOriginal: true,
  },
];

function getSiteConfig(url: string): SiteConfig | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return (
      SITE_CONFIGS.find((config) =>
        config.patterns.some((pattern) => hostname.includes(pattern))
      ) || null
    );
  } catch {
    return null;
  }
}

// ============================================================================
// Chunking Logic
// ============================================================================

const CHUNK_CONFIG = {
  MIN_WORDS: 250,
  TARGET_WORDS: 1500,
  MAX_WORDS: 2500,
};

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

function splitAtSentences(text: string, maxWords: number): string[] {
  const normalizedText = text
    .replace(/([.!?])([A-Z])/g, "$1 $2")
    .replace(/([.!?])(["'])([A-Z])/g, "$1$2 $3");

  const sentencePattern = /[^.!?]*[.!?]+[\s]*/g;
  const matches: string[] = normalizedText.match(sentencePattern) || [];

  const matchedLength = matches.join("").length;
  if (matchedLength < normalizedText.length) {
    const remaining = normalizedText.slice(matchedLength).trim();
    if (remaining) matches.push(remaining);
  }

  const sentences = matches.length > 0 ? matches : [text];
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
// Language Detection
// ============================================================================

async function detectLanguage(text: string): Promise<string> {
  const gemini = getGemini();
  if (!gemini) return "Unknown";

  const sample = text.slice(0, 500);
  const prompt = `Detect the language of the following text. Return ONLY the language name in English (e.g., "German", "French", "Spanish"). No explanation.

Text:
${sample}`;

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
      return (
        normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase()
      );
    }
  } catch (error) {
    console.error("Language detection error:", error);
  }

  return "Unknown";
}

// ============================================================================
// Translation
// ============================================================================

async function translateChunk(
  text: string,
  targetLanguage: string,
  cefrLevel: string,
  options?: { returnCleanOriginal?: boolean }
): Promise<TranslationBlock> {
  const gemini = getGemini();
  if (!gemini) {
    console.error("Gemini client not available");
    return { original: text, translated: text };
  }

  const levelGuidelines = getCefrGuidelines(targetLanguage, cefrLevel);
  const returnCleanOriginal = options?.returnCleanOriginal ?? false;

  const outputInstructions = returnCleanOriginal
    ? `Output JSON:
{
  "original": "cleaned source text (no HTML/ads)",
  "translated": "your ${targetLanguage} translation",
  "bridge": "literal English translation of your ${targetLanguage} output"
}`
    : `Output JSON:
{
  "original": "source text unchanged",
  "translated": "your ${targetLanguage} translation",
  "bridge": "literal English translation of your ${targetLanguage} output"
}`;

  const prompt = `Translate into ${targetLanguage} at ${cefrLevel} level.

Keep the translation faithful:
- Same meaning, same structure, same perspective
- Quotes stay as quotes (don't convert to indirect speech)
- First-person stays first-person

Content rules:
- INCLUDE: Article text, quotes, analysis, factual content
- EXCLUDE: Navigation links, timestamps, "read more" prompts, subscription CTAs, breadcrumbs, author bios, social sharing text

${cefrLevel} language constraints:
${levelGuidelines}

${outputInstructions}

Text:
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
        const originalText =
          returnCleanOriginal && parsed.original && parsed.original.length > 50
            ? parsed.original
            : text;
        return {
          original: originalText,
          translated: parsed.translated,
          bridge: parsed.bridge || undefined,
        };
      }
    }
  } catch (error) {
    console.error("Translation chunk error:", error);
  }

  return { original: text, translated: text };
}

// ============================================================================
// Background Processing
// ============================================================================

async function processTranslation(
  articleId: string,
  sourceUrl: string,
  targetLanguage: string,
  cefrLevel: string,
  existingParagraphs: string[],
  existingBlocks: TranslationBlock[]
) {
  let paragraphs = existingParagraphs;
  const translatedBlocks = [...existingBlocks];
  let title = "Untitled";

  const siteConfig = getSiteConfig(sourceUrl);

  try {
    // Phase 1: Fetch content if needed
    if (paragraphs.length === 0) {
      await updateArticleStatus(articleId, "fetching");
      console.log(`[${articleId}] Fetching article from ${sourceUrl}`);

      const fetchResult = await fetchArticleHtml(sourceUrl, articleId);

      // Phase 2: Extract content
      await updateArticleStatus(articleId, "extracting");

      let contentForTranslation: string;

      if (siteConfig?.skipReadability) {
        console.log(`[${articleId}] Skipping Readability - passing HTML to AI`);
        contentForTranslation = fetchResult.html;
        const titleMatch = fetchResult.html.match(
          /<title[^>]*>([^<]+)<\/title>/i
        );
        title = titleMatch
          ? titleMatch[1].replace(/\s*[-|].*$/, "").trim()
          : "Untitled";
      } else {
        const extracted = extractArticleContent(fetchResult.html, sourceUrl);

        if (!extracted || !extracted.content) {
          throw new ExtractionError("Readability returned no content");
        }

        if (extracted.content.length < 100) {
          throw new ContentTooShortError(extracted.content.length, 100);
        }

        title = extracted.title;
        contentForTranslation = extracted.content;
      }

      // Phase 3: Detect language
      await updateArticleStatus(articleId, "detecting", { title });
      console.log(`[${articleId}] Detecting source language...`);

      const textSample = siteConfig?.skipReadability
        ? contentForTranslation.replace(/<[^>]+>/g, " ").slice(0, 1000)
        : contentForTranslation.slice(0, 1000);
      const sourceLanguage = await detectLanguage(textSample);
      console.log(`[${articleId}] Detected: ${sourceLanguage}`);

      // Chunk content
      if (siteConfig?.noChunk) {
        paragraphs = [contentForTranslation];
      } else {
        paragraphs = smartChunkContent(contentForTranslation);
      }

      console.log(`[${articleId}] ${paragraphs.length} chunks to translate`);

      // Save original content and update status
      await updateArticleStatus(articleId, "translating", {
        title,
        originalContent: JSON.stringify(paragraphs),
        sourceLanguage,
        totalParagraphs: paragraphs.length,
        translationProgress: 0,
      });
    } else {
      // Resuming - just update status
      await updateArticleStatus(articleId, "translating");
    }

    // Phase 4: Translate in parallel waves
    const MAX_PARALLEL = 15;
    const startIndex = translatedBlocks.length;
    const remainingParagraphs = paragraphs.slice(startIndex);

    console.log(
      `[${articleId}] Starting translation: ${remainingParagraphs.length} chunks remaining`
    );

    for (let i = 0; i < remainingParagraphs.length; i += MAX_PARALLEL) {
      const wave = remainingParagraphs.slice(i, i + MAX_PARALLEL);

      console.log(
        `[${articleId}] Translating chunks ${i + 1}-${Math.min(
          i + MAX_PARALLEL,
          remainingParagraphs.length
        )}`
      );

      const translateOptions = siteConfig?.returnCleanOriginal
        ? { returnCleanOriginal: true }
        : undefined;

      const results = await Promise.allSettled(
        wave.map((chunk) =>
          translateChunk(chunk, targetLanguage, cefrLevel, translateOptions)
        )
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const originalChunk = wave[j];

        if (result.status === "fulfilled") {
          const block = result.value;
          if (block.translated && block.translated.trim().length > 0) {
            translatedBlocks.push(block);
          } else {
            console.log(`[${articleId}] Chunk filtered (non-article content)`);
          }
        } else {
          console.error(`[${articleId}] Chunk failed:`, result.reason);
          translatedBlocks.push({
            original: originalChunk,
            translated: originalChunk,
          });
        }
      }

      // Save progress after each wave
      const progress = Math.min(
        startIndex + i + MAX_PARALLEL,
        paragraphs.length
      );
      await db
        .update(articles)
        .set({
          translatedContent: JSON.stringify(translatedBlocks),
          translationProgress: progress,
          updatedAt: new Date(),
        })
        .where(eq(articles.id, articleId));

      console.log(`[${articleId}] Progress: ${progress}/${paragraphs.length}`);
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

    console.log(`[${articleId}] Translation completed! ${wordCount} words`);
  } catch (error) {
    console.error(`[${articleId}] Translation error:`, error);

    // Save progress even on failure
    if (translatedBlocks.length > 0) {
      await db
        .update(articles)
        .set({
          translatedContent: JSON.stringify(translatedBlocks),
          translationProgress: translatedBlocks.length,
        })
        .where(eq(articles.id, articleId));
    }

    await markArticleFailed(articleId, error);
  }
}

async function processTextTranslation(
  articleId: string,
  paragraphs: string[],
  targetLanguage: string,
  cefrLevel: string
) {
  const translatedBlocks: TranslationBlock[] = [];

  try {
    await updateArticleStatus(articleId, "translating");

    const MAX_PARALLEL = 15;

    console.log(
      `[${articleId}] Starting text translation: ${paragraphs.length} chunks`
    );

    for (let i = 0; i < paragraphs.length; i += MAX_PARALLEL) {
      const wave = paragraphs.slice(i, i + MAX_PARALLEL);

      console.log(
        `[${articleId}] Translating chunks ${i + 1}-${Math.min(
          i + MAX_PARALLEL,
          paragraphs.length
        )}`
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

      // Save progress
      await db
        .update(articles)
        .set({
          translatedContent: JSON.stringify(translatedBlocks),
          translationProgress: translatedBlocks.length,
          updatedAt: new Date(),
        })
        .where(eq(articles.id, articleId));

      console.log(
        `[${articleId}] Progress: ${translatedBlocks.length}/${paragraphs.length}`
      );
    }

    const wordCount = translatedBlocks.reduce((acc, block) => {
      return acc + (block.translated?.split(/\s+/).length || 0);
    }, 0);

    await updateArticleStatus(articleId, "completed", {
      translatedContent: JSON.stringify(translatedBlocks),
      wordCount,
      translationProgress: paragraphs.length,
    });

    console.log(
      `[${articleId}] Text translation completed! ${wordCount} words`
    );
  } catch (error) {
    console.error(`[${articleId}] Text translation error:`, error);

    if (translatedBlocks.length > 0) {
      await db
        .update(articles)
        .set({
          translatedContent: JSON.stringify(translatedBlocks),
          translationProgress: translatedBlocks.length,
        })
        .where(eq(articles.id, articleId));
    }

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

    const body = await request.json();
    const { type = "url", url, text, title, targetLanguage, cefrLevel } = body;

    // Validate input
    if (type === "url") {
      if (!url || !targetLanguage || !cefrLevel) {
        return badRequest(
          "Missing required fields: url, targetLanguage, cefrLevel"
        );
      }
      try {
        new URL(url);
      } catch {
        return badRequest("Invalid URL format");
      }
    } else if (type === "text") {
      if (!text || !title || !targetLanguage || !cefrLevel) {
        return badRequest(
          "Missing required fields: text, title, targetLanguage, cefrLevel"
        );
      }
      if (text.trim().length < 50) {
        return badRequest("Text must be at least 50 characters");
      }
    } else {
      return badRequest("Invalid type. Use 'url' or 'text'");
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

    // Handle text input
    if (type === "text") {
      const paragraphs = smartChunkContent(text);
      const sourceLanguage = await detectLanguage(text.slice(0, 500));

      // Create article immediately with "queued" status, then update to "translating"
      const [newArticle] = await db
        .insert(articles)
        .values({
          userId: user.id,
          sourceType: "text",
          sourceUrl: null,
          title: title,
          originalContent: JSON.stringify(paragraphs),
          sourceLanguage,
          targetLanguage,
          cefrLevel,
          status: "queued",
          totalParagraphs: paragraphs.length,
          translationProgress: 0,
        })
        .returning({ id: articles.id });

      const articleId = newArticle.id;

      // Start background processing
      processTextTranslation(
        articleId,
        paragraphs,
        targetLanguage,
        cefrLevel
      ).catch((error) => {
        console.error(`[${articleId}] Background processing error:`, error);
      });

      return NextResponse.json({
        articleId,
        status: "queued",
        progress: 0,
        total: paragraphs.length,
        title,
      });
    }

    // URL handling
    // Check for existing article with same URL/language/level
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
      return NextResponse.json({
        articleId: existingArticle.id,
        status: "completed",
        isExisting: true,
      });
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

      // Clear error state and update status
      const newStatus = paragraphs.length === 0 ? "queued" : "translating";
      await db
        .update(articles)
        .set({
          status: newStatus,
          errorMessage: null,
          errorCode: null,
          updatedAt: new Date(),
        })
        .where(eq(articles.id, articleId));

      console.log(
        `[${articleId}] Resuming article (${existingBlocks.length}/${paragraphs.length} done)`
      );
    } else {
      // Create new article immediately with "queued" status
      // This ensures the article appears in the user's list right away
      const [newArticle] = await db
        .insert(articles)
        .values({
          userId: user.id,
          sourceType: "url",
          sourceUrl: url,
          title: url, // Placeholder title until we fetch
          targetLanguage,
          cefrLevel,
          status: "queued",
        })
        .returning({ id: articles.id });

      articleId = newArticle.id;
      console.log(`[${articleId}] Created new article for ${url}`);
    }

    // Start background processing
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

    // Return immediately
    return NextResponse.json({
      articleId,
      status: "queued",
      progress: existingBlocks.length,
      total: paragraphs.length,
    });
  } catch (error) {
    return handleApiError(error, "Translation");
  }
}
