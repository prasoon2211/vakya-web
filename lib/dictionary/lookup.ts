/**
 * German-English Dictionary Lookup Module
 *
 * Uses the TU Chemnitz German-English dictionary (GPL licensed)
 * for fast, offline word lookups without AI.
 *
 * The dictionary is loaded once at server startup and kept in memory
 * for instant lookups (~300k words).
 */

import * as fs from 'fs';
import * as path from 'path';

export interface DictionaryEntry {
  de: string;        // German word (original casing)
  en: string;        // English translation
  pos?: string;      // Part of speech
  article?: string;  // Article (der/die/das)
  gender?: string;   // Gender (masculine/feminine/neuter)
}

// Singleton pattern - load dictionary once
let dictionary: Record<string, DictionaryEntry> | null = null;
let loadError: Error | null = null;

function loadDictionary(): Record<string, DictionaryEntry> {
  if (dictionary) return dictionary;
  if (loadError) throw loadError;

  try {
    const dictPath = path.join(process.cwd(), 'lib/dictionary/de-en.json');
    const data = fs.readFileSync(dictPath, 'utf-8');
    dictionary = JSON.parse(data) as Record<string, DictionaryEntry>;
    console.log(`[Dictionary] Loaded ${Object.keys(dictionary).length} German words`);
    return dictionary;
  } catch (err) {
    loadError = err instanceof Error ? err : new Error('Failed to load dictionary');
    console.error('[Dictionary] Failed to load:', loadError.message);
    throw loadError;
  }
}

function getDict(): Record<string, DictionaryEntry> {
  return loadDictionary();
}

// Normalize a word for lookup (lowercase, remove punctuation)
function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .trim()
    // Keep only letters (including umlauts)
    .replace(/[^\p{L}\p{M}]/gu, '');
}

// Common German verb prefixes for compound verb lookup
const VERB_PREFIXES = [
  'ab', 'an', 'auf', 'aus', 'be', 'bei', 'durch', 'ein', 'ent',
  'er', 'fort', 'ge', 'her', 'hin', 'hinter', 'los', 'mit', 'nach',
  'nieder', 'über', 'um', 'unter', 'ver', 'vor', 'weg', 'wieder',
  'zer', 'zu', 'zurück', 'zusammen'
];

// Try to find a word with various strategies
function findWord(word: string): DictionaryEntry | null {
  const dict = getDict();
  const normalized = normalizeWord(word);

  if (!normalized || normalized.length < 2) {
    return null;
  }

  // Direct lookup
  if (dict[normalized]) {
    return dict[normalized];
  }

  // Try without common endings (conjugations, declensions)
  const endings = ['en', 'er', 'es', 'em', 'e', 'st', 't', 'et', 'te', 'ten', 'ung', 'heit', 'keit', 'lich', 'isch'];
  for (const ending of endings) {
    if (normalized.endsWith(ending) && normalized.length > ending.length + 2) {
      const stem = normalized.slice(0, -ending.length);
      if (dict[stem]) {
        return dict[stem];
      }
      // Try with 'e' added back (common pattern)
      if (dict[stem + 'e']) {
        return dict[stem + 'e'];
      }
      // Try with 'en' added back (infinitive)
      if (dict[stem + 'en']) {
        return dict[stem + 'en'];
      }
    }
  }

  // Try removing verb prefixes
  for (const prefix of VERB_PREFIXES) {
    if (normalized.startsWith(prefix) && normalized.length > prefix.length + 2) {
      const withoutPrefix = normalized.slice(prefix.length);
      if (dict[withoutPrefix]) {
        // Return but note it's a compound
        const base = dict[withoutPrefix];
        return {
          ...base,
          de: word, // Use original word
        };
      }
    }
  }

  // No match found
  return null;
}

/**
 * Look up a German word in the dictionary
 *
 * @param word - The German word to look up
 * @returns Dictionary entry if found, null otherwise
 */
export function lookupWord(word: string): DictionaryEntry | null {
  return findWord(word);
}

/**
 * Check if a word exists in the dictionary
 *
 * @param word - The German word to check
 * @returns true if found, false otherwise
 */
export function hasWord(word: string): boolean {
  return findWord(word) !== null;
}

/**
 * Get dictionary statistics
 */
export function getDictionaryStats(): { totalWords: number; loaded: boolean } {
  try {
    const dict = getDict();
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
