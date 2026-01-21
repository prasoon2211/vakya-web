/**
 * Lemmatizer Service
 *
 * Extracts the base/dictionary form (lemma) from inflected words.
 * Uses the existing Wiktionary dictionary lookup to resolve inflections.
 */

import {
  lookupWord,
  isSupportedLanguage,
  type SupportedLanguage,
  type DictionaryEntry,
} from './lookup-sqlite';

export interface LemmaResult {
  lemma: string; // Base dictionary form
  originalForm: string; // The form that was looked up
  formType: string | null; // e.g., "plural", "past_participle", "genitive"
  isBaseForm: boolean; // True if the word is already the base form
  definition: string | null; // Definition from dictionary
  entry: DictionaryEntry | null; // Full dictionary entry if found
}

/**
 * Patterns to detect inflection types from Wiktionary definitions
 * Maps regex patterns to form type extractors
 */
interface InflectionPattern {
  pattern: RegExp;
  getType: (match: RegExpMatchArray) => string;
}

const INFLECTION_PATTERNS: InflectionPattern[] = [
  // Noun forms
  { pattern: /^plural of /i, getType: () => 'plural' },
  { pattern: /^singular of /i, getType: () => 'singular' },
  { pattern: /^(masculine|feminine|neuter) plural of /i, getType: () => 'plural' },
  { pattern: /^(masculine|feminine|neuter) singular of /i, getType: () => 'singular' },

  // Cases (German, Latin, etc.)
  { pattern: /^(nominative|accusative|genitive|dative|vocative|locative) .* of /i, getType: (m) => m[1].toLowerCase() },
  { pattern: /^(strong|weak|mixed) genitive of /i, getType: () => 'genitive' },
  { pattern: /^genitive of /i, getType: () => 'genitive' },

  // Verb conjugations
  { pattern: /^(first|second|third)[- /]*(first|second|third)?[- ]*person .* of /i, getType: () => 'conjugated_form' },
  { pattern: /^(past|present|perfect|future|active|passive) participle of /i, getType: (m) => `${m[1].toLowerCase()}_participle` },
  { pattern: /^participle of /i, getType: () => 'participle' },
  { pattern: /^gerund of /i, getType: () => 'gerund' },
  { pattern: /^infinitive of /i, getType: () => 'infinitive' },
  { pattern: /^(simple past|past tense|preterite?) of /i, getType: () => 'preterite' },
  { pattern: /^(simple present|present tense) of /i, getType: () => 'present' },
  { pattern: /^(future|imperfect|pluperfect|aorist) of /i, getType: (m) => m[1].toLowerCase() },
  { pattern: /^(imperative|subjunctive|indicative|conditional|optative) of /i, getType: (m) => m[1].toLowerCase() },
  { pattern: /^singular imperative of /i, getType: () => 'imperative' },
  { pattern: /^plural imperative of /i, getType: () => 'imperative' },

  // Adjective/adverb forms
  { pattern: /^(superlative|comparative|positive|equative) (form |degree )?of /i, getType: (m) => m[1].toLowerCase() },
  { pattern: /^(attributive|predicative) (form )?of /i, getType: (m) => m[1].toLowerCase() },
  { pattern: /^(definite|indefinite) (singular|plural|form) of /i, getType: (m) => m[2].toLowerCase() },

  // Derivations
  { pattern: /^(diminutive|augmentative|pejorative|endearing) (form )?of /i, getType: (m) => m[1].toLowerCase() },
  { pattern: /^(agent noun|verbal noun|abstract noun|noun form) of /i, getType: () => 'derived_form' },

  // Generic inflection
  { pattern: /^inflection of /i, getType: () => 'inflected_form' },
  { pattern: /^[a-z]+ form of /i, getType: () => 'inflected_form' },

  // Alternative spellings
  { pattern: /^(alternative|alternate|variant) (form|spelling) of /i, getType: () => 'alternative' },
  { pattern: /^(obsolete|archaic|dated) (form|spelling) of /i, getType: () => 'archaic' },
];

/**
 * Extract the form type from a definition string
 */
function extractFormType(definition: string): string | null {
  for (const { pattern, getType } of INFLECTION_PATTERNS) {
    const match = definition.match(pattern);
    if (match) {
      return getType(match);
    }
  }
  // Check for "(inflection of X:)" at end
  if (/\(inflection of [a-zA-ZÀ-ÿ\-]+:?\)$/i.test(definition)) {
    return 'conjugated_form';
  }
  return null;
}

/**
 * Extract the base word from a definition string
 * e.g., "plural of Hund" -> "Hund"
 * e.g., "to stop (inflection of aufhören:)" -> "aufhören"
 */
