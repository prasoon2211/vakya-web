import type { PlasmoCSConfig } from "plasmo"
import { extractArticle, type ExtractedArticle } from "~lib/extractor"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_idle"
}

export interface ExtractMessage {
  type: "EXTRACT_ARTICLE"
}

export interface ExtractResponse {
  success: boolean
  article?: ExtractedArticle
  error?: string
}

/**
 * Listen for extraction requests from the popup
 */
chrome.runtime.onMessage.addListener(
  (message: ExtractMessage, _sender, sendResponse: (response: ExtractResponse) => void) => {
    if (message.type === "EXTRACT_ARTICLE") {
      try {
        const article = extractArticle(document, window.location.href)

        if (!article.content || article.content.length < 50) {
          sendResponse({
            success: false,
            error: "Could not extract article content from this page"
          })
          return true
        }

        sendResponse({
          success: true,
          article
        })
      } catch (error) {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : "Extraction failed"
        })
      }
      return true
    }
  }
)
