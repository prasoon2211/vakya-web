import React, { useState } from "react"
import type { ExtractedArticle } from "~lib/extractor"
import { getContentPreview } from "~lib/extractor"

interface Props {
  article: ExtractedArticle
  onTitleChange: (title: string) => void
}

export function ClipPreview({ article, onTitleChange }: Props) {
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const preview = getContentPreview(article.content)

  return (
    <div className="clip-preview">
      <div className="title-section">
        {isEditingTitle ? (
          <input
            type="text"
            value={article.title}
            onChange={(e) => onTitleChange(e.target.value)}
            onBlur={() => setIsEditingTitle(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setIsEditingTitle(false)
            }}
            autoFocus
            className="title-input"
          />
        ) : (
          <h3 onClick={() => setIsEditingTitle(true)} className="title" title="Click to edit">
            {article.title}
            <svg className="edit-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </h3>
        )}
      </div>

      <div className="meta">
        {article.author && <span className="author">{article.author}</span>}
        <span className="word-count">{article.wordCount.toLocaleString()} words</span>
      </div>

      <div className="content-preview">
        <p>{preview}</p>
      </div>

      <div className="source-url" title={article.url}>
        {new URL(article.url).hostname}
      </div>
    </div>
  )
}
