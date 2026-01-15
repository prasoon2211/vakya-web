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

import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";

/**
 * Strip unnecessary HTML elements before parsing to speed up DOM creation
 */
function stripUnnecessaryHtml(html: string): string {
  return html
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
    .replace(/\s+on\w+='[^']*'/gi, "");
}

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
  // Strip unnecessary content first for faster parsing
  const startStrip = Date.now();
  const strippedHtml = stripUnnecessaryHtml(html);
  console.log(`⏱️  Stripped HTML: ${html.length} → ${strippedHtml.length} bytes (${Date.now() - startStrip}ms)`);

  // Use linkedom instead of jsdom for faster parsing
  const startParse = Date.now();
  const { document } = parseHTML(strippedHtml);
  console.log(`⏱️  DOM parsed in ${Date.now() - startParse}ms`);

  // Set the document URL for Readability
  Object.defineProperty(document, "baseURI", { value: url });
  Object.defineProperty(document, "documentURI", { value: url });

  const startRead = Date.now();
  const reader = new Readability(document as unknown as Document);
  const result = reader.parse();
  console.log(`⏱️  Readability extracted in ${Date.now() - startRead}ms`);

  return result;
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
