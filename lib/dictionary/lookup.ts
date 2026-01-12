/**
 * Multi-language Dictionary Lookup Module
 *
 * Supports:
 * - German-English (MUSE/Facebook Research, ~102k words)
 * - Spanish-English (MUSE/Facebook Research, ~102k words)
 * - French-English (MUSE/Facebook Research, ~102k words)
 *
 * Dictionaries are loaded on-demand and kept in memory for fast lookups.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface DictionaryEntry {
  word: string;       // Original word in target language
  en: string;         // English translation
}

export type SupportedLanguage = 'German' | 'Spanish' | 'French';

// Map language names to dictionary file names
const LANGUAGE_FILES: Record<SupportedLanguage, string> = {
  German: 'de-en.json',
  Spanish: 'es-en.json',
  French: 'fr-en.json',
};

// Singleton pattern - load each dictionary once
const dictionaries: Partial<Record<SupportedLanguage, Record<string, DictionaryEntry>>> = {};
const loadErrors: Partial<Record<SupportedLanguage, Error>> = {};

function loadDictionary(language: SupportedLanguage): Record<string, DictionaryEntry> {
  // Return cached dictionary if available
  if (dictionaries[language]) return dictionaries[language]!;

  // Throw cached error if loading failed before
  if (loadErrors[language]) throw loadErrors[language];

  try {
    const fileName = LANGUAGE_FILES[language];
    const dictPath = path.join(process.cwd(), 'lib/dictionary', fileName);

    if (!fs.existsSync(dictPath)) {
      throw new Error(`Dictionary file not found: ${fileName}. Run 'npm run dict:build' to generate it.`);
    }

    const data = fs.readFileSync(dictPath, 'utf-8');
    const dict = JSON.parse(data) as Record<string, DictionaryEntry>;
    dictionaries[language] = dict;
    console.log(`[Dictionary] Loaded ${Object.keys(dict).length} ${language} words`);
    return dict;
  } catch (err) {
    loadErrors[language] = err instanceof Error ? err : new Error(`Failed to load ${language} dictionary`);
    console.error(`[Dictionary] Failed to load ${language}:`, loadErrors[language]!.message);
    throw loadErrors[language];
  }
}

// Normalize a word for lookup (lowercase, remove punctuation)
function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .trim()
    // Keep only letters (including accented characters)
    .replace(/[^\p{L}\p{M}]/gu, '');
}

// Common German verb prefixes for compound verb lookup
const GERMAN_VERB_PREFIXES = [
  'ab', 'an', 'auf', 'aus', 'be', 'bei', 'durch', 'ein', 'ent',
  'er', 'fort', 'ge', 'her', 'hin', 'hinter', 'los', 'mit', 'nach',
  'nieder', 'über', 'um', 'unter', 'ver', 'vor', 'weg', 'wieder',
  'zer', 'zu', 'zurück', 'zusammen'
];

// Common Spanish verb endings
const SPANISH_VERB_ENDINGS = ['ar', 'er', 'ir', 'ado', 'ido', 'ando', 'iendo', 'aba', 'ía'];

// Common French verb endings
const FRENCH_VERB_ENDINGS = ['er', 'ir', 're', 'é', 'ée', 'és', 'ées', 'ant', 'ait', 'aient'];

// German-specific lookup with stemming
function findGermanWord(word: string, dict: Record<string, DictionaryEntry>): DictionaryEntry | null {
  const normalized = normalizeWord(word);
  if (!normalized || normalized.length < 2) return null;

  // Direct lookup
  if (dict[normalized]) return dict[normalized];

  // Try without common endings (conjugations, declensions)
  const endings = ['en', 'er', 'es', 'em', 'e', 'st', 't', 'et', 'te', 'ten', 'ung', 'heit', 'keit', 'lich', 'isch'];
  for (const ending of endings) {
    if (normalized.endsWith(ending) && normalized.length > ending.length + 2) {
      const stem = normalized.slice(0, -ending.length);
      if (dict[stem]) return dict[stem];
      if (dict[stem + 'e']) return dict[stem + 'e'];
      if (dict[stem + 'en']) return dict[stem + 'en'];
    }
  }

  // Try removing verb prefixes
  for (const prefix of GERMAN_VERB_PREFIXES) {
    if (normalized.startsWith(prefix) && normalized.length > prefix.length + 2) {
      const withoutPrefix = normalized.slice(prefix.length);
      if (dict[withoutPrefix]) {
        return { ...dict[withoutPrefix], word };
      }
    }
  }

  return null;
}

// Spanish-specific lookup with basic stemming
function findSpanishWord(word: string, dict: Record<string, DictionaryEntry>): DictionaryEntry | null {
  const normalized = normalizeWord(word);
  if (!normalized || normalized.length < 2) return null;

  // Direct lookup
  if (dict[normalized]) return dict[normalized];

  // Try without common verb endings
  for (const ending of SPANISH_VERB_ENDINGS) {
    if (normalized.endsWith(ending) && normalized.length > ending.length + 2) {
      const stem = normalized.slice(0, -ending.length);
      // Try to find infinitive forms
      if (dict[stem + 'ar']) return dict[stem + 'ar'];
      if (dict[stem + 'er']) return dict[stem + 'er'];
      if (dict[stem + 'ir']) return dict[stem + 'ir'];
      if (dict[stem]) return dict[stem];
    }
  }

  // Try removing common plural 's'
  if (normalized.endsWith('s') && normalized.length > 3) {
    const singular = normalized.slice(0, -1);
    if (dict[singular]) return dict[singular];
    // Try removing 'es' for words ending in consonants
    if (normalized.endsWith('es') && normalized.length > 4) {
      const singularEs = normalized.slice(0, -2);
      if (dict[singularEs]) return dict[singularEs];
    }
  }

  return null;
}

// French-specific lookup with basic stemming
function findFrenchWord(word: string, dict: Record<string, DictionaryEntry>): DictionaryEntry | null {
  const normalized = normalizeWord(word);
  if (!normalized || normalized.length < 2) return null;

  // Direct lookup
  if (dict[normalized]) return dict[normalized];

  // Try without common verb endings
  for (const ending of FRENCH_VERB_ENDINGS) {
    if (normalized.endsWith(ending) && normalized.length > ending.length + 2) {
      const stem = normalized.slice(0, -ending.length);
      // Try to find infinitive forms
      if (dict[stem + 'er']) return dict[stem + 'er'];
      if (dict[stem + 'ir']) return dict[stem + 'ir'];
      if (dict[stem + 're']) return dict[stem + 're'];
      if (dict[stem]) return dict[stem];
    }
  }

  // Try removing common plural 's'
  if (normalized.endsWith('s') && normalized.length > 3) {
    const singular = normalized.slice(0, -1);
    if (dict[singular]) return dict[singular];
  }

  // Try removing feminine 'e'
  if (normalized.endsWith('e') && normalized.length > 3) {
    const masculine = normalized.slice(0, -1);
    if (dict[masculine]) return dict[masculine];
  }

  return null;
}

/**
 * Look up a word in the dictionary
 *
 * @param word - The word to look up
 * @param language - The target language (German, Spanish, or French)
 * @returns Dictionary entry if found, null otherwise
 */
