/**
 * Script to parse dictionaries for German, Spanish, and French
 * and convert them to compact JSON format for fast lookups.
 *
 * Run with: npx tsx scripts/parse-dictionary.ts
 *
 * Sources:
 * - German: TU Chemnitz (GPL) - ~310k words
 * - Spanish: MUSE/Facebook Research - ~113k pairs
 * - French: MUSE/Facebook Research - ~113k pairs
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const DICT_DIR = path.join(__dirname, '../lib/dictionary');

// Dictionary sources
const SOURCES = {
  german: {
    url: 'https://ftp.tu-chemnitz.de/pub/Local/urz/ding/de-en/de-en.txt.gz',
    gzPath: path.join(DICT_DIR, 'de-en.txt.gz'),
    txtPath: path.join(DICT_DIR, 'de-en.txt'),
    jsonPath: path.join(DICT_DIR, 'de-en.json'),
    format: 'chemnitz',
  },
  spanish: {
    url: 'https://dl.fbaipublicfiles.com/arrival/dictionaries/es-en.txt',
    txtPath: path.join(DICT_DIR, 'es-en.txt'),
    jsonPath: path.join(DICT_DIR, 'es-en.json'),
    format: 'muse',
  },
  french: {
    url: 'https://dl.fbaipublicfiles.com/arrival/dictionaries/fr-en.txt',
    txtPath: path.join(DICT_DIR, 'fr-en.txt'),
    jsonPath: path.join(DICT_DIR, 'fr-en.json'),
    format: 'muse',
  },
};

interface DictEntry {
  word: string;       // Original word in target language
  en: string;         // English translation
  pos?: string;       // Part of speech
  article?: string;   // Article (for German nouns)
  gender?: string;    // Gender (for German nouns)
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

// Parse grammar annotations from TU Chemnitz format
function parseGrammar(text: string): { clean: string; pos?: string; article?: string; gender?: string } {
  const result: { clean: string; pos?: string; article?: string; gender?: string } = {
    clean: text,
  };

  const grammarMatch = text.match(/\{([^}]+)\}/);
  if (grammarMatch) {
    const grammar = grammarMatch[1].toLowerCase();

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

    result.clean = text.replace(/\s*\{[^}]+\}/g, '').trim();
  }

  return result;
}

// Normalize word for lookup key
function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{M}]/gu, '');
}

// Extract primary word from compound entry
function extractPrimaryWord(entry: string): string {
  let word = entry.replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '');
  word = word.replace(/\{[^}]*\}/g, '');
  word = word.split(';')[0];
  word = word.split(',')[0];
  return word.trim();
}

// Parse TU Chemnitz German dictionary
function parseGermanDictionary(): Map<string, DictEntry> {
  const source = SOURCES.german;
  const dictionary = new Map<string, DictEntry>();

  // Download if needed
  if (!fs.existsSync(source.txtPath)) {
    if (!fs.existsSync(source.gzPath)) {
      console.log('[German] Downloading from TU Chemnitz...');
      execSync(`curl -sL "${source.url}" -o "${source.gzPath}"`, { stdio: 'inherit' });
    }
    console.log('[German] Extracting...');
    execSync(`gunzip -f "${source.gzPath}"`, { stdio: 'inherit' });
  }

  console.log('[German] Parsing dictionary...');
  const content = fs.readFileSync(source.txtPath, 'utf-8');
  const lines = content.split('\n');

  for (const line of lines) {
    if (line.startsWith('#') || !line.trim()) continue;

    const parts = line.split('::');
    if (parts.length !== 2) continue;

    const germanPart = parts[0].trim();
    const englishPart = parts[1].trim();

    const germanEntries = germanPart.split('|').map(e => e.trim());
    const englishEntries = englishPart.split('|').map(e => e.trim());

    for (let i = 0; i < germanEntries.length; i++) {
      const germanEntry = germanEntries[i];
      const englishEntry = englishEntries[i] || englishEntries[0];

      if (!germanEntry || !englishEntry) continue;

      const { clean: germanClean, pos, article, gender } = parseGrammar(germanEntry);
      const primaryWord = extractPrimaryWord(germanClean);
      const normalizedKey = normalizeWord(primaryWord);

      if (!normalizedKey || normalizedKey.length < 2) continue;

      let englishClean = englishEntry
        .replace(/\{[^}]*\}/g, '')
        .replace(/\([^)]*\)/g, '')
        .replace(/\[[^\]]*\]/g, '')
        .split(';')[0]
        .split(',')[0]
        .trim();

      if (!englishClean || englishClean.length < 2) continue;

      const existing = dictionary.get(normalizedKey);
      if (!existing || (pos && !existing.pos) || (article && !existing.article)) {
        dictionary.set(normalizedKey, {
          word: primaryWord,
          en: englishClean,
          ...(pos && { pos }),
          ...(article && { article }),
          ...(gender && { gender }),
        });
      }
    }
  }

  return dictionary;
}

// Parse MUSE format dictionary (Spanish or French)
function parseMUSEDictionary(language: 'spanish' | 'french'): Map<string, DictEntry> {
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

  // German dictionary
  if (needsRegeneration(SOURCES.german.jsonPath)) {
    const germanDict = parseGermanDictionary();
    saveDictionary(germanDict, SOURCES.german.jsonPath, 'German');
  } else {
    console.log('[German] Dictionary up to date, skipping');
  }

  // Spanish dictionary
  if (needsRegeneration(SOURCES.spanish.jsonPath)) {
    const spanishDict = parseMUSEDictionary('spanish');
    saveDictionary(spanishDict, SOURCES.spanish.jsonPath, 'Spanish');
  } else {
    console.log('[Spanish] Dictionary up to date, skipping');
  }

  // French dictionary
  if (needsRegeneration(SOURCES.french.jsonPath)) {
    const frenchDict = parseMUSEDictionary('french');
    saveDictionary(frenchDict, SOURCES.french.jsonPath, 'French');
  } else {
    console.log('[French] Dictionary up to date, skipping');
  }

  console.log('\n[Dictionary] All dictionaries ready!');
}

main().catch(console.error);
