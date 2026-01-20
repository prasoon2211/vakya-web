/**
 * SQLite-based Dictionary Lookup Module
 *
 * Uses Wiktionary data stored in SQLite for fast, accurate lookups.
 * Supports German, Spanish, and French with 1.4M+ entries total.
 * Each language has its own database file for easier management.
 *
 * Features:
 * - Instant lookups via indexed queries
 * - Minimal memory footprint
 * - Conjugated forms and inflections included
 * - IPA pronunciation and audio links
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

export type SupportedLanguage = 'German' | 'Spanish' | 'French';

// Map language names to database file codes
const LANGUAGE_CODES: Record<SupportedLanguage, string> = {
  German: 'de',
  Spanish: 'es',
  French: 'fr',
};

export interface DictionaryEntry {
  word: string;              // Original word (preserves case)
  language: SupportedLanguage;
  partOfSpeech: string | null;
  definition: string | null; // Primary definition
  definitions: string[];     // All definitions
  forms: string | null;      // Related forms (conjugations, etc.)
  ipa: string | null;        // IPA pronunciation
  audioUrl: string | null;   // Wikimedia audio URL
  // Enhanced German fields from TU Chemnitz
  gender: 'm' | 'f' | 'n' | null;      // m=masculine, f=feminine, n=neuter
  article: 'der' | 'die' | 'das' | null; // German article
  plural: string | null;               // Plural form
  genitive: string | null;             // Genitive form
  pastParticiple: string | null;       // For verbs
  preterite: string | null;            // For verbs
}

// Lazy-load database connections (one per language)
const databases: Partial<Record<SupportedLanguage, Database.Database>> = {};
const dbErrors: Partial<Record<SupportedLanguage, Error>> = {};

// Prepared statements cache (one per language)
const lookupStmts: Partial<Record<SupportedLanguage, Database.Statement>> = {};
const lookupByFormsStmts: Partial<Record<SupportedLanguage, Database.Statement>> = {};

function getDbPath(language: SupportedLanguage): string {
  const code = LANGUAGE_CODES[language];
  return path.join(process.cwd(), 'lib/dictionary', `dictionary-${code}.db`);
}

function getDb(language: SupportedLanguage): Database.Database {
  if (databases[language]) return databases[language]!;
  if (dbErrors[language]) throw dbErrors[language];

  try {
    const dbPath = getDbPath(language);

    if (!fs.existsSync(dbPath)) {
      throw new Error(
        `Dictionary database not found for ${language} at ${dbPath}. ` +
        `Run 'npx tsx lib/dictionary/build-sqlite.ts' to build it.`
      );
    }

    const db = new Database(dbPath, { readonly: true });
    databases[language] = db;

    console.log(`[Dictionary] Loaded ${language} database`);
    return db;
  } catch (err) {
    dbErrors[language] = err instanceof Error ? err : new Error(`Failed to load ${language} dictionary`);
    console.error(`[Dictionary] Failed to load ${language}:`, dbErrors[language]!.message);
    throw dbErrors[language];
  }
}

// German-specific: lookup noun entries only (for capitalized words)
function getGermanNounLookupStmt(): Database.Statement {
  const stmtKey = 'German_noun' as SupportedLanguage;
  if (!lookupStmts[stmtKey]) {
    lookupStmts[stmtKey] = getDb('German').prepare(`
      SELECT
        word_original as word,
        part_of_speech as partOfSpeech,
        definition,
        definitions_json as definitionsJson,
        forms,
        ipa,
        audio,
        gender,
        article,
        plural,
        genitive,
        past_participle as pastParticiple,
        preterite
      FROM words
      WHERE word_lower = ?
        AND part_of_speech LIKE '%noun%'
      ORDER BY
        CASE
          WHEN definition LIKE 'inflection of%' THEN 10
          WHEN definition LIKE 'plural of%' THEN 10
          WHEN definition LIKE 'singular of%' THEN 10
          ELSE 1
        END,
        LENGTH(definition) DESC
      LIMIT 1
    `);
  }
  return lookupStmts[stmtKey]!;
}

function getLookupStmt(language: SupportedLanguage): Database.Statement {
  if (!lookupStmts[language]) {
    // Order by: prefer entries with real definitions over inflection references
    // This ensures "Haus" (noun, "house") comes before "haus" (verb, "imperative of hausen")
    // and "überprüfen" (verb, "to check") comes before "Überprüfen" (noun, "gerund of")
    // When both are inflection references, prefer nouns over verbs (more useful for learners)
    lookupStmts[language] = getDb(language).prepare(`
      SELECT
        word_original as word,
        part_of_speech as partOfSpeech,
        definition,
        definitions_json as definitionsJson,
        forms,
        ipa,
        audio,
        gender,
        article,
        plural,
        genitive,
        past_participle as pastParticiple,
        preterite
      FROM words
      WHERE word_lower = ?
      ORDER BY
        CASE
          -- Pure inflection references (no actual meaning)
          WHEN definition LIKE 'inflection of%' THEN 10
          WHEN definition LIKE 'gerund of%' THEN 10
          WHEN definition LIKE 'plural of%' THEN 10
          WHEN definition LIKE 'singular of%' THEN 10
          WHEN definition LIKE '%imperative of%' THEN 10
          WHEN definition LIKE '%preterite of%' THEN 10
          WHEN definition LIKE '%participle of%' THEN 10
          WHEN definition LIKE '%person % of%' THEN 10
          WHEN definition LIKE '%tense of%' THEN 10
          WHEN definition LIKE 'nominative%of%' THEN 10
          WHEN definition LIKE 'accusative%of%' THEN 10
          WHEN definition LIKE 'genitive%of%' THEN 10
          WHEN definition LIKE 'dative%of%' THEN 10
          WHEN definition LIKE 'subjunctive%of%' THEN 10
          -- Alternative/obsolete forms (second priority)
          WHEN definition LIKE 'alternative%' THEN 5
          WHEN definition LIKE 'obsolete%' THEN 5
          WHEN definition LIKE 'archaic%' THEN 5
          WHEN definition LIKE '%form of%' THEN 5
          WHEN definition LIKE '%spelling of%' THEN 5
          -- Real definitions (highest priority)
          ELSE 1
        END,
        -- When both are inflection refs, prefer nouns over verbs (more useful for learners)
        CASE
          WHEN part_of_speech LIKE '%noun%' THEN 1
          WHEN part_of_speech LIKE '%adjective%' THEN 2
          WHEN part_of_speech LIKE '%adverb%' THEN 3
          ELSE 4
        END,
        LENGTH(definition) DESC
      LIMIT 1
    `);
  }
  return lookupStmts[language]!;
}

function getLookupByFormsStmt(language: SupportedLanguage): Database.Statement {
  if (!lookupByFormsStmts[language]) {
    // Filter out entries that are just references to other words
    // We want the "real" definition, not "plural of X" etc.
    lookupByFormsStmts[language] = getDb(language).prepare(`
      SELECT
        word_original as word,
        part_of_speech as partOfSpeech,
        definition,
        definitions_json as definitionsJson,
        forms,
        ipa,
        audio,
        gender,
        article,
        plural,
        genitive,
        past_participle as pastParticiple,
        preterite
      FROM words
      WHERE forms LIKE ?
        AND definition NOT LIKE 'inflection of%'
        AND definition NOT LIKE 'plural of%'
        AND definition NOT LIKE 'singular of%'
        AND definition NOT LIKE '%form of%'
        AND definition NOT LIKE '%spelling of%'
        AND definition NOT LIKE '%participle of%'
        AND definition NOT LIKE 'gerund of%'
        AND definition NOT LIKE '%person %'
        AND definition NOT LIKE 'superlative%'
        AND definition NOT LIKE 'comparative%'
        AND definition NOT LIKE 'diminutive of%'
        AND definition NOT LIKE 'augmentative of%'
        AND definition NOT LIKE 'abbreviation of%'
        AND definition NOT LIKE 'contraction of%'
        AND definition NOT LIKE 'misspelling of%'
      LIMIT 1
    `);
  }
  return lookupByFormsStmts[language]!;
}

// Convert Wikimedia audio path to full URL
function getAudioUrl(audioPath: string | null): string | null {
  if (!audioPath) return null;
  if (audioPath.startsWith('http')) return audioPath;

  const cleanPath = audioPath.replace(/^transcoded\//, '');
  return `https://upload.wikimedia.org/wikipedia/commons/${cleanPath}`;
}

function parseRow(row: Record<string, unknown>, language: SupportedLanguage): DictionaryEntry {
  let definitions: string[] = [];
  try {
    const jsonStr = row.definitionsJson as string;
    if (jsonStr) {
      definitions = JSON.parse(jsonStr);
    }
  } catch {
    definitions = row.definition ? [row.definition as string] : [];
  }

  return {
    word: row.word as string,
    language,
    partOfSpeech: row.partOfSpeech as string | null,
    definition: row.definition as string | null,
    definitions,
    forms: row.forms as string | null,
    ipa: row.ipa as string | null,
    audioUrl: getAudioUrl(row.audio as string | null),
    // Enhanced German fields (will be null if columns don't exist yet)
    gender: (row.gender as 'm' | 'f' | 'n' | null) || null,
    article: (row.article as 'der' | 'die' | 'das' | null) || null,
    plural: (row.plural as string | null) || null,
    genitive: (row.genitive as string | null) || null,
    pastParticiple: (row.pastParticiple as string | null) || null,
    preterite: (row.preterite as string | null) || null,
  };
}

// Maximum recursion depth for following inflection references
const MAX_LOOKUP_DEPTH = 3;

/**
 * Look up a word in the dictionary
 *
 * @param word - The word to look up
 * @param language - The target language
 * @param depth - Internal: current recursion depth (do not pass externally)
 * @param visitedWords - Internal: words already visited to prevent loops
 * @returns Dictionary entry if found, null otherwise
 */
