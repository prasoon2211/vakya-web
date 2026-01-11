/**
 * Script to parse the TU Chemnitz German-English dictionary
 * and convert it to a compact JSON format for fast lookups.
 *
 * Run with: npx tsx scripts/parse-dictionary.ts
 *
 * This script will:
 * 1. Download de-en.txt.gz if not present
 * 2. Extract it if needed
 * 3. Parse and convert to JSON
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const DICT_URL = 'https://ftp.tu-chemnitz.de/pub/Local/urz/ding/de-en/de-en.txt.gz';
const DICT_DIR = path.join(__dirname, '../lib/dictionary');
const GZ_PATH = path.join(DICT_DIR, 'de-en.txt.gz');
const TXT_PATH = path.join(DICT_DIR, 'de-en.txt');
const JSON_PATH = path.join(DICT_DIR, 'de-en.json');

// Download and extract dictionary if needed
function ensureDictionary() {
  // Ensure directory exists
  if (!fs.existsSync(DICT_DIR)) {
    fs.mkdirSync(DICT_DIR, { recursive: true });
  }

  // If JSON already exists and is recent, skip
  if (fs.existsSync(JSON_PATH)) {
    const stats = fs.statSync(JSON_PATH);
    const ageInDays = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);
    if (ageInDays < 30) {
      console.log('[Dictionary] JSON file exists and is recent, skipping generation');
      return false; // Don't need to regenerate
    }
  }

  // Download if needed
  if (!fs.existsSync(TXT_PATH) && !fs.existsSync(GZ_PATH)) {
    console.log('[Dictionary] Downloading from TU Chemnitz...');
    execSync(`curl -sL "${DICT_URL}" -o "${GZ_PATH}"`, { stdio: 'inherit' });
  }

  // Extract if needed
  if (!fs.existsSync(TXT_PATH) && fs.existsSync(GZ_PATH)) {
    console.log('[Dictionary] Extracting...');
    execSync(`gunzip -f "${GZ_PATH}"`, { stdio: 'inherit' });
  }

  return true; // Need to generate
}

interface DictEntry {
  de: string;           // German word (normalized)
  en: string;           // Primary English translation
  pos?: string;         // Part of speech
  article?: string;     // Article (der/die/das)
  gender?: string;      // Gender (m/f/n)
  full?: string;        // Full entry for complex lookups
}

// Parse grammar annotations like {m}, {f}, {n}, {pl}, {adj}, {v}, etc.
function parseGrammar(text: string): { clean: string; pos?: string; article?: string; gender?: string } {
  const result: { clean: string; pos?: string; article?: string; gender?: string } = {
    clean: text,
  };

  // Extract grammar info from curly braces
  const grammarMatch = text.match(/\{([^}]+)\}/);
  if (grammarMatch) {
    const grammar = grammarMatch[1].toLowerCase();

    // Gender/article detection
    if (grammar === 'm' || grammar.includes('m;')) {
      result.gender = 'masculine';
      result.article = 'der';
      result.pos = 'noun';
    } else if (grammar === 'f' || grammar.includes('f;')) {
      result.gender = 'feminine';
      result.article = 'die';
      result.pos = 'noun';
    } else if (grammar === 'n' || grammar.includes('n;')) {
      result.gender = 'neuter';
      result.article = 'das';
      result.pos = 'noun';
    } else if (grammar === 'pl') {
      result.pos = 'noun';
    } else if (grammar === 'adj' || grammar === 'adj.') {
      result.pos = 'adjective';
    } else if (grammar === 'adv' || grammar === 'adv.') {
      result.pos = 'adverb';
    } else if (grammar === 'v' || grammar === 'vt' || grammar === 'vi' || grammar.includes('vt;') || grammar.includes('vi;')) {
      result.pos = 'verb';
    } else if (grammar === 'prep' || grammar === 'prp' || grammar === 'prp.') {
      result.pos = 'preposition';
    } else if (grammar === 'conj') {
      result.pos = 'conjunction';
    } else if (grammar === 'pron') {
      result.pos = 'pronoun';
    } else if (grammar === 'interj') {
      result.pos = 'interjection';
    }

    // Remove grammar from clean text
    result.clean = text.replace(/\s*\{[^}]+\}/g, '').trim();
  }

  return result;
}

// Normalize a word for lookup (lowercase, remove special chars)
function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .trim()
    // Keep umlauts and ß
    .replace(/[^\p{L}\p{M}]/gu, '');
}

// Extract the primary word from a compound entry
function extractPrimaryWord(entry: string): string {
  // Remove anything in parentheses or brackets
  let word = entry.replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '');
  // Remove grammar annotations
  word = word.replace(/\{[^}]*\}/g, '');
  // Take first word if multiple separated by ;
  word = word.split(';')[0];
  // Take first word if multiple separated by ,
  word = word.split(',')[0];
  // Clean up
  word = word.trim();
  return word;
}

function parseDictionary() {
  // Ensure dictionary is downloaded and extracted
  const needsGeneration = ensureDictionary();
  if (!needsGeneration) {
    return;
  }

  console.log('[Dictionary] Reading dictionary file...');
  const content = fs.readFileSync(TXT_PATH, 'utf-8');
  const lines = content.split('\n');

  const dictionary: Map<string, DictEntry> = new Map();
  let processed = 0;
  let skipped = 0;

  for (const line of lines) {
    // Skip comments and empty lines
    if (line.startsWith('#') || !line.trim()) {
      continue;
    }

    // Split on ::
    const parts = line.split('::');
    if (parts.length !== 2) {
      skipped++;
      continue;
    }

    const germanPart = parts[0].trim();
    const englishPart = parts[1].trim();

    // Handle multiple entries separated by |
    const germanEntries = germanPart.split('|').map(e => e.trim());
    const englishEntries = englishPart.split('|').map(e => e.trim());

    // Process each German entry
    for (let i = 0; i < germanEntries.length; i++) {
      const germanEntry = germanEntries[i];
      const englishEntry = englishEntries[i] || englishEntries[0]; // Fallback to first translation

      if (!germanEntry || !englishEntry) continue;

      const { clean: germanClean, pos, article, gender } = parseGrammar(germanEntry);
      const primaryWord = extractPrimaryWord(germanClean);
      const normalizedKey = normalizeWord(primaryWord);

      if (!normalizedKey || normalizedKey.length < 2) continue;

      // Extract clean English translation
      let englishClean = englishEntry
        .replace(/\{[^}]*\}/g, '')  // Remove grammar
        .replace(/\([^)]*\)/g, '')   // Remove parenthetical notes
        .replace(/\[[^\]]*\]/g, '')  // Remove brackets
        .split(';')[0]               // Take first meaning
        .split(',')[0]               // Take first variant
        .trim();

      // Skip if English is empty or too short
      if (!englishClean || englishClean.length < 2) continue;

      // Only add if not already present or if this entry has more info
      const existing = dictionary.get(normalizedKey);
      if (!existing || (pos && !existing.pos) || (article && !existing.article)) {
        dictionary.set(normalizedKey, {
          de: primaryWord,
          en: englishClean,
          ...(pos && { pos }),
          ...(article && { article }),
          ...(gender && { gender }),
        });
      }

      processed++;
    }
  }

  console.log(`Processed ${processed} entries, skipped ${skipped}`);
  console.log(`Unique words: ${dictionary.size}`);

  // Convert to object for JSON
  const dictObject: Record<string, DictEntry> = {};
  dictionary.forEach((value, key) => {
    dictObject[key] = value;
  });

  // Write to JSON file
  console.log('Writing JSON file...');
  fs.writeFileSync(JSON_PATH, JSON.stringify(dictObject), 'utf-8');

  const stats = fs.statSync(JSON_PATH);
  console.log(`Output file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

  // Show some sample entries
  console.log('\n[Dictionary] Sample entries:');
  const samples = ['haus', 'gehen', 'schön', 'buch', 'wasser', 'liebe', 'zeit'];
  for (const sample of samples) {
    const entry = dictionary.get(sample);
    if (entry) {
      console.log(`  ${sample}: ${JSON.stringify(entry)}`);
    }
  }

  console.log('\n[Dictionary] Done!');
}

parseDictionary();
