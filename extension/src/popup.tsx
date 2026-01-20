import React, { useEffect, useState } from "react"
import { ClerkProvider, SignedIn, SignedOut, useAuth } from "@clerk/chrome-extension"

import { LoginPrompt } from "~components/LoginPrompt"
import { ClipPreview } from "~components/ClipPreview"
import { LanguageSelector } from "~components/LanguageSelector"
import { sendToVakya } from "~lib/api"
import { getPreferences, savePreferences } from "~lib/storage"
import type { ExtractedArticle } from "~lib/extractor"

import "./popup.css"

const SYNC_HOST = process.env.PLASMO_PUBLIC_VAKYA_SYNC_HOST || "https://vakya-web.fly.dev"
const PUBLISHABLE_KEY = process.env.PLASMO_PUBLIC_CLERK_PUBLISHABLE_KEY

function ClipperUI() {
  const { getToken } = useAuth()
  const [article, setArticle] = useState<ExtractedArticle | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [articleId, setArticleId] = useState<string | null>(null)

  // User preferences
  const [targetLanguage, setTargetLanguage] = useState("German")
  const [cefrLevel, setCefrLevel] = useState("B1")

  // Load preferences and extract article on mount
  useEffect(() => {
    async function init() {
      // Load saved preferences
      const prefs = await getPreferences()
      setTargetLanguage(prefs.targetLanguage)
      setCefrLevel(prefs.cefrLevel)

      // Extract article from current tab
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        if (!tab?.id) {
          setError("No active tab found")
          setLoading(false)
          return
        }

        // Send message to content script
        chrome.tabs.sendMessage(
          tab.id,
          { type: "EXTRACT_ARTICLE" },
          (response) => {
            if (chrome.runtime.lastError) {
              setError("Could not access this page. Try refreshing.")
              setLoading(false)
              return
            }

            if (response?.success && response.article) {
              setArticle(response.article)
            } else {
              setError(response?.error || "Could not extract article content")
            }
            setLoading(false)
          }
        )
      } catch (err) {
        setError("Failed to extract article")
        setLoading(false)
      }
    }

    init()
  }, [])

  // Save preferences when changed
  const handleLanguageChange = (value: string) => {
    setTargetLanguage(value)
    savePreferences({ targetLanguage: value })
  }

  const handleLevelChange = (value: string) => {
    setCefrLevel(value)
    savePreferences({ cefrLevel: value })
  }

  const handleTitleChange = (newTitle: string) => {
    if (article) {
      setArticle({ ...article, title: newTitle })
    }
  }

  const handleSend = async () => {
    if (!article) return

    setSending(true)
    setError(null)

    try {
      const token = await getToken()
      if (!token) {
        setError("Not authenticated. Please log in again.")
        setSending(false)
        return
      }

      const result = await sendToVakya(token, {
        type: "text",
        text: article.content,
        title: article.title,
        targetLanguage,
        cefrLevel
      })

      setArticleId(result.articleId)
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send article")
    } finally {
      setSending(false)
    }
  }

  const openDashboard = () => {
    chrome.tabs.create({ url: `${SYNC_HOST}/dashboard` })
  }

  if (loading) {
    return (
      <div className="popup-container">
        <div className="loading">
          <div className="spinner" />
          <p>Extracting article...</p>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="popup-container">
        <div className="success">
          <div className="success-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22,4 12,14.01 9,11.01" />
            </svg>
          </div>
          <h2>Article Sent!</h2>
          <p>Your article is being translated. Check your dashboard to view progress.</p>
          <button onClick={openDashboard} className="primary-button">
            Open Dashboard
          </button>
        </div>
      </div>
    )
  }

  if (error && !article) {
    return (
      <div className="popup-container">
        <div className="error-state">
          <div className="error-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2>Extraction Failed</h2>
          <p>{error}</p>
          <p className="hint">Try refreshing the page or navigating to an article page.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="popup-container">
      <header className="header">
        <h1>Vakya Clipper</h1>
      </header>

      {article && (
        <>
          <ClipPreview article={article} onTitleChange={handleTitleChange} />

          <LanguageSelector
            targetLanguage={targetLanguage}
            cefrLevel={cefrLevel}
            onLanguageChange={handleLanguageChange}
            onLevelChange={handleLevelChange}
            disabled={sending}
          />

          {error && <div className="error-message">{error}</div>}

          <button
            onClick={handleSend}
            disabled={sending}
            className="primary-button send-button"
          >
            {sending ? (
              <>
                <span className="spinner small" />
                Sending...
              </>
            ) : (
              "Send to Vakya"
            )}
          </button>
        </>
      )}
    </div>
  )
}

function Popup() {
  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY!}
      syncHost={SYNC_HOST}
    >
      <SignedIn>
        <ClipperUI />
      </SignedIn>
      <SignedOut>
        <div className="popup-container">
          <header className="header">
            <h1>Vakya Clipper</h1>
          </header>
          <LoginPrompt />
        </div>
      </SignedOut>
    </ClerkProvider>
  )
}

export default Popup