export function lookupWord(
  word: string,
  language: SupportedLanguage,
  depth: number = 0,
  visitedWords: Set<string> = new Set()
): DictionaryEntry | null {
  try {
    const trimmedWord = word.trim();
    const normalizedWord = trimmedWord.toLowerCase();
    if (!normalizedWord || normalizedWord.length < 1) return null;

    // Prevent infinite loops
    if (visitedWords.has(normalizedWord)) return null;
    visitedWords.add(normalizedWord);

    // For German: use deterministic rule based on capitalization
    // In German, ALL nouns are capitalized. If word starts with uppercase, it's a noun.
    let row: Record<string, unknown> | undefined;

    if (language === 'German' && /^[A-ZÄÖÜ]/.test(trimmedWord)) {
      // Capitalized German word = noun. Look for noun entries first.
      row = getGermanNounLookupStmt().get(normalizedWord) as Record<string, unknown> | undefined;
    }

    // Fall back to general lookup if no noun found (or not German/not capitalized)
    if (!row) {
      row = getLookupStmt(language).get(normalizedWord) as Record<string, unknown> | undefined;
    }

    if (row) {
      const entry = parseRow(row, language);

      // If this is just a reference to another form, try to find the base word
      // But only recurse if we haven't hit the depth limit
      if (entry.definition && isInflectionReference(entry.definition) && depth < MAX_LOOKUP_DEPTH) {
        const baseWord = extractBaseWord(entry.definition);
        if (baseWord && baseWord.toLowerCase() !== normalizedWord) {
          const baseEntry = lookupWord(baseWord, language, depth + 1, visitedWords);
          if (baseEntry && baseEntry.definition) {
            // Found base entry with a definition
            if (!isInflectionReference(baseEntry.definition)) {
              // Base has a real definition - merge it
              return {
                ...baseEntry,
                word: entry.word,
                definition: `${baseEntry.definition} (${entry.definition})`,
              };
            } else {
              // Base entry is also a reference - still try to show something useful
              // Include the base's definition chain: "X (gerund of Y) (Y form of Z)"
              return {
                ...baseEntry,
                word: entry.word,
                definition: `${baseEntry.definition} (${entry.definition})`,
              };
            }
          }
        }
      }

      return entry;
    }

    // If not found directly, try searching in forms
    const formRow = getLookupByFormsStmt(language).get(`%${normalizedWord}%`) as Record<string, unknown> | undefined;

    if (formRow) {
      const entry = parseRow(formRow, language);
      return {
        ...entry,
        definition: entry.definition ? `${entry.definition} (from: ${entry.word})` : null,
        word,
      };
    }

    return null;
  } catch (err) {
    console.error('[Dictionary] Lookup error:', err);
    return null;
  }
}