function extractBaseWord(definition: string): string | null {
  // Pattern 1: "(inflection of WORD:)" or "(inflection of WORD)" at end - common in Wiktionary
  let match = definition.match(/\(inflection of ([a-zA-ZÀ-ÿ\-]+):?\)$/i);
  if (match && match[1]) {
    return match[1];
  }

  // Pattern 2: Match "X of WORD" where WORD might be followed by qualifiers
  match = definition.match(/\bof\s+(?:the\s+)?([a-zA-ZÀ-ÿ\-]+)(?:\s|:|,|\(|$)/i);
  if (match && match[1]) {
    const candidate = match[1].toLowerCase();
    if (!['the', 'a', 'an', 'to', 'in', 'on', 'at', 'for'].includes(candidate)) {
      return match[1];
    }
  }

  // Pattern 3: Handle cases where word might be in quotes
  match = definition.match(/\bof\s+["']([^"']+)["']/i);
  if (match && match[1]) {
    return match[1];
  }

  return null;
}

/**
 * Check if a definition indicates an inflected form
 */
function isInflectionReference(definition: string): boolean {
  // Check standard patterns at beginning
  if (INFLECTION_PATTERNS.some(({ pattern }) => pattern.test(definition))) {
    return true;
  }
  // Check for "(inflection of X:)" at end - common Wiktionary format
  if (/\(inflection of [a-zA-ZÀ-ÿ\-]+:?\)$/i.test(definition)) {
    return true;
  }
  return false;
}

/**
 * Strip punctuation from a word
 * Removes leading and trailing punctuation while preserving internal hyphens
 */
export function cleanWord(word: string): string {
  // Remove leading and trailing punctuation, but preserve internal hyphens
  // Common punctuation: . , ! ? ; : " ' ( ) [ ] { } « » „ " " ' '
  return word
    .replace(/^[.,!?;:"""''„«»()\[\]{}]+/, '')  // Leading punctuation
    .replace(/[.,!?;:"""''„«»()\[\]{}]+$/, ''); // Trailing punctuation
}

/**
 * Lemmatize a word - find its base dictionary form
 *
 * @param word - The word to lemmatize
 * @param language - The target language
 * @returns LemmaResult with lemma and metadata
 */
export function lemmatizeWord(
  word: string,
  language: string
): LemmaResult {
  // Clean punctuation and normalize
  const normalizedWord = cleanWord(word.toLowerCase().trim());

  // Default result if lookup fails
  const defaultResult: LemmaResult = {
    lemma: normalizedWord,
    originalForm: normalizedWord,
    formType: null,
    isBaseForm: true,
    definition: null,
    entry: null,
  };

  // Check if language is supported
  if (!isSupportedLanguage(language)) {
    return defaultResult;
  }

  const supportedLang = language as SupportedLanguage;

  // Look up the word in the dictionary
  const entry = lookupWord(word, supportedLang);

  if (!entry) {
    // Word not found - return as-is (assume it's the base form)
    return defaultResult;
  }

  // Check if the definition indicates this is an inflected form
  const definition = entry.definition || '';

  if (isInflectionReference(definition)) {
    // This is an inflected form - extract the base word
    const baseWord = extractBaseWord(definition);
    const formType = extractFormType(definition);

    if (baseWord) {
      // Look up the base word to get its proper form (with correct capitalization)
      const baseEntry = lookupWord(baseWord, supportedLang);

      return {
        lemma: baseEntry?.word?.toLowerCase() || baseWord.toLowerCase(),
        originalForm: normalizedWord,
        formType,
        isBaseForm: false,
        definition: baseEntry?.definition || definition,
        entry: baseEntry || entry,
      };
    }
  }

  // This appears to be a base form
  return {
    lemma: entry.word.toLowerCase(),
    originalForm: normalizedWord,
    formType: null,
    isBaseForm: true,
    definition: entry.definition,
    entry,
  };
}

/**
 * Check if two words share the same lemma
 */
export function haveSameLemma(
  word1: string,
  word2: string,
  language: string
): boolean {
  const result1 = lemmatizeWord(word1, language);
  const result2 = lemmatizeWord(word2, language);
  return result1.lemma === result2.lemma;
}

/**
 * Get a human-readable description of how a form relates to its lemma
 * e.g., "Hunde is the plural of Hund"
 */
export function getFormRelationDescription(
  originalForm: string,
  lemma: string,
  formType: string | null,
  language: string
): string | null {
  if (!formType || originalForm.toLowerCase() === lemma.toLowerCase()) {
    return null;
  }

  // Format the form type for display
  const formTypeDisplay = formType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toLowerCase());

  return `${formTypeDisplay} of ${lemma}`;
}

/**
 * Format a form type for display
 * e.g., "past_participle" -> "Past participle"
 */
export function formatFormType(formType: string | null): string | null {
  if (!formType) return null;

  return formType
    .replace(/_/g, ' ')
    .replace(/^\w/, c => c.toUpperCase());
}
