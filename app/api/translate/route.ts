import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { db, users, articles } from "@/lib/db";
import { eq, and } from "drizzle-orm";

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
  // Custom extraction hints (future use)
  extractionHints?: string;
}

const SITE_CONFIGS: SiteConfig[] = [
  {
    // Le Monde: Tons of paywall/device garbage that confuses chunking
    patterns: ['lemonde.fr'],
    noChunk: true,
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

// CEFR level-specific translation guidelines
const CEFR_GUIDELINES: Record<string, string> = {
  A1: `A1 (Beginner) - STRICT SIMPLIFICATION REQUIRED:
• Maximum 8-10 words per sentence
• ONLY simple main clauses (Subject-Verb-Object)
• NO subordinate clauses (no weil, dass, wenn, obwohl, etc.)
• Present tense ONLY
• Connectors limited to: und, oder, aber
• NO passive voice, NO relative clauses
• Break every complex sentence into multiple simple ones
• Use only the 500 most common words`,

  A2: `A2 (Elementary) - SIGNIFICANT SIMPLIFICATION:
• Maximum 12-15 words per sentence
• At most ONE subordinate clause per sentence
• Tenses: present + Perfekt (simple past)
• Allowed connectors: und, oder, aber, weil, dass, wenn
• NO passive voice
• Simple relative clauses (der/die/das) sparingly
• Break long sentences into 2-3 shorter ones
• Use common everyday vocabulary (~1500 words)`,

  B1: `B1 (Intermediate) - MODERATE SIMPLIFICATION:
• Maximum 18-20 words per sentence
• Up to TWO subordinate clauses per sentence
• All common tenses including future
• Connectors: weil, dass, wenn, obwohl, damit, nachdem, bevor
• Simple passive voice acceptable
• Relative clauses acceptable
• Can express opinions and reasoning
• Break very long sentences (3+ clauses) into shorter ones
• Intermediate vocabulary (~3000 words)`,

  B2: `B2 (Upper-Intermediate) - LIGHT SIMPLIFICATION:
• Maximum 25 words per sentence
• Complex sentence structures allowed
• All tenses including Konjunktiv II
• Idiomatic expressions acceptable
• Passive voice freely used
• Only break extremely long sentences (4+ nested clauses)
• Upper-intermediate vocabulary, some abstract terms`,

  C1: `C1 (Advanced) - MINIMAL CHANGES:
• Near-native sentence complexity allowed
• All grammatical structures permitted
• Nuanced and sophisticated expression
• Only simplify if truly incomprehensible
• Advanced vocabulary, abstract concepts OK`,

  C2: `C2 (Mastery) - PRESERVE ORIGINAL STYLE:
• Native-level complexity preserved
• Literary and journalistic style maintained
• Minimal intervention, translate naturally
• Full vocabulary range`,
};

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
  cefrLevel: string
): Promise<TranslationBlock> {
  const gemini = getGemini();
  if (!gemini) {
    console.error("Gemini client not available - missing GOOGLE_AI_API_KEY");
    return { original: text, translated: text };
  }

  const levelGuidelines = CEFR_GUIDELINES[cefrLevel] || CEFR_GUIDELINES.B1;

  const prompt = `Translate/adapt article text into ${targetLanguage} for a ${cefrLevel} learner.

## ${levelGuidelines}

## CRITICAL: This text is web-scraped and contains GARBAGE mixed with the article.

Your job: Extract and translate ONLY the actual news/article content. DISCARD everything else.

REAL ARTICLE CONTENT (translate this):
- Journalist-written news paragraphs
- Quotes from people in the news
- Factual reporting about events

GARBAGE - DO NOT TRANSLATE, DO NOT INCLUDE (return empty string):
- ANY text about subscriptions, accounts, logging in, signing up
- ANY text about reading on multiple devices or device limits
- ANY text asking "How to not see this message?" or similar FAQ
- ANY text about passwords, account sharing, or family plans
- Navigation breadcrumbs or repeated category names
- Social media prompts
- Cookie notices
- Author bylines like "Le Monde avec AFP" or "By [name]"

BE AGGRESSIVE: If text discusses accounts, devices, subscriptions, passwords, or login - it is GARBAGE, not article content. Real news articles don't talk about these things.

If this chunk has NO real article content, return: {"original": "...", "translated": ""}

## Translation:
1. Extract ONLY genuine journalism
2. Adapt complexity for ${cefrLevel}
3. Break long sentences if needed

Return JSON: {"original": "...", "translated": "extracted and translated article content OR empty string if all garbage"}

Text:
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
          return { original: text, translated: parsed.translated };
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

      const fetchResult = await fetchArticleHtml(sourceUrl, articleId);

      if (!fetchResult) {
        await db
          .update(articles)
          .set({ status: "failed", errorMessage: "Failed to fetch article content from both direct and Jina methods" })
          .where(eq(articles.id, articleId));
        return;
      }

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

      // Check for site-specific config
      const siteConfig = getSiteConfig(sourceUrl);

      // Chunk or not based on site config
      if (siteConfig?.noChunk) {
        // Problematic site - send full content as single chunk
        paragraphs = [extracted.content];
        console.log(`[${articleId}] Site config: noChunk=true for ${new URL(sourceUrl).hostname}`);
        console.log(`[${articleId}] Sending full content as single chunk: ${countWords(extracted.content)} words`);
      } else {
        // Normal site - smart chunk for parallel processing
        paragraphs = smartChunkContent(extracted.content);
        console.log(`[${articleId}] Smart chunking: ${countWords(extracted.content)} words → ${paragraphs.length} chunks`);
        console.log(`[${articleId}] Chunk sizes: ${paragraphs.map(p => countWords(p)).join(', ')} words`);
      }

      // Detect source language
      console.log(`[${articleId}] Detecting source language...`);
      const detectStart = Date.now();
      const sourceLanguage = await detectLanguage(extracted.content);
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
      const results = await Promise.allSettled(
        wave.map((chunk) => translateBatch([chunk], targetLanguage, cefrLevel))
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