function isInflectionReference(definition: string): boolean {
  // Comprehensive list of Wiktionary "form of" patterns
  const patterns = [
    // Basic inflections
    /^plural of /i,
    /^singular of /i,
    /^inflection of /i,

    // Person/number - handle "first/third-person", "first-person", "first person" etc.
    /^(first|second|third)[/\- ]+(first|second|third)?[- ]*person /i,
    /^(first|second|third)[- ]person /i,

    // Gender/number combinations
    /^(masculine|feminine|neuter) (singular|plural)( (nominative|accusative|genitive|dative|vocative))? of /i,
    /^(masculine|feminine|neuter) of /i,
    /^dual of /i,

    // Participles
    /^(past|present|perfect|future|active|passive) participle of /i,
    /^participle of /i,

    // Verb tenses and moods
    /^(infinitive|imperative|subjunctive|indicative|conditional|optative) of /i,
    /^(future|preterite?|imperfect|perfect|pluperfect|aorist) of /i,
    /^(simple past|simple present|past tense|present tense) of /i,

    // Singular imperative (common German pattern)
    /^singular imperative of /i,
    /^plural imperative of /i,

    // Cases (German, Latin, etc.)
    /^(nominative|accusative|genitive|dative|vocative|locative|instrumental|ablative).* of /i,

    // Degree (adjectives/adverbs)
    /^(superlative|comparative|positive|equative) (form |degree )?of /i,

    // Morphological derivations
    /^(diminutive|augmentative|pejorative|endearing|frequentative|causative|intensive) (form )?of /i,
    /^(agent noun|verbal noun|abstract noun|noun form) of /i,
    /^gerund of /i,

    // Alternative forms and spellings
    /^(alternative|alternate|variant|archaic|obsolete|dated|rare|dialectal|regional|colloquial|informal|formal|literary|nonstandard|standard|poetic|vulgar|euphemistic) (form|spelling|variant) of /i,
    /^(alternative|alternate|variant) of /i,

    // Historical/obsolete spellings
    /^(obsolete|archaic|dated|former|superseded|pre-reform|post-reform) (form|spelling) of /i,
    /^(eye dialect|pronunciation spelling|misspelling|misconstruction) of /i,

    // Shortened forms
    /^(abbreviation|short form|shortened form|clipping|contraction|initialism|acronym|aphetic form|apocopic form|truncation) of /i,

    // Voice and reflexivity
    /^(passive|active|reflexive|middle voice|mediopassive) (form )?of /i,

    // German-specific declension patterns
    /^(strong|weak|mixed) (genitive|inflection|form|declension) of /i,
    /^(attributive|predicative) (form )?of /i,
    /^(definite|indefinite) (singular|plural|form) of /i,

    // Combining forms
    /^combining form of /i,

    // Romanization/transliteration
    /^(romanization|transliteration|latinization) of /i,

    // Generic "form of" pattern (catches remaining cases)
    /^[a-z]+ form of /i,
  ];

  return patterns.some(p => p.test(definition));
}

