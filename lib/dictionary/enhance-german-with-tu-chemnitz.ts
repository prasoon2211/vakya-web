#!/usr/bin/env npx tsx
/**
 * Enhance German Dictionary with TU Chemnitz Data
 *
 * This script downloads the TU Chemnitz German-English dictionary and uses it
 * to add/improve gender information, plural forms, and other grammatical data
 * in the existing German SQLite dictionary.
 *
 * TU Chemnitz format examples:
 *   - Hund {m} | Hunde {pl} :: dog | dogs
 *   - Katze {f} | Katzen {pl} :: cat | cats
 *   - Haus {n} | Häuser {pl} :: house | houses
 *
 * Usage: npx tsx lib/dictionary/enhance-german-with-tu-chemnitz.ts
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { execSync } from 'child_process';
import * as https from 'https';
import * as zlib from 'zlib';

const DICT_DIR = path.join(process.cwd(), 'lib/dictionary');
const GERMAN_DB = path.join(DICT_DIR, 'dictionary-de.db');
const TU_CHEMNITZ_URL = 'https://ftp.tu-chemnitz.de/pub/Local/urz/ding/de-en-devel/de-en.txt.gz';
const TU_CHEMNITZ_LOCAL = path.join(DICT_DIR, 'tu-chemnitz-de-en.txt');

interface GenderInfo {
  gender: 'm' | 'f' | 'n' | null;
  article: 'der' | 'die' | 'das' | null;
  plural: string | null;
  genitive: string | null;
}

interface TuChemnitzEntry {
  word: string;
  wordLower: string;
  gender: 'm' | 'f' | 'n' | null;
  plural: string | null;
  genitive: string | null;
  partOfSpeech: string | null;
  isNoun: boolean;
  isVerb: boolean;
  isAdjective: boolean;
  pastParticiple: string | null;
  preterite: string | null;
  translations: string[];
  rawLine: string;
}

// Map gender codes to articles
const GENDER_TO_ARTICLE: Record<string, 'der' | 'die' | 'das'> = {
  m: 'der',
  f: 'die',
  n: 'das',
};

/**
 * Download TU Chemnitz dictionary if not already present
 */
async function downloadTuChemnitz(): Promise<void> {
  if (fs.existsSync(TU_CHEMNITZ_LOCAL)) {
    console.log('[TU Chemnitz] Dictionary already downloaded');
    return;
  }

  console.log('[TU Chemnitz] Downloading dictionary...');

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(TU_CHEMNITZ_LOCAL);

    https.get(TU_CHEMNITZ_URL, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Follow redirect
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          https.get(redirectUrl, (redirectResponse) => {
            const gunzip = zlib.createGunzip();
            redirectResponse.pipe(gunzip).pipe(file);
            file.on('finish', () => {
              file.close();
              console.log('[TU Chemnitz] Download complete');
              resolve();
            });
          }).on('error', reject);
        }
      } else {
        const gunzip = zlib.createGunzip();
        response.pipe(gunzip).pipe(file);
        file.on('finish', () => {
          file.close();
          console.log('[TU Chemnitz] Download complete');
          resolve();
        });
      }
    }).on('error', (err) => {
      fs.unlink(TU_CHEMNITZ_LOCAL, () => {});
      reject(err);
    });
  });
}

/**
 * Parse a single TU Chemnitz dictionary line
 * Format: German entry :: English entry
 * Gender markers: {m}, {f}, {n}
 * Plural marker: {pl}
 * Verb markers: {vi}, {vt}, {vr}
 *
 * Examples:
 *   Gericht {n}; Gerichtshof {m} [jur.] | Gerichte {pl}; Gerichtshöfe {pl}
 *   Hund {m} | Hunde {pl} :: dog | dogs
 */
