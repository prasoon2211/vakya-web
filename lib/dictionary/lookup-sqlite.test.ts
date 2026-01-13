/**
 * Dictionary Lookup Tests
 *
 * Tests the SQLite dictionary lookup functionality for German, French, and Spanish.
 * Uses Bun's native bun:sqlite for testing (faster and compatible with bun test).
 *
 * Run with: bun test lib/dictionary/lookup-sqlite.test.ts
 */

import { describe, test, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import * as path from 'path';
import * as fs from 'fs';

const DICT_DIR = path.join(process.cwd(), 'lib/dictionary');

// Database instances for testing
let germanDb: Database | null = null;
let frenchDb: Database | null = null;
let spanishDb: Database | null = null;

function getGermanDb(): Database {
  if (!germanDb) {
    const dbPath = path.join(DICT_DIR, 'dictionary-de.db');
    germanDb = new Database(dbPath, { readonly: true });
  }
  return germanDb;
}

function getFrenchDb(): Database {
  if (!frenchDb) {
    const dbPath = path.join(DICT_DIR, 'dictionary-fr.db');
    frenchDb = new Database(dbPath, { readonly: true });
  }
  return frenchDb;
}

function getSpanishDb(): Database {
  if (!spanishDb) {
    const dbPath = path.join(DICT_DIR, 'dictionary-es.db');
    spanishDb = new Database(dbPath, { readonly: true });
  }
  return spanishDb;
}

// Lookup function using bun:sqlite (mirrors the logic in lookup-sqlite.ts)
interface DbRow {
  word: string;
  partOfSpeech: string | null;
  definition: string | null;
  definitionsJson: string | null;
  forms: string | null;
  ipa: string | null;
  audio: string | null;
  gender: string | null;
  article: string | null;
  plural: string | null;
  genitive: string | null;
  pastParticiple: string | null;
  preterite: string | null;
}

function lookupWord(word: string, language: 'German' | 'French' | 'Spanish'): DbRow | null {
  const db = language === 'German' ? getGermanDb() : language === 'French' ? getFrenchDb() : getSpanishDb();
  const trimmedWord = word.trim();
  const normalizedWord = trimmedWord.toLowerCase();
  if (!normalizedWord) return null;

  // For German: use deterministic rule - capitalized words are nouns
  if (language === 'German' && /^[A-ZÄÖÜ]/.test(trimmedWord)) {
    // Look for noun entries first
    const nounSql = `
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
          ELSE 1
        END,
        LENGTH(definition) DESC
      LIMIT 1
    `;
    const nounResult = db.query<DbRow, [string]>(nounSql).get(normalizedWord);
    if (nounResult) return nounResult;
  }

  // German has enhanced columns (gender, article, plural, etc.)
  // French and Spanish only have base columns
  const sql = language === 'German'
    ? `
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
          WHEN definition LIKE 'alternative%' THEN 5
          WHEN definition LIKE 'obsolete%' THEN 5
          WHEN definition LIKE 'archaic%' THEN 5
          WHEN definition LIKE '%form of%' THEN 5
          WHEN definition LIKE '%spelling of%' THEN 5
          ELSE 1
        END,
        CASE
          WHEN part_of_speech LIKE '%noun%' THEN 1
          WHEN part_of_speech LIKE '%adjective%' THEN 2
          WHEN part_of_speech LIKE '%adverb%' THEN 3
          ELSE 4
        END,
        LENGTH(definition) DESC
      LIMIT 1
    `
    : `
      SELECT
        word_original as word,
        part_of_speech as partOfSpeech,
        definition,
        definitions_json as definitionsJson,
        forms,
        ipa,
        audio,
        NULL as gender,
        NULL as article,
        NULL as plural,
        NULL as genitive,
        NULL as pastParticiple,
        NULL as preterite
      FROM words
      WHERE word_lower = ?
      ORDER BY
        CASE
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
          WHEN definition LIKE 'alternative%' THEN 5
          WHEN definition LIKE 'obsolete%' THEN 5
          WHEN definition LIKE 'archaic%' THEN 5
          WHEN definition LIKE '%form of%' THEN 5
          WHEN definition LIKE '%spelling of%' THEN 5
          ELSE 1
        END,
        LENGTH(definition) DESC
      LIMIT 1
    `;

  const query = db.query<DbRow, [string]>(sql);
  return query.get(normalizedWord);
}

// Helper to check if a definition contains actual meaning (not just a redirect)
function hasActualMeaning(definition: string | null): boolean {
  if (!definition) return false;

  const pureRedirectPatterns = [
    /^inflection of [a-zäöüßàâçéèêëîïôûùüÿñ]+:?$/i,
    /^plural of [a-zäöüßàâçéèêëîïôûùüÿñ]+$/i,
    /^singular of [a-zäöüßàâçéèêëîïôûùüÿñ]+$/i,
    /^gerund of [a-zäöüßàâçéèêëîïôûùüÿñ]+$/i,
    /^singular imperative of [a-zäöüßàâçéèêëîïôûùüÿñ]+$/i,
  ];

  for (const pattern of pureRedirectPatterns) {
    if (pattern.test(definition)) {
      return false;
    }
  }

  return true;
}

// ============================================================================
// DATABASE AVAILABILITY
// ============================================================================

describe('Database Availability', () => {
  test('German database exists', () => {
    expect(fs.existsSync(path.join(DICT_DIR, 'dictionary-de.db'))).toBe(true);
  });

  test('French database exists', () => {
    expect(fs.existsSync(path.join(DICT_DIR, 'dictionary-fr.db'))).toBe(true);
  });

  test('Spanish database exists', () => {
    expect(fs.existsSync(path.join(DICT_DIR, 'dictionary-es.db'))).toBe(true);
  });

  test('German database is readable', () => {
    const db = getGermanDb();
    const count = db.query<{ count: number }, []>('SELECT COUNT(*) as count FROM words').get();
    expect(count?.count).toBeGreaterThan(100000);
  });
});

// ============================================================================
// GERMAN TESTS
// ============================================================================

describe('German - Basic Lookups', () => {
  test('finds common nouns', () => {
    const words = ['haus', 'hund', 'katze', 'mann', 'frau', 'kind', 'buch', 'tisch'];
    for (const word of words) {
      const result = lookupWord(word, 'German');
      expect(result).not.toBeNull();
      expect(result?.definition).toBeTruthy();
      expect(hasActualMeaning(result?.definition ?? null)).toBe(true);
    }
  });

  test('finds common verbs', () => {
    const words = ['gehen', 'laufen', 'sprechen', 'kommen', 'sehen', 'machen'];
    for (const word of words) {
      const result = lookupWord(word, 'German');
      expect(result).not.toBeNull();
      expect(result?.definition).toBeTruthy();
      expect(hasActualMeaning(result?.definition ?? null)).toBe(true);
    }
  });

  test('finds common adjectives', () => {
    const words = ['groß', 'klein', 'schnell', 'schön', 'gut'];
    for (const word of words) {
      const result = lookupWord(word, 'German');
      expect(result).not.toBeNull();
      expect(result?.definition).toBeTruthy();
    }
  });
});

describe('German - Gender and Articles', () => {
  test('returns correct article for masculine nouns', () => {
    const result = lookupWord('hund', 'German');
    expect(result).not.toBeNull();
    expect(result?.article).toBe('der');
    expect(result?.gender).toBe('m');
  });

  test('returns correct article for feminine nouns', () => {
    const result = lookupWord('katze', 'German');
    expect(result).not.toBeNull();
    expect(result?.article).toBe('die');
    expect(result?.gender).toBe('f');
  });

  test('returns correct article for neuter nouns', () => {
    const result = lookupWord('haus', 'German');
    expect(result).not.toBeNull();
    expect(result?.article).toBe('das');
    expect(result?.gender).toBe('n');
  });

  test('returns plural forms for nouns', () => {
    const testCases = [
      { word: 'hund', expectedPlural: 'Hunde' },
      { word: 'haus', expectedPlural: 'Häuser' },
      { word: 'kind', expectedPlural: 'Kinder' },
      { word: 'mann', expectedPlural: 'Männer' },
      { word: 'frau', expectedPlural: 'Frauen' },
    ];

    for (const { word, expectedPlural } of testCases) {
      const result = lookupWord(word, 'German');
      expect(result).not.toBeNull();
      expect(result?.plural).toBe(expectedPlural);
    }
  });
});

describe('German - Ordering Preference', () => {
  test('prefers noun "Haus" over verb imperative "haus"', () => {
    const result = lookupWord('haus', 'German');
    expect(result).not.toBeNull();
    expect(result?.definition).toBe('house');
    expect(result?.definition).not.toContain('imperative');
  });

  test('prefers verb "überprüfen" over noun gerund "Überprüfen"', () => {
    const result = lookupWord('überprüfen', 'German');
    expect(result).not.toBeNull();
    expect(result?.definition).toContain('to check');
    expect(result?.definition).not.toContain('gerund');
  });

  test('prefers real definition for ambiguous words', () => {
    // "aalen" is both a place name and a verb - should return actual meaning
    const result = lookupWord('aalen', 'German');
    expect(result).not.toBeNull();
    expect(hasActualMeaning(result?.definition ?? null)).toBe(true);
  });

  test('capitalized "Aufgaben" returns noun, not verb form', () => {
    // "Aufgaben" (capitalized) is noun plural of "Aufgabe" (task)
    // "aufgaben" (lowercase) is a verb form of "aufgeben" (to give up)
    // When user types "Aufgaben" with capital, prefer the noun
    const result = lookupWord('Aufgaben', 'German');
    expect(result).not.toBeNull();
    expect(result?.partOfSpeech).toContain('noun');
    expect(result?.definition).toContain('Aufgabe');
  });

  test('capitalized "Beamten" returns noun, not verb', () => {
    // "Beamten" (capitalized) is noun (inflection of Beamter = civil servant)
    // "beamten" (lowercase) is a verb meaning "to provide a post to"
    // Capitalized = noun in German
    const result = lookupWord('Beamten', 'German');
    expect(result).not.toBeNull();
    expect(result?.partOfSpeech).toContain('noun');
    expect(result?.definition).toContain('Beamter');
  });

  test('lowercase "aufgaben" still prefers noun over verb inflection', () => {
    // Even when lowercase, we prefer nouns over verb inflection forms
    // because they're more useful for language learners
    const result = lookupWord('aufgaben', 'German');
    expect(result).not.toBeNull();
    expect(result?.partOfSpeech).toContain('noun');
  });
});

describe('German - Edge Cases', () => {
  test('handles words with umlauts', () => {
    const words = ['größe', 'schön', 'für', 'über', 'müde'];
    for (const word of words) {
      const result = lookupWord(word, 'German');
      expect(result).not.toBeNull();
    }
  });

  test('handles compound words', () => {
    const result = lookupWord('krankenhaus', 'German');
    expect(result).not.toBeNull();
    expect(result?.definition).toBeTruthy();
  });

  test('returns null for non-existent words', () => {
    const result = lookupWord('xyznotaword', 'German');
    expect(result).toBeNull();
  });

  test('handles empty string', () => {
    const result = lookupWord('', 'German');
    expect(result).toBeNull();
  });

  test('handles whitespace-only string', () => {
    const result = lookupWord('   ', 'German');
    expect(result).toBeNull();
  });

  test('lookup is case-insensitive', () => {
    const lower = lookupWord('haus', 'German');
    const upper = lookupWord('HAUS', 'German');
    const mixed = lookupWord('HaUs', 'German');

    expect(lower).not.toBeNull();
    expect(upper).not.toBeNull();
    expect(mixed).not.toBeNull();
    expect(lower?.definition).toBe(upper?.definition);
    expect(lower?.definition).toBe(mixed?.definition);
  });
});

// ============================================================================
// FRENCH TESTS
// ============================================================================

describe('French - Basic Lookups', () => {
  test('finds common nouns', () => {
    const words = ['maison', 'chien', 'chat', 'homme', 'femme', 'livre'];
    for (const word of words) {
      const result = lookupWord(word, 'French');
      expect(result).not.toBeNull();
      expect(result?.definition).toBeTruthy();
    }
  });

  test('finds common verbs', () => {
    const words = ['aller', 'parler', 'manger', 'voir', 'faire'];
    for (const word of words) {
      const result = lookupWord(word, 'French');
      expect(result).not.toBeNull();
      expect(result?.definition).toBeTruthy();
      expect(hasActualMeaning(result?.definition ?? null)).toBe(true);
    }
  });

  test('finds common adjectives', () => {
    const words = ['grand', 'petit', 'beau', 'bon', 'nouveau'];
    for (const word of words) {
      const result = lookupWord(word, 'French');
      expect(result).not.toBeNull();
    }
  });
});

describe('French - Edge Cases', () => {
  test('handles words with accents', () => {
    const words = ['été', 'français', 'café', 'être', 'où'];
    for (const word of words) {
      const result = lookupWord(word, 'French');
      expect(result).not.toBeNull();
    }
  });

  test('lookup is case-insensitive', () => {
    const lower = lookupWord('maison', 'French');
    const upper = lookupWord('MAISON', 'French');

    expect(lower).not.toBeNull();
    expect(upper).not.toBeNull();
    expect(lower?.definition).toBe(upper?.definition);
  });
});

// ============================================================================
// SPANISH TESTS
// ============================================================================

describe('Spanish - Basic Lookups', () => {
  test('finds common nouns', () => {
    const words = ['casa', 'perro', 'gato', 'hombre', 'mujer', 'libro'];
    for (const word of words) {
      const result = lookupWord(word, 'Spanish');
      expect(result).not.toBeNull();
      expect(result?.definition).toBeTruthy();
    }
  });

  test('finds common verbs', () => {
    const words = ['hablar', 'comer', 'vivir', 'ser', 'estar', 'tener'];
    for (const word of words) {
      const result = lookupWord(word, 'Spanish');
      expect(result).not.toBeNull();
      expect(result?.definition).toBeTruthy();
      expect(hasActualMeaning(result?.definition ?? null)).toBe(true);
    }
  });

  test('finds common adjectives', () => {
    const words = ['grande', 'pequeño', 'bueno', 'malo', 'nuevo'];
    for (const word of words) {
      const result = lookupWord(word, 'Spanish');
      expect(result).not.toBeNull();
    }
  });
});

describe('Spanish - Edge Cases', () => {
  test('handles words with ñ', () => {
    const words = ['español', 'niño', 'año', 'señor'];
    for (const word of words) {
      const result = lookupWord(word, 'Spanish');
      expect(result).not.toBeNull();
    }
  });

  test('handles words with accents', () => {
    const words = ['está', 'qué', 'más', 'también'];
    for (const word of words) {
      const result = lookupWord(word, 'Spanish');
      expect(result).not.toBeNull();
    }
  });

  test('lookup is case-insensitive', () => {
    const lower = lookupWord('casa', 'Spanish');
    const upper = lookupWord('CASA', 'Spanish');

    expect(lower).not.toBeNull();
    expect(upper).not.toBeNull();
    expect(lower?.definition).toBe(upper?.definition);
  });
});

// ============================================================================
// INFLECTION RESOLUTION TESTS (Testing the ORDER BY logic)
// ============================================================================

describe('Inflection Resolution - ORDER BY Logic', () => {
  test('verb infinitive returns actual meaning, not gerund reference', () => {
    // "überprüfen" has both a verb entry and a noun (gerund) entry
    const result = lookupWord('überprüfen', 'German');
    expect(result?.definition).toContain('to check');
    expect(result?.definition).not.toMatch(/^gerund of/i);
  });

  test('noun returns actual meaning, not imperative reference', () => {
    // "haus" exists as both noun (house) and verb (imperative of hausen)
    const result = lookupWord('haus', 'German');
    expect(result?.definition).toBe('house');
  });

  test('common word returns meaning, not alternative form', () => {
    // Most common words should return actual definitions
    const result = lookupWord('gehen', 'German');
    expect(result?.definition).toContain('to go');
    expect(result?.definition).not.toMatch(/^alternative/i);
  });
});

// ============================================================================
// PERFORMANCE TESTS
// ============================================================================

describe('Performance', () => {
  test('lookup completes within reasonable time', () => {
    const start = performance.now();

    for (let i = 0; i < 100; i++) {
      lookupWord('haus', 'German');
      lookupWord('maison', 'French');
      lookupWord('casa', 'Spanish');
    }

    const elapsed = performance.now() - start;
    // 300 lookups should complete in under 500ms
    expect(elapsed).toBeLessThan(500);
  });

  test('German database query is fast', () => {
    const db = getGermanDb();
    const start = performance.now();

    for (let i = 0; i < 1000; i++) {
      db.query('SELECT * FROM words WHERE word_lower = ? LIMIT 1').get('haus');
    }

    const elapsed = performance.now() - start;
    // 1000 queries should complete in under 200ms
    expect(elapsed).toBeLessThan(200);
  });
});
