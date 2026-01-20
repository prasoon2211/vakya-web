import { createClerkClient } from "@clerk/chrome-extension/background"

const SYNC_HOST = process.env.PLASMO_PUBLIC_VAKYA_SYNC_HOST || "https://vakya-web.fly.dev"
const PUBLISHABLE_KEY = process.env.PLASMO_PUBLIC_CLERK_PUBLISHABLE_KEY

if (!PUBLISHABLE_KEY) {
  console.error("Missing PLASMO_PUBLIC_CLERK_PUBLISHABLE_KEY")
}

// Create Clerk client with sync host for session sharing
const clerk = createClerkClient({
  publishableKey: PUBLISHABLE_KEY!,
  syncHost: SYNC_HOST
})

export interface TokenMessage {
  type: "GET_TOKEN"
}

export interface TokenResponse {
  token: string | null
  error?: string
}

/**
 * Handle messages from popup requesting auth token
 */
chrome.runtime.onMessage.addListener(
  (message: TokenMessage, _sender, sendResponse: (response: TokenResponse) => void) => {
    if (message.type === "GET_TOKEN") {
      // Get token from Clerk session
      clerk.session
        ?.getToken()
        .then((token) => {
          sendResponse({ token })
        })
        .catch((error) => {
          console.error("Failed to get token:", error)
          sendResponse({
            token: null,
            error: error instanceof Error ? error.message : "Failed to get token"
          })
        })

      // Return true to indicate async response
      return true
    }
  }
)

// Log when background script loads
console.log("[Vakya Clipper] Background script loaded")