function parseTuChemnitzLine(line: string): TuChemnitzEntry[] {
  const entries: TuChemnitzEntry[] = [];

  // Skip comments and empty lines
  if (line.startsWith('#') || !line.includes('::')) {
    return entries;
  }

  const [germanPart, englishPart] = line.split('::').map(s => s.trim());
  if (!germanPart || !englishPart) return entries;

  const englishTranslations = englishPart.split('|').map(s => s.trim());

  // Split on | to get variants (singular | plural sections)
  const germanVariants = germanPart.split('|').map(s => s.trim());

  // Collect all word segments from all variants
  // A segment is separated by ; within a variant
  const allSegments: { segment: string; isFromPluralSection: boolean }[] = [];

  for (let i = 0; i < germanVariants.length; i++) {
    const variant = germanVariants[i];
    const isFromPluralSection = variant.includes('{pl}');

    // Split each variant by semicolon to get individual words
    const segments = variant.split(';').map(s => s.trim());
    for (const segment of segments) {
      if (segment) {
        allSegments.push({ segment, isFromPluralSection });
      }
    }
  }

  // Track singular entries for linking plurals
  const singularEntries: Map<string, TuChemnitzEntry> = new Map();

  // Process each segment
  for (const { segment, isFromPluralSection } of allSegments) {
    // Extract gender: {m}, {f}, {n}
    const genderMatch = segment.match(/\{([mfn])\}/);
    const gender = genderMatch ? (genderMatch[1] as 'm' | 'f' | 'n') : null;

    // Check if plural
    const isPlural = segment.includes('{pl}');

    // Check for verb indicators
    const isVerb = /\{v[itr]\}/.test(segment) || /\{v[itr],[itr]\}/.test(segment);

    // Check for adjective
    const isAdjective = segment.includes('{adj}');

    // Extract the base word (remove annotations)
    let word = segment
      .replace(/\{[^}]+\}/g, '')  // Remove all {...} annotations
      .replace(/\[[^\]]+\]/g, '') // Remove all [...] annotations
      .replace(/\([^)]+\)/g, '')  // Remove all (...) annotations
      .replace(/<[^>]+>/g, '')    // Remove all <...> annotations
      .trim();

    // Clean up multiple spaces
    word = word.replace(/\s+/g, ' ').trim();

    if (!word || word.length < 1) continue;

    // Skip plural-only entries (we'll use them for linking)
    if (isPlural && !gender) {
      // This is a plural form - try to link to corresponding singular
      // The plural word might match a singular entry by stem
      continue;
    }

    const isNoun = gender !== null;

    if (isNoun && gender) {
      const entry: TuChemnitzEntry = {
        word,
        wordLower: word.toLowerCase(),
        gender,
        plural: null,
        genitive: null,
        partOfSpeech: 'noun',
        isNoun: true,
        isVerb: false,
        isAdjective: false,
        pastParticiple: null,
        preterite: null,
        translations: englishTranslations,
        rawLine: line,
      };
      entries.push(entry);
      singularEntries.set(word.toLowerCase(), entry);
    } else if (isVerb) {
      entries.push({
        word,
        wordLower: word.toLowerCase(),
        gender: null,
        plural: null,
        genitive: null,
        partOfSpeech: 'verb',
        isNoun: false,
        isVerb: true,
        isAdjective: false,
        pastParticiple: null,
        preterite: null,
        translations: englishTranslations,
        rawLine: line,
      });
    }
  }

  // Second pass: link plurals to singulars
  // Pattern: "Hund {m} | Hunde {pl}" or "Gericht {n}; Gerichtshof {m} | Gerichte {pl}; Gerichtshöfe {pl}"
  for (const { segment, isFromPluralSection } of allSegments) {
    if (!segment.includes('{pl}')) continue;

    const pluralWord = segment
      .replace(/\{[^}]+\}/g, '')
      .replace(/\[[^\]]+\]/g, '')
      .replace(/\([^)]+\)/g, '')
      .trim();

    if (!pluralWord) continue;

    // Try to find matching singular by common stem
    // German plurals often: add -e, -en, -er, -n, -s, or umlaut changes
    const pluralLower = pluralWord.toLowerCase();

    // Check each singular entry
    for (const [singularLower, entry] of singularEntries) {
      // Simple heuristic: plural starts with singular stem
      if (pluralLower.startsWith(singularLower.slice(0, -1)) ||
          singularLower.startsWith(pluralLower.slice(0, -2))) {
        if (!entry.plural) {
          entry.plural = pluralWord;
        }
        break;
      }
      // Handle umlaut changes (a->ä, o->ö, u->ü)
      const singularNoUmlaut = singularLower.replace(/[äöü]/g, c => ({ 'ä': 'a', 'ö': 'o', 'ü': 'u' }[c] || c));
      const pluralNoUmlaut = pluralLower.replace(/[äöü]/g, c => ({ 'ä': 'a', 'ö': 'o', 'ü': 'u' }[c] || c));
      if (pluralNoUmlaut.startsWith(singularNoUmlaut.slice(0, -1))) {
        if (!entry.plural) {
          entry.plural = pluralWord;
        }
        break;
      }
    }
  }

  return entries;
}

