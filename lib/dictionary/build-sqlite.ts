#!/usr/bin/env npx tsx
/**
 * Build SQLite dictionary databases from Wiktionary NDJSON files
 *
 * Usage: npx tsx lib/dictionary/build-sqlite.ts
 *
 * Input: ~/Downloads/dictionary-{de,es,fr}.json (Wiktionary NDJSON)
 * Output: lib/dictionary/dictionary-{de,es,fr}.db (3 separate SQLite databases)
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const LANGUAGES = {
  de: 'German',
  es: 'Spanish',
  fr: 'French',
} as const;

const INPUT_DIR = path.join(process.env.HOME || '', 'Downloads');
const OUTPUT_DIR = path.join(process.cwd(), 'lib/dictionary');

interface WiktionaryEntry {
  '': string;        // word
  p?: string[];      // parts of speech
  d?: string[];      // definitions
  f?: string[];      // forms (conjugations, declensions)
  i?: string;        // IPA pronunciation
  a?: string;        // audio file path
}

async function processLanguage(
  langCode: keyof typeof LANGUAGES
): Promise<{ count: number; dbSize: number }> {
  const inputFile = path.join(INPUT_DIR, `dictionary-${langCode}.json`);
  const outputDb = path.join(OUTPUT_DIR, `dictionary-${langCode}.db`);

  if (!fs.existsSync(inputFile)) {
    console.error(`File not found: ${inputFile}`);
    return { count: 0, dbSize: 0 };
  }

  const language = LANGUAGES[langCode];
  console.log(`\nProcessing ${language}...`);
  console.log(`  Input: ${inputFile}`);
  console.log(`  Output: ${outputDb}`);

  // Remove existing database
  if (fs.existsSync(outputDb)) {
    fs.unlinkSync(outputDb);
  }

  // Create new database
  const db = new Database(outputDb);

  // Enable WAL mode for better write performance
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  // Create table
  db.exec(`
    CREATE TABLE words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word_lower TEXT NOT NULL,
      word_original TEXT NOT NULL,
      part_of_speech TEXT,
      definition TEXT,
      definitions_json TEXT,
      forms TEXT,
      ipa TEXT,
      audio TEXT
    );
  `);

  // Prepare insert statement
  const insertStmt = db.prepare(`
    INSERT INTO words (word_lower, word_original, part_of_speech, definition, definitions_json, forms, ipa, audio)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const fileStream = fs.createReadStream(inputFile);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let count = 0;
  let batch: WiktionaryEntry[] = [];
  const BATCH_SIZE = 5000;

  const processBatch = () => {
    const transaction = db.transaction(() => {
      for (const entry of batch) {
        const word = entry[''];
        if (!word || word.length < 1) continue;

        const definition = entry.d?.[0] || null;

        insertStmt.run(
          word.toLowerCase(),
          word,
          entry.p?.join(', ') || null,
          definition,
          JSON.stringify(entry.d || []),
          entry.f?.join(', ') || null,
          entry.i || null,
          entry.a || null
        );
        count++;
      }
    });
    transaction();
    batch = [];
  };

  for await (const line of rl) {
    if (!line.trim()) continue;

    try {
      const entry = JSON.parse(line) as WiktionaryEntry;
      batch.push(entry);

      if (batch.length >= BATCH_SIZE) {
        processBatch();
        if (count % 50000 === 0) {
          console.log(`  ${count.toLocaleString()} entries...`);
        }
      }
    } catch {
      // Skip malformed lines
    }
  }

  // Process remaining entries
  if (batch.length > 0) {
    processBatch();
  }

  console.log(`  Creating index...`);
  db.exec(`CREATE INDEX idx_word_lower ON words(word_lower);`);

  // Convert WAL to single file and optimize
  console.log(`  Optimizing...`);
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.pragma('journal_mode = DELETE');
  db.pragma('optimize');
  db.exec('VACUUM');

  db.close();

  // Clean up WAL files if they exist
  const walFile = outputDb + '-wal';
  const shmFile = outputDb + '-shm';
  if (fs.existsSync(walFile)) fs.unlinkSync(walFile);
  if (fs.existsSync(shmFile)) fs.unlinkSync(shmFile);

  const dbSize = fs.statSync(outputDb).size;
  console.log(`  Completed: ${count.toLocaleString()} entries, ${(dbSize / 1024 / 1024).toFixed(1)} MB`);

  return { count, dbSize };
}

async function main() {
  console.log('Building SQLite dictionary databases (one per language)...');

  const results: Record<string, { count: number; dbSize: number }> = {};

  for (const langCode of Object.keys(LANGUAGES) as (keyof typeof LANGUAGES)[]) {
    results[langCode] = await processLanguage(langCode);
  }

  console.log('\n=== Summary ===');
  let totalCount = 0;
  let totalSize = 0;
  for (const [code, { count, dbSize }] of Object.entries(results)) {
    const lang = LANGUAGES[code as keyof typeof LANGUAGES];
    console.log(`${lang}: ${count.toLocaleString()} entries, ${(dbSize / 1024 / 1024).toFixed(1)} MB`);
    totalCount += count;
    totalSize += dbSize;
  }
  console.log(`Total: ${totalCount.toLocaleString()} entries, ${(totalSize / 1024 / 1024).toFixed(1)} MB`);

  console.log('\nDatabases saved to:');
  for (const langCode of Object.keys(LANGUAGES)) {
    console.log(`  lib/dictionary/dictionary-${langCode}.db`);
  }
}

main().catch(console.error);
