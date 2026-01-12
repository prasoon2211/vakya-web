import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { db, users, articles } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { getCefrGuidelines } from "@/lib/cefr-guidelines";

// Lazy-init Gemini client
let geminiClient: GoogleGenAI | null = null;
function getGemini() {
  if (!geminiClient && process.env.GOOGLE_AI_API_KEY) {
    geminiClient = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });
  }
  return geminiClient;
}

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

// Direct HTML fetch with browser-like headers
async function fetchHtmlDirect(url: string): Promise<{ html: string; success: boolean; error?: string }> {
  try {
    // Parse URL to get the origin for Referer header
    const urlObj = new URL(url);

    const response = await fetchWithTimeout(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "Accept-Language": "en-US,en;q=0.9,fr;q=0.8,de;q=0.7",
        "Accept-Encoding": "gzip, deflate, br, zstd",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Referer": urlObj.origin,
        "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"macOS"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
      },
    }, 30000);

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

// Jina AI fetch (fallback)
async function fetchHtmlViaJina(url: string): Promise<{ html: string; success: boolean; error?: string }> {
  try {
    const jinaUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;
    const response = await fetchWithTimeout(jinaUrl, {
      headers: {
        Authorization: `Bearer ${process.env.JINA_API_KEY}`,
        Accept: "text/html",
        "X-Return-Format": "html",
      },
    }, 45000);

    if (!response.ok) {
      return { html: "", success: false, error: `Jina HTTP ${response.status}` };
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

// Fetch article HTML with fallback strategy
async function fetchArticleHtml(url: string, articleId: string): Promise<{ html: string; method: string } | null> {
  // Try direct fetch first
  console.log(`[${articleId}] Trying direct fetch...`);
  const directResult = await fetchHtmlDirect(url);

  if (directResult.success) {
    console.log(`[${articleId}] Direct fetch succeeded (${directResult.html.length} bytes)`);
    return { html: directResult.html, method: "direct" };
  }

  console.log(`[${articleId}] Direct fetch failed: ${directResult.error}. Falling back to Jina...`);

  // Fall back to Jina
  const jinaResult = await fetchHtmlViaJina(url);

  if (jinaResult.success) {
    console.log(`[${articleId}] Jina fetch succeeded (${jinaResult.html.length} bytes)`);
    return { html: jinaResult.html, method: "jina" };
  }

  console.log(`[${articleId}] Jina fetch also failed: ${jinaResult.error}`);
  return null;
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

// Site-specific configurations for problematic websites
interface SiteConfig {
  // Match patterns (hostname includes)
  patterns: string[];
  // Don't chunk - send full article to AI in one request
  noChunk?: boolean;
  // Skip Readability extraction - pass raw HTML to AI instead
  skipReadability?: boolean;
  // When true, AI returns cleaned original text (useful when sending raw HTML)
  returnCleanOriginal?: boolean;
  // Custom extraction hints (future use)
  extractionHints?: string;
}

const SITE_CONFIGS: SiteConfig[] = [
  {
    // Le Monde: Readability often fails or extracts poorly
    // Skip Readability entirely, send raw HTML to AI for extraction
    patterns: ['lemonde.fr'],
    noChunk: true,
    skipReadability: true,
    returnCleanOriginal: true, // AI returns cleaned original text
  },
  // Add more problematic sites here as needed:
  // {
  //   patterns: ['nytimes.com'],
  //   noChunk: true,
  // },
];

function getSiteConfig(url: string): SiteConfig | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return SITE_CONFIGS.find(config =>
      config.patterns.some(pattern => hostname.includes(pattern))
    ) || null;
  } catch {
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

// Detect the language of text using Gemini
async function detectLanguage(text: string): Promise<string> {
  const gemini = getGemini();
  if (!gemini) {
    console.error("Gemini client not available for language detection");
    return "Unknown";
  }

  // Use first 500 chars for detection (faster, usually enough)
  const sample = text.slice(0, 500);

  const prompt = `Detect the language of the following text. Return ONLY the language name in English (e.g., "German", "French", "Spanish", "English", "Italian", etc.). No explanation, just the language name.

Text:
${sample}`;

  try {
    const response = await gemini.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    const detected = response.text?.trim();
    if (detected) {
      // Normalize common variations
      const normalized = detected.replace(/[^a-zA-Z]/g, '');
      return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
    }
  } catch (error) {
    console.error("Language detection error:", error);
  }

  return "Unknown";
}

// Translate a single chunk of text using Gemini 3 Flash
async function translateChunk(
  text: string,
  targetLanguage: string,
  cefrLevel: string,
  options?: { returnCleanOriginal?: boolean }
): Promise<TranslationBlock> {
  const gemini = getGemini();
  if (!gemini) {
    console.error("Gemini client not available - missing GOOGLE_AI_API_KEY");
    return { original: text, translated: text };
  }

  // Get comprehensive CEFR guidelines (generic + language-specific)
  const levelGuidelines = getCefrGuidelines(targetLanguage, cefrLevel);

  // Determine output format based on options
  const returnCleanOriginal = options?.returnCleanOriginal ?? false;

  const outputInstructions = returnCleanOriginal
    ? `Return JSON format:
{
  "original": "the CLEAN extracted article text in the SOURCE language (no HTML, no garbage - just the article paragraphs)",
  "translated": "the complete adapted ${targetLanguage} text at ${cefrLevel} level"
}

IMPORTANT: The "original" field must contain the clean, readable source article text - NOT HTML, NOT a summary.`
    : `Return JSON format:
{
  "original": "brief description of source content",
  "translated": "the complete adapted ${targetLanguage} text at ${cefrLevel} level covering all main points"
}`;

  const prompt = `You are a professional language learning content adapter. Your job is to extract article content and translate/adapt it into ${targetLanguage} for a ${cefrLevel} learner.

${levelGuidelines}

---

## CONTENT EXTRACTION RULES

The input may be either:
- Raw HTML from a news website (extract the article text, ignore all HTML tags/markup)
- Plain text that's already been extracted

From either format, extract ONLY the main article content.

INCLUDE (extract and translate):
- News paragraphs and journalism
- Quotes and statements from people
- Factual information and reporting
- Analysis and commentary
- ALL important details, quotes, and context from the article

EXCLUDE completely (ignore, do not translate):
- HTML tags, scripts, styles, metadata
- Subscription/paywall prompts
- Login/signup requests
- Navigation, menus, footers
- Cookie notices
- Social media buttons
- "Read also" / "Lire aussi" links
- Advertisements

If the input contains ONLY non-article content, return: {"original": "", "translated": ""}

---

## YOUR TASK

1. If input is HTML: extract the article text first (ignore all HTML markup)
2. Identify ALL key points, quotes, and facts from the article
3. Translate/adapt into ${targetLanguage} at ${cefrLevel} level
4. Apply ALL grammar and vocabulary constraints from the guidelines above
5. IMPORTANT: Capture all significant information - don't over-summarize

${outputInstructions}

---

INPUT:
${text}`;

  try {
    const response = await gemini.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const content = response.text;
    if (content) {
      try {
        const parsed = JSON.parse(content);
        if (parsed.translated) {
          // Use AI's cleaned original if returnCleanOriginal is enabled and AI provided it
          const originalText = (returnCleanOriginal && parsed.original && parsed.original.length > 50)
            ? parsed.original
            : text;
          return { original: originalText, translated: parsed.translated };
        }
      } catch {
        // If parsing fails, return original as translated (fallback)
        console.error("Failed to parse AI response as JSON");
      }
    }
  } catch (error) {
    console.error("Gemini translation error:", error);
  }

  // Fallback: return original text as translation
  return { original: text, translated: text };
}

// Wrapper for backward compatibility (translates array of chunks)
async function translateBatch(
  batch: string[],
  targetLanguage: string,
  cefrLevel: string,
  options?: { returnCleanOriginal?: boolean }
): Promise<TranslationBlock[]> {
  // For single chunk (our main use case now), call directly
  if (batch.length === 1) {
    const result = await translateChunk(batch[0], targetLanguage, cefrLevel, options);
    return [result];
  }

  // For multiple chunks, translate each
  const results = await Promise.all(
    batch.map(chunk => translateChunk(chunk, targetLanguage, cefrLevel, options))
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

  // Check for site-specific config (used in both Phase 1 and Phase 2)
  const siteConfig = getSiteConfig(sourceUrl);

  try {
    // Phase 1: Fetch content if needed
    if (paragraphs.length === 0) {
      console.log(`[${articleId}] Fetching article from ${sourceUrl}`);

      if (siteConfig) {
        console.log(`[${articleId}] Site config found for ${new URL(sourceUrl).hostname}: noChunk=${siteConfig.noChunk}, skipReadability=${siteConfig.skipReadability}, returnCleanOriginal=${siteConfig.returnCleanOriginal}`);
      }

      const fetchResult = await fetchArticleHtml(sourceUrl, articleId);

      if (!fetchResult) {
        await db
          .update(articles)
          .set({ status: "failed", errorMessage: "Failed to fetch article content from both direct and Jina methods" })
          .where(eq(articles.id, articleId));
        return;
      }

      let contentForTranslation: string;

      // For sites where Readability fails/is problematic, pass raw HTML to AI
      if (siteConfig?.skipReadability) {
        console.log(`[${articleId}] Skipping Readability - passing HTML directly to AI (${fetchResult.html.length} bytes)`);
        // Pass the raw HTML - AI will extract the article content
        contentForTranslation = fetchResult.html;
        // Try to extract title from HTML
        const titleMatch = fetchResult.html.match(/<title[^>]*>([^<]+)<\/title>/i);
        title = titleMatch ? titleMatch[1].replace(/\s*[-|].*$/, '').trim() : "Untitled";
      } else {
        // Normal path: Use Readability for extraction
        console.log(`[${articleId}] Extracting with Readability...`);
        const extractStart = Date.now();
        const extracted = extractArticleContent(fetchResult.html, sourceUrl);
        console.log(`[${articleId}] Readability took ${Date.now() - extractStart}ms`);

        if (!extracted || !extracted.content || extracted.content.length < 100) {
          await db
            .update(articles)
            .set({ status: "failed", errorMessage: "Article content too short or couldn't be extracted" })
            .where(eq(articles.id, articleId));
          return;
        }

        title = extracted.title;
        contentForTranslation = extracted.content;
      }

      // Chunk or not based on site config
      if (siteConfig?.noChunk) {
        // Problematic site - send full content as single chunk
        paragraphs = [contentForTranslation];
        console.log(`[${articleId}] Site config: noChunk=true`);
        console.log(`[${articleId}] Sending full content as single chunk: ${contentForTranslation.length} chars`);
      } else {
        // Normal site - smart chunk for parallel processing
        paragraphs = smartChunkContent(contentForTranslation);
        console.log(`[${articleId}] Smart chunking: ${countWords(contentForTranslation)} words → ${paragraphs.length} chunks`);
        console.log(`[${articleId}] Chunk sizes: ${paragraphs.map(p => countWords(p)).join(', ')} words`);
      }

      // Detect source language (use first 1000 chars of content, not HTML)
      const textSample = siteConfig?.skipReadability
        ? contentForTranslation.replace(/<[^>]+>/g, ' ').slice(0, 1000)
        : contentForTranslation.slice(0, 1000);
      console.log(`[${articleId}] Detecting source language...`);
      const detectStart = Date.now();
      const sourceLanguage = await detectLanguage(textSample);
      console.log(`[${articleId}] Detected source language: ${sourceLanguage} (took ${Date.now() - detectStart}ms)`);

      // Note: Even if source = target, we still process through AI to:
      // 1. Clean garbage (paywall messages, navigation, etc.)
      // 2. Adjust complexity for CEFR level

      // Save original content and update status
      await db
        .update(articles)
        .set({
          title,
          originalContent: JSON.stringify(paragraphs),
          sourceLanguage,
          status: "translating",
          totalParagraphs: paragraphs.length,
          translationProgress: 0,
        })
        .where(eq(articles.id, articleId));

      console.log(`[${articleId}] Extracted ${paragraphs.length} paragraphs`);
    }

    // Phase 2: Translate in parallel using Gemini 3 Flash
    // Each chunk gets its own API call for maximum parallelism
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
      const translateOptions = siteConfig?.returnCleanOriginal ? { returnCleanOriginal: true } : undefined;
      const results = await Promise.allSettled(
        wave.map((chunk) => translateBatch([chunk], targetLanguage, cefrLevel, translateOptions))
      );

      // Process results in order
      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const originalChunk = wave[j];

        if (result.status === "fulfilled" && result.value.length > 0) {
          const block = result.value[0];
          // Skip blocks where AI determined it was non-article content (empty translation)
          if (block.translated && block.translated.trim().length > 0) {
            translatedBlocks.push(block);
          } else {
            console.log(`[${articleId}] Chunk ${waveIndices[j] + 1} filtered out (non-article content)`);
          }
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

// Background translation for text input (simpler - no fetching needed)
async function processTextTranslation(
  articleId: string,
  paragraphs: string[],
  targetLanguage: string,
  cefrLevel: string
) {
  const translatedBlocks: TranslationBlock[] = [];

  try {
    const MAX_PARALLEL = 15;

    console.log(`[${articleId}] Starting text translation: ${paragraphs.length} chunks`);

    // Process chunks in parallel waves
    for (let i = 0; i < paragraphs.length; i += MAX_PARALLEL) {
      const wave = paragraphs.slice(i, i + MAX_PARALLEL);

      console.log(`[${articleId}] Translating chunks ${i + 1}-${Math.min(i + MAX_PARALLEL, paragraphs.length)} of ${paragraphs.length}`);

      const results = await Promise.allSettled(
        wave.map((chunk) => translateBatch([chunk], targetLanguage, cefrLevel))
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const originalChunk = wave[j];

        if (result.status === "fulfilled" && result.value.length > 0) {
          const block = result.value[0];
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
        })
        .where(eq(articles.id, articleId));

      console.log(`[${articleId}] Progress: ${translatedBlocks.length}/${paragraphs.length}`);
    }

    // Calculate word count and mark complete
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

    console.log(`[${articleId}] Text translation completed! ${wordCount} words`);

  } catch (error) {
    console.error(`[${articleId}] Text translation error:`, error);

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

// POST - Start or resume article translation
// Supports: URL (default), text input
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { type = "url", url, text, title, targetLanguage, cefrLevel } = body;

    // Validate based on input type
    if (type === "url") {
      if (!url || !targetLanguage || !cefrLevel) {
        return NextResponse.json(
          { error: "Missing required fields" },
          { status: 400 }
        );
      }
    } else if (type === "text") {
      if (!text || !title || !targetLanguage || !cefrLevel) {
        return NextResponse.json(
          { error: "Missing required fields: text, title, targetLanguage, cefrLevel" },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: "Invalid type. Use 'url' or 'text'" },
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

    // Handle text input differently - no deduplication needed, always create new
    if (type === "text") {
      // Create new article directly with content
      const paragraphs = smartChunkContent(text);

      // Detect source language
      const sourceLanguage = await detectLanguage(text.slice(0, 500));

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
          status: "translating",
          totalParagraphs: paragraphs.length,
          translationProgress: 0,
        })
        .returning({ id: articles.id });

      const articleId = newArticle.id;

      // Start translation in background
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
        status: "translating",
        progress: 0,
        total: paragraphs.length,
      });
    }

    // URL handling (existing logic)
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
          sourceType: "url",
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