function extractBaseWord(definition: string): string | null {
  // Try multiple extraction patterns in order of specificity

  // Pattern 1: Match "X of WORD" where WORD might be followed by qualifiers
  // Handles: "plural of word", "inflection of word:", "alternative form of word (archaic)"
  let match = definition.match(/\bof\s+(?:the\s+)?([a-zA-ZÀ-ÿ\-]+)(?:\s|:|,|\(|$)/i);
  if (match && match[1]) {
    const candidate = match[1].toLowerCase();
    // Skip common false positives (articles, prepositions that might appear)
    if (!['the', 'a', 'an', 'to', 'in', 'on', 'at', 'for'].includes(candidate)) {
      return match[1];
    }
  }

  // Pattern 2: Handle cases where word might be in quotes
  match = definition.match(/\bof\s+["']([^"']+)["']/i);
  if (match && match[1]) {
    return match[1];
  }

  // Pattern 3: Handle compound words with spaces (less common)
  // "plural of hot dog" - grab up to the end or first delimiter
  match = definition.match(/\bof\s+(?:the\s+)?([a-zA-ZÀ-ÿ\-]+(?:\s+[a-zA-ZÀ-ÿ\-]+)?)(?:\s*[,:(]|$)/i);
  if (match && match[1]) {
    const candidate = match[1].trim();
    // Return only if it looks like a word (not too long)
    if (candidate.length <= 30 && !candidate.includes('  ')) {
      return candidate;
    }
  }

  return null;
}

/**
 * Check if a word exists in the dictionary
 */
export function hasWord(word: string, language: SupportedLanguage): boolean {
  return lookupWord(word, language) !== null;
}

/**
 * Check if a language is supported
 */
export function isSupportedLanguage(language: string): language is SupportedLanguage {
  return language === 'German' || language === 'Spanish' || language === 'French';
}

/**
 * Get dictionary statistics
 */
export function getDictionaryStats(language: SupportedLanguage): { totalWords: number; loaded: boolean } {
  try {
    const db = getDb(language);
    const result = db.prepare('SELECT COUNT(*) as count FROM words').get() as { count: number };
    return { totalWords: result.count, loaded: true };
  } catch {
    return { totalWords: 0, loaded: false };
  }
}

/**
 * Check if database exists for a language
 */
export function isDatabaseAvailable(language: SupportedLanguage): boolean {
  return fs.existsSync(getDbPath(language));
}

/**
 * Search for words starting with a prefix (for autocomplete)
 */
export function searchPrefix(
  prefix: string,
  language: SupportedLanguage,
  limit: number = 10
): DictionaryEntry[] {
  try {
    const normalizedPrefix = prefix.toLowerCase().trim();
    if (!normalizedPrefix || normalizedPrefix.length < 2) return [];

    const db = getDb(language);
    const rows = db.prepare(`
      SELECT
        word_original as word,
        part_of_speech as partOfSpeech,
        definition,
        definitions_json as definitionsJson,
        forms,
        ipa,
        audio,
        gender,
        article,
        plural,
        genitive,
        past_participle as pastParticiple,
        preterite
      FROM words
      WHERE word_lower LIKE ?
        AND definition NOT LIKE 'inflection of%'
        AND definition NOT LIKE 'plural of%'
        AND definition NOT LIKE 'singular of%'
        AND definition NOT LIKE '%form of%'
        AND definition NOT LIKE '%spelling of%'
        AND definition NOT LIKE '%participle of%'
      ORDER BY LENGTH(word_original)
      LIMIT ?
    `).all(`${normalizedPrefix}%`, limit) as Record<string, unknown>[];

    return rows.map(row => parseRow(row, language));
  } catch (err) {
    console.error('[Dictionary] Search error:', err);
    return [];
  }
}
