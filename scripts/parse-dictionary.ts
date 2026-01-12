/**
 * Script to parse dictionaries for German, Spanish, and French
 * and convert them to compact JSON format for fast lookups.
 *
 * Run with: npx tsx scripts/parse-dictionary.ts
 *
 * Sources:
 * - German: MUSE/Facebook Research - ~102k pairs
 * - Spanish: MUSE/Facebook Research - ~102k pairs
 * - French: MUSE/Facebook Research - ~102k pairs
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const DICT_DIR = path.join(__dirname, '../lib/dictionary');

// Dictionary sources - all from Facebook MUSE
const SOURCES = {
  german: {
    url: 'https://dl.fbaipublicfiles.com/arrival/dictionaries/de-en.txt',
    txtPath: path.join(DICT_DIR, 'de-en.txt'),
    jsonPath: path.join(DICT_DIR, 'de-en.json'),
  },
  spanish: {
    url: 'https://dl.fbaipublicfiles.com/arrival/dictionaries/es-en.txt',
    txtPath: path.join(DICT_DIR, 'es-en.txt'),
    jsonPath: path.join(DICT_DIR, 'es-en.json'),
  },
  french: {
    url: 'https://dl.fbaipublicfiles.com/arrival/dictionaries/fr-en.txt',
    txtPath: path.join(DICT_DIR, 'fr-en.txt'),
    jsonPath: path.join(DICT_DIR, 'fr-en.json'),
  },
};

interface DictEntry {
  word: string;       // Original word in target language
  en: string;         // English translation
}

// Ensure directory exists
function ensureDir() {
  if (!fs.existsSync(DICT_DIR)) {
    fs.mkdirSync(DICT_DIR, { recursive: true });
  }
}

// Check if file needs regeneration
function needsRegeneration(jsonPath: string): boolean {
  if (!fs.existsSync(jsonPath)) return true;
  const stats = fs.statSync(jsonPath);
  const ageInDays = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);
  return ageInDays > 30;
}

// Normalize word for lookup key
function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{M}]/gu, '');
}

// Parse MUSE format dictionary
function parseMUSEDictionary(language: 'german' | 'spanish' | 'french'): Map<string, DictEntry> {
  const source = SOURCES[language];
  const dictionary = new Map<string, DictEntry>();

  // Download if needed
  if (!fs.existsSync(source.txtPath)) {
    console.log(`[${language}] Downloading from MUSE...`);
    execSync(`curl -sL "${source.url}" -o "${source.txtPath}"`, { stdio: 'inherit' });
  }

  console.log(`[${language}] Parsing dictionary...`);
  const content = fs.readFileSync(source.txtPath, 'utf-8');
  const lines = content.split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;

    // MUSE format: "sourceWord targetWord" (space-separated)
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;

    const sourceWord = parts[0].trim();
    const targetWord = parts[1].trim();

    if (!sourceWord || !targetWord) continue;

    const normalizedKey = normalizeWord(sourceWord);
    if (!normalizedKey || normalizedKey.length < 2) continue;

    // Only keep first translation for each word (MUSE has multiple lines for same word)
    if (!dictionary.has(normalizedKey)) {
      dictionary.set(normalizedKey, {
        word: sourceWord,
        en: targetWord,
      });
    }
  }

  return dictionary;
}

// Save dictionary to JSON
function saveDictionary(dictionary: Map<string, DictEntry>, jsonPath: string, language: string) {
  const dictObject: Record<string, DictEntry> = {};
  dictionary.forEach((value, key) => {
    dictObject[key] = value;
  });

  fs.writeFileSync(jsonPath, JSON.stringify(dictObject), 'utf-8');
  const stats = fs.statSync(jsonPath);
  console.log(`[${language}] Saved ${dictionary.size} words (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
}

// Main function
async function main() {
  ensureDir();

  const languages = ['german', 'spanish', 'french'] as const;

  for (const lang of languages) {
    const source = SOURCES[lang];
    const displayName = lang.charAt(0).toUpperCase() + lang.slice(1);

    if (needsRegeneration(source.jsonPath)) {
      const dict = parseMUSEDictionary(lang);
      saveDictionary(dict, source.jsonPath, displayName);
    } else {
      console.log(`[${displayName}] Dictionary up to date, skipping`);
    }
  }

  console.log('\n[Dictionary] All dictionaries ready!');
}

main().catch(console.error);
