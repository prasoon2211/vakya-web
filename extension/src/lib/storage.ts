/**
 * Chrome storage helpers for persisting user preferences
 */

export interface UserPreferences {
  targetLanguage: string
  cefrLevel: string
}

const DEFAULT_PREFERENCES: UserPreferences = {
  targetLanguage: "German",
  cefrLevel: "B1"
}

const STORAGE_KEY = "vakya_preferences"

/**
 * Get user preferences from Chrome storage
 */
export async function getPreferences(): Promise<UserPreferences> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      if (result[STORAGE_KEY]) {
        resolve({ ...DEFAULT_PREFERENCES, ...result[STORAGE_KEY] })
      } else {
        resolve(DEFAULT_PREFERENCES)
      }
    })
  })
}

/**
 * Save user preferences to Chrome storage
 */
export async function savePreferences(prefs: Partial<UserPreferences>): Promise<void> {
  const current = await getPreferences()
  const updated = { ...current, ...prefs }

  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: updated }, () => {
      resolve()
    })
  })
}
