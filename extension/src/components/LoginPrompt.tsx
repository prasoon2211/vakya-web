import React from "react"

const SYNC_HOST = process.env.PLASMO_PUBLIC_VAKYA_SYNC_HOST || "https://vakya-web.fly.dev"

export function LoginPrompt() {
  const handleLogin = () => {
    chrome.tabs.create({ url: `${SYNC_HOST}/sign-in` })
  }

  return (
    <div className="login-prompt">
      <div className="login-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 12c2.5 0 4.5-2 4.5-4.5S14.5 3 12 3 7.5 5 7.5 7.5 9.5 12 12 12z" />
          <path d="M20 21v-2c0-2.2-1.8-4-4-4H8c-2.2 0-4 1.8-4 4v2" />
        </svg>
      </div>
      <h2>Welcome to Vakya Clipper</h2>
      <p>Please log in to Vakya to start clipping articles for translation.</p>
      <button onClick={handleLogin} className="login-button">
        Log in to Vakya
      </button>
    </div>
  )
}