/**
 * Parse verb forms from TU Chemnitz line
 * Format: verb; preterite; past participle
 */
function parseVerbForms(line: string): { baseForm: string; preterite: string; pastParticiple: string } | null {
  // Pattern: "gehen; ging; gegangen {vi}"
  const verbMatch = line.match(/^([^;{]+);\s*([^;{]+);\s*([^;{]+)\s*\{v[itr]/);
  if (verbMatch) {
    return {
      baseForm: verbMatch[1].trim(),
      preterite: verbMatch[2].trim(),
      pastParticiple: verbMatch[3].trim(),
    };
  }
  return null;
}

/**
 * Build a lookup map from TU Chemnitz dictionary
 */
async function buildTuChemnitzMap(): Promise<Map<string, TuChemnitzEntry>> {
  const map = new Map<string, TuChemnitzEntry>();

  if (!fs.existsSync(TU_CHEMNITZ_LOCAL)) {
    console.error('[TU Chemnitz] Dictionary file not found');
    return map;
  }

  console.log('[TU Chemnitz] Parsing dictionary...');

  const fileStream = fs.createReadStream(TU_CHEMNITZ_LOCAL, { encoding: 'utf-8' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let lineCount = 0;
  let entryCount = 0;

  for await (const line of rl) {
    lineCount++;
    const entries = parseTuChemnitzLine(line);

    for (const entry of entries) {
      // Only add if we have useful info (gender for nouns)
      if (entry.isNoun && entry.gender) {
        // Don't overwrite existing entries with better data
        const existing = map.get(entry.wordLower);
        if (!existing || (entry.plural && !existing.plural)) {
          map.set(entry.wordLower, entry);
          entryCount++;
        }
      }

      // Also check for verb forms
      const verbForms = parseVerbForms(line);
      if (verbForms) {
        const verbEntry: TuChemnitzEntry = {
          word: verbForms.baseForm,
          wordLower: verbForms.baseForm.toLowerCase(),
          gender: null,
          plural: null,
          genitive: null,
          partOfSpeech: 'verb',
          isNoun: false,
          isVerb: true,
          isAdjective: false,
          pastParticiple: verbForms.pastParticiple,
          preterite: verbForms.preterite,
          translations: [],
          rawLine: line,
        };

        const existingVerb = map.get(verbEntry.wordLower);
        if (!existingVerb || (!existingVerb.isVerb && verbEntry.isVerb)) {
          map.set(verbEntry.wordLower, verbEntry);
        }
      }
    }

    if (lineCount % 50000 === 0) {
      console.log(`  Processed ${lineCount.toLocaleString()} lines, ${entryCount.toLocaleString()} entries...`);
    }
  }

  console.log(`[TU Chemnitz] Parsed ${lineCount.toLocaleString()} lines, extracted ${entryCount.toLocaleString()} entries with gender info`);
  return map;
}

/**
 * Enhance the German SQLite database with TU Chemnitz data
 */
async function enhanceGermanDb(tuChemnitzMap: Map<string, TuChemnitzEntry>): Promise<void> {
  if (!fs.existsSync(GERMAN_DB)) {
    console.error(`[Enhance] German database not found at ${GERMAN_DB}`);
    return;
  }

  console.log('[Enhance] Opening German database...');
  const db = new Database(GERMAN_DB);

  // Check if we need to add new columns
  const tableInfo = db.prepare("PRAGMA table_info(words)").all() as { name: string }[];
  const existingColumns = tableInfo.map(c => c.name);

  const columnsToAdd = [
    { name: 'gender', type: 'TEXT' },
    { name: 'article', type: 'TEXT' },
    { name: 'plural', type: 'TEXT' },
    { name: 'genitive', type: 'TEXT' },
    { name: 'past_participle', type: 'TEXT' },
    { name: 'preterite', type: 'TEXT' },
  ];

  for (const col of columnsToAdd) {
    if (!existingColumns.includes(col.name)) {
      console.log(`[Enhance] Adding column: ${col.name}`);
      db.exec(`ALTER TABLE words ADD COLUMN ${col.name} ${col.type}`);
    }
  }

  // Prepare update statement
  const updateStmt = db.prepare(`
    UPDATE words SET
      gender = COALESCE(?, gender),
      article = COALESCE(?, article),
      plural = COALESCE(?, plural),
      genitive = COALESCE(?, genitive),
      past_participle = COALESCE(?, past_participle),
      preterite = COALESCE(?, preterite)
    WHERE word_lower = ?
  `);

  // Get all words from the database
  console.log('[Enhance] Fetching words from database...');
  const wordsQuery = db.prepare('SELECT id, word_lower, word_original, part_of_speech, forms FROM words');
  const allWords = wordsQuery.all() as {
    id: number;
    word_lower: string;
    word_original: string;
    part_of_speech: string | null;
    forms: string | null;
  }[];

  console.log(`[Enhance] Found ${allWords.length.toLocaleString()} words in database`);

  let updatedCount = 0;
  let genderAddedCount = 0;
  let pluralAddedCount = 0;
  let verbFormAddedCount = 0;

  // Process in batches
  const BATCH_SIZE = 5000;
  let batch: { word_lower: string; gender: string | null; article: string | null; plural: string | null; genitive: string | null; pastParticiple: string | null; preterite: string | null }[] = [];

  const processBatch = () => {
    const transaction = db.transaction(() => {
      for (const item of batch) {
        updateStmt.run(
          item.gender,
          item.article,
          item.plural,
          item.genitive,
          item.pastParticiple,
          item.preterite,
          item.word_lower
        );
      }
    });
    transaction();
    batch = [];
  };

  for (const word of allWords) {
    const tuEntry = tuChemnitzMap.get(word.word_lower);

    if (tuEntry) {
      let shouldUpdate = false;
      let gender: string | null = null;
      let article: string | null = null;
      let plural: string | null = null;
      let genitive: string | null = null;
      let pastParticiple: string | null = null;
      let preterite: string | null = null;

      // Add gender info for nouns
      if (tuEntry.isNoun && tuEntry.gender) {
        gender = tuEntry.gender;
        article = GENDER_TO_ARTICLE[tuEntry.gender];
        shouldUpdate = true;
        genderAddedCount++;

        if (tuEntry.plural) {
          plural = tuEntry.plural;
          pluralAddedCount++;
        }

        if (tuEntry.genitive) {
          genitive = tuEntry.genitive;
        }
      }

      // Add verb forms
      if (tuEntry.isVerb) {
        if (tuEntry.pastParticiple) {
          pastParticiple = tuEntry.pastParticiple;
          shouldUpdate = true;
          verbFormAddedCount++;
        }
        if (tuEntry.preterite) {
          preterite = tuEntry.preterite;
          shouldUpdate = true;
        }
      }

      if (shouldUpdate) {
        batch.push({
          word_lower: word.word_lower,
          gender,
          article,
          plural,
          genitive,
          pastParticiple,
          preterite,
        });
        updatedCount++;

        if (batch.length >= BATCH_SIZE) {
          processBatch();
          console.log(`  Updated ${updatedCount.toLocaleString()} words...`);
        }
      }
    }
  }

  // Process remaining batch
  if (batch.length > 0) {
    processBatch();
  }

  // Create indexes on new columns
  console.log('[Enhance] Creating indexes...');
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_gender ON words(gender)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_article ON words(article)');
  } catch (err) {
    // Indexes may already exist
  }

  // Optimize
  console.log('[Enhance] Optimizing database...');
  db.pragma('optimize');
  db.exec('VACUUM');

  db.close();

  console.log('\n=== Enhancement Summary ===');
  console.log(`Total words updated: ${updatedCount.toLocaleString()}`);
  console.log(`Gender info added: ${genderAddedCount.toLocaleString()}`);
  console.log(`Plural forms added: ${pluralAddedCount.toLocaleString()}`);
  console.log(`Verb forms added: ${verbFormAddedCount.toLocaleString()}`);
}

/**
 * Also try to extract gender from existing part_of_speech and forms fields
 * This handles cases where Wiktionary already has the info but in different format
 */
async function extractExistingGenderInfo(db: Database.Database): Promise<void> {
  console.log('[Enhance] Extracting gender from existing fields...');

  // Update entries where we can infer gender from part_of_speech
  const genderPatterns = [
    { pattern: '%masculine%', gender: 'm', article: 'der' },
    { pattern: '%feminine%', gender: 'f', article: 'die' },
    { pattern: '%neuter%', gender: 'n', article: 'das' },
  ];

  for (const { pattern, gender, article } of genderPatterns) {
    db.prepare(`
      UPDATE words
      SET gender = ?, article = ?
      WHERE part_of_speech LIKE ?
        AND gender IS NULL
    `).run(gender, article, pattern);
  }

  // Also check forms field for gender markers
  // Format in Wiktionary: "m" or "f" or "n" at the start
  db.prepare(`
    UPDATE words
    SET gender = 'm', article = 'der'
    WHERE forms LIKE 'm,%' OR forms LIKE 'm '
      AND gender IS NULL
  `).run();

  db.prepare(`
    UPDATE words
    SET gender = 'f', article = 'die'
    WHERE forms LIKE 'f,%' OR forms LIKE 'f '
      AND gender IS NULL
  `).run();

  db.prepare(`
    UPDATE words
    SET gender = 'n', article = 'das'
    WHERE forms LIKE 'n,%' OR forms LIKE 'n '
      AND gender IS NULL
  `).run();
}

async function main() {
  console.log('=== German Dictionary Enhancement with TU Chemnitz Data ===\n');

  // Step 1: Download TU Chemnitz dictionary
  await downloadTuChemnitz();

  // Step 2: Build lookup map
  const tuChemnitzMap = await buildTuChemnitzMap();

  if (tuChemnitzMap.size === 0) {
    console.error('Failed to parse TU Chemnitz dictionary');
    return;
  }

  // Step 3: Enhance German database
  await enhanceGermanDb(tuChemnitzMap);

  // Step 4: Also extract from existing Wiktionary data
  if (fs.existsSync(GERMAN_DB)) {
    const db = new Database(GERMAN_DB);
    await extractExistingGenderInfo(db);

    // Get final stats
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN gender IS NOT NULL THEN 1 ELSE 0 END) as with_gender,
        SUM(CASE WHEN article IS NOT NULL THEN 1 ELSE 0 END) as with_article,
        SUM(CASE WHEN plural IS NOT NULL THEN 1 ELSE 0 END) as with_plural
      FROM words
    `).get() as { total: number; with_gender: number; with_article: number; with_plural: number };

    console.log('\n=== Final Database Statistics ===');
    console.log(`Total words: ${stats.total.toLocaleString()}`);
    console.log(`Words with gender: ${stats.with_gender.toLocaleString()} (${((stats.with_gender / stats.total) * 100).toFixed(1)}%)`);
    console.log(`Words with article: ${stats.with_article.toLocaleString()} (${((stats.with_article / stats.total) * 100).toFixed(1)}%)`);
    console.log(`Words with plural: ${stats.with_plural.toLocaleString()} (${((stats.with_plural / stats.total) * 100).toFixed(1)}%)`);

    db.close();
  }

  console.log('\n=== Enhancement Complete ===');
  console.log(`Enhanced database saved to: ${GERMAN_DB}`);
}

main().catch(console.error);
