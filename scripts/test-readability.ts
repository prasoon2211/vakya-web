#!/usr/bin/env npx tsx

/**
 * Test script to see what content Readability extracts from a URL
 *
 * Usage:
 *   npx tsx scripts/test-readability.ts <url>
 *
 * Examples:
 *   npx tsx scripts/test-readability.ts https://www.bbc.com/news/...
 *   npx tsx scripts/test-readability.ts https://www.lemonde.fr/...
 */

import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

const url = process.argv[2];

if (!url) {
  console.error("Usage: npx tsx scripts/test-readability.ts <url>");
  process.exit(1);
}

async function fetchHtml(url: string): Promise<string> {
  // Try direct fetch first
  console.log(`\n📡 Fetching: ${url}\n`);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    console.log(`✓ Direct fetch succeeded (${html.length} bytes)\n`);
    return html;
  } catch (error) {
    console.log(`✗ Direct fetch failed: ${error}`);
  }

  // Try Jina fallback
  console.log(`\n📡 Trying Jina fallback...`);
  try {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const response = await fetch(jinaUrl, {
      headers: {
        "Accept": "text/html",
        "X-Return-Format": "html",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    console.log(`✓ Jina fetch succeeded (${html.length} bytes)\n`);
    return html;
  } catch (error) {
    console.error(`✗ Jina fetch failed: ${error}`);
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

  console.log("═".repeat(60));
  console.log("READABILITY EXTRACTION");
  console.log("═".repeat(60));

  const article = extractWithReadability(html, url);

  if (!article) {
    console.log("\n❌ Readability returned null - could not extract article\n");

    // Show raw HTML snippet for debugging
    console.log("─".repeat(60));
    console.log("RAW HTML PREVIEW (first 2000 chars):");
    console.log("─".repeat(60));
    console.log(html.slice(0, 2000));
    return;
  }

  console.log(`\n📰 Title: ${article.title}`);
  console.log(`📊 Byline: ${article.byline || "(none)"}`);
  console.log(`📁 Site Name: ${article.siteName || "(none)"}`);
  console.log(`📝 Excerpt: ${article.excerpt?.slice(0, 200) || "(none)"}...`);
  console.log(`📏 Content Length: ${article.textContent?.length || 0} chars`);

  console.log("\n" + "─".repeat(60));
  console.log("EXTRACTED TEXT CONTENT:");
  console.log("─".repeat(60) + "\n");

  // Clean up whitespace
  const cleanText = article.textContent
    ?.replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();

  console.log(cleanText);

  console.log("\n" + "─".repeat(60));
  console.log("HTML CONTENT (first 3000 chars):");
  console.log("─".repeat(60) + "\n");
  console.log(article.content?.slice(0, 3000));
}

main().catch(console.error);
