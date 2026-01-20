const API_URL = process.env.PLASMO_PUBLIC_VAKYA_API_URL || "https://vakya-web.fly.dev/api"

export interface TranslateRequest {
  type: "text"
  text: string
  title: string
  targetLanguage: string
  cefrLevel: string
}

export interface TranslateResponse {
  articleId: string
  status: string
  progress?: number
  total?: number
  title?: string
  error?: string
}

/**
 * Send extracted article to Vakya for translation
 */
export async function sendToVakya(
  token: string,
  data: TranslateRequest
): Promise<TranslateResponse> {
  const response = await fetch(`${API_URL}/translate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(data)
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error || `HTTP ${response.status}`)
  }

  return response.json()
}

/**
 * Language options supported by Vakya
 */
export const LANGUAGES = [
  { value: "German", label: "German" },
  { value: "French", label: "French" },
  { value: "Spanish", label: "Spanish" },
  { value: "Italian", label: "Italian" },
  { value: "Portuguese", label: "Portuguese" },
  { value: "Dutch", label: "Dutch" },
  { value: "Polish", label: "Polish" },
  { value: "Russian", label: "Russian" },
  { value: "Japanese", label: "Japanese" },
  { value: "Mandarin Chinese", label: "Mandarin Chinese" },
  { value: "Korean", label: "Korean" }
]

/**
 * CEFR levels
 */
export const CEFR_LEVELS = [
  { value: "A1", label: "A1 - Beginner" },
  { value: "A2", label: "A2 - Elementary" },
  { value: "B1", label: "B1 - Intermediate" },
  { value: "B2", label: "B2 - Upper Intermediate" },
  { value: "C1", label: "C1 - Advanced" },
  { value: "C2", label: "C2 - Mastery" }
]
