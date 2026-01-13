#!/usr/bin/env npx tsx

/**
 * Test script to see how content gets chunked for translation
 *
 * Usage:
 *   npx tsx scripts/test-chunking.ts <url>
 */

import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

const url = process.argv[2];

if (!url) {
  console.error("Usage: npx tsx scripts/test-chunking.ts <url>");
  process.exit(1);
}

// Chunking config from route.ts
const CHUNK_CONFIG = {
  MIN_WORDS: 50,
  TARGET_WORDS: 250,
  MAX_WORDS: 500,
};

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

function splitAtSentences(text: string, targetWords: number): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+\s*/g) || [text];
  const chunks: string[] = [];
  let current = '';
  let currentWords = 0;

  for (const sentence of sentences) {
    const sentenceWords = countWords(sentence);

    if (currentWords + sentenceWords > targetWords && current.length > 0) {
      chunks.push(current.trim());
      current = sentence;
      currentWords = sentenceWords;
    } else {
      current += sentence;
      currentWords += sentenceWords;
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

  console.log(`\n📊 Initial paragraph split: ${segments.length} segments`);
  segments.forEach((s, i) => {
    console.log(`   Segment ${i + 1}: ${countWords(s)} words`);
  });

  // If no double newlines, try single newlines for very long content
  if (segments.length <= 1 && countWords(content) > MAX_WORDS) {
    console.log(`\n⚠️  Only 1 segment with ${countWords(content)} words > MAX_WORDS (${MAX_WORDS})`);
    console.log(`   Trying single newline split...`);

    segments = content
      .split(/\n+/)
      .map(p => p.trim())
      .filter(p => p.length > 0);

    console.log(`   After single newline split: ${segments.length} segments`);
  }

  // Step 2: Split oversized segments at sentence boundaries
  const beforeSplit = segments.length;
  segments = segments.flatMap(segment => {
    const words = countWords(segment);
    if (words <= MAX_WORDS) {
      return [segment];
    }
    console.log(`\n📝 Splitting oversized segment (${words} words) at sentence boundaries...`);
    return splitAtSentences(segment, TARGET_WORDS);
  });

  if (segments.length !== beforeSplit) {
    console.log(`   After sentence split: ${segments.length} segments`);
  }

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
      bufferWords < MIN_WORDS ||
      segmentWords < MIN_WORDS ||
      (bufferWords < TARGET_WORDS && segmentWords < TARGET_WORDS && bufferWords + segmentWords <= MAX_WORDS);

    if (shouldMerge && bufferWords + segmentWords <= MAX_WORDS) {
      buffer = buffer + '\n\n' + segment;
      bufferWords += segmentWords;
    } else {
      merged.push(buffer);
      buffer = segment;
      bufferWords = segmentWords;
    }
  }

  if (buffer.length > 0) {
    merged.push(buffer);
  }

  // Step 4: Handle trailing small chunk
  if (merged.length >= 2) {
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

  return merged;
}

async function fetchHtml(url: string): Promise<string> {
  console.log(`\n📡 Fetching: ${url}\n`);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    console.log(`✓ Fetched ${html.length} bytes\n`);
    return html;
  } catch (error) {
    console.error(`✗ Fetch failed: ${error}`);
    process.exit(1);
  }
  return "";
}

function extractWithReadability(html: string, url: string) {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  return reader.parse();
}

async function main() {
  const html = await fetchHtml(url);
  const article = extractWithReadability(html, url);

  if (!article) {
    console.log("❌ Readability returned null");
    return;
  }

  console.log("═".repeat(60));
  console.log("READABILITY EXTRACTION");
  console.log("═".repeat(60));
  console.log(`📰 Title: ${article.title}`);
  console.log(`📏 Content Length: ${article.textContent?.length || 0} chars`);
  console.log(`📝 Word Count: ${countWords(article.textContent || "")} words`);

  // Check for newlines in content
  const content = article.textContent || "";
  const doubleNewlines = (content.match(/\n\n/g) || []).length;
  const singleNewlines = (content.match(/\n/g) || []).length;

  console.log(`\n📊 Newline Analysis:`);
  console.log(`   Double newlines (\\n\\n): ${doubleNewlines}`);
  console.log(`   Single newlines (\\n): ${singleNewlines}`);

  console.log("\n" + "═".repeat(60));
  console.log("CHUNKING ANALYSIS");
  console.log("═".repeat(60));

  const chunks = smartChunkContent(content);

  console.log(`\n✅ Final chunks: ${chunks.length}`);
  console.log("─".repeat(60));

  chunks.forEach((chunk, i) => {
    const words = countWords(chunk);
    console.log(`\n📦 CHUNK ${i + 1} (${words} words):`);
    console.log("─".repeat(40));
    // Show first 500 chars of each chunk
    const preview = chunk.slice(0, 500);
    console.log(preview + (chunk.length > 500 ? "..." : ""));
  });
}

main().catch(console.error);