export function lookupWord(word: string, language: SupportedLanguage): DictionaryEntry | null {
  try {
    const dict = loadDictionary(language);

    switch (language) {
      case 'German':
        return findGermanWord(word, dict);
      case 'Spanish':
        return findSpanishWord(word, dict);
      case 'French':
        return findFrenchWord(word, dict);
      default:
        return null;
    }
  } catch {
    // Dictionary not loaded - return null rather than crashing
    return null;
  }
}

/**
 * Check if a word exists in the dictionary
 *
 * @param word - The word to check
 * @param language - The target language
 * @returns true if found, false otherwise
 */
export function hasWord(word: string, language: SupportedLanguage): boolean {
  return lookupWord(word, language) !== null;
}

/**
 * Get dictionary statistics for a language
 */
export function getDictionaryStats(language: SupportedLanguage): { totalWords: number; loaded: boolean } {
  try {
    const dict = loadDictionary(language);
    return {
      totalWords: Object.keys(dict).length,
      loaded: true,
    };
  } catch {
    return {
      totalWords: 0,
      loaded: false,
    };
  }
}

/**
 * Check if a language is supported by the dictionary
 */
export function isSupportedLanguage(language: string): language is SupportedLanguage {
  return language === 'German' || language === 'Spanish' || language === 'French';
}
