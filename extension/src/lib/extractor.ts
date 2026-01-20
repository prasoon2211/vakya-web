import Defuddle from "defuddle"

export interface ExtractedArticle {
  title: string
  content: string
  author: string | null
  publishedDate: string | null
  url: string
  wordCount: number
}

/**
 * Extract article content from the current page using Defuddle
 * This runs in the content script context where we have access to the DOM
 */
export function extractArticle(doc: Document, url: string): ExtractedArticle {
  const defuddled = new Defuddle(doc, { url }).parse()

  // Get plain text content (strip HTML)
  let plainText = defuddled.content || ""

  // If content has HTML, extract text
  if (plainText.includes("<")) {
    const tempDiv = doc.createElement("div")
    tempDiv.innerHTML = plainText
    plainText = tempDiv.textContent || tempDiv.innerText || ""
  }

  // Clean up whitespace
  plainText = plainText
    .replace(/\s+/g, " ")
    .replace(/\n\s*\n/g, "\n\n")
    .trim()

  return {
    title: defuddled.title || doc.title || "Untitled",
    content: plainText,
    author: defuddled.author || null,
    publishedDate: defuddled.published || null,
    url,
    wordCount: defuddled.wordCount || plainText.split(/\s+/).filter(w => w.length > 0).length
  }
}

/**
 * Get a preview of the content (first ~500 chars)
 */
export function getContentPreview(content: string, maxLength = 500): string {
  if (content.length <= maxLength) return content

  // Try to cut at a sentence boundary
  const truncated = content.slice(0, maxLength)
  const lastPeriod = truncated.lastIndexOf(".")
  const lastQuestion = truncated.lastIndexOf("?")
  const lastExclaim = truncated.lastIndexOf("!")

  const lastSentenceEnd = Math.max(lastPeriod, lastQuestion, lastExclaim)

  if (lastSentenceEnd > maxLength * 0.5) {
    return truncated.slice(0, lastSentenceEnd + 1)
  }

  return truncated + "..."
}
