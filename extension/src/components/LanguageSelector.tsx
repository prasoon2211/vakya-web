import React from "react"
import { LANGUAGES, CEFR_LEVELS } from "~lib/api"

interface Props {
  targetLanguage: string
  cefrLevel: string
  onLanguageChange: (value: string) => void
  onLevelChange: (value: string) => void
  disabled?: boolean
}

export function LanguageSelector({
  targetLanguage,
  cefrLevel,
  onLanguageChange,
  onLevelChange,
  disabled = false
}: Props) {
  return (
    <div className="selectors">
      <div className="selector-group">
        <label htmlFor="language">Translate to</label>
        <select
          id="language"
          value={targetLanguage}
          onChange={(e) => onLanguageChange(e.target.value)}
          disabled={disabled}
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.value} value={lang.value}>
              {lang.label}
            </option>
          ))}
        </select>
      </div>

      <div className="selector-group">
        <label htmlFor="level">CEFR Level</label>
        <select
          id="level"
          value={cefrLevel}
          onChange={(e) => onLevelChange(e.target.value)}
          disabled={disabled}
        >
          {CEFR_LEVELS.map((level) => (
            <option key={level.value} value={level.value}>
              {level.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
