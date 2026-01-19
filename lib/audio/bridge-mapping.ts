/**
 * Bridge Sentence Mapping
 *
 * Pre-computes a mapping from translated sentences (in the target language)
 * to bridge sentences (English translations). This mapping is computed once
 * after audio generation and stored for use in reading mode.
 *
 * Algorithm:
 * 1. Parse timestamps into sentences (translated text)
 * 2. Parse bridge text into sentences
 * 3. For each translated sentence:
 *    - Extract content words (nouns, verbs, numbers - not filler words)
 *    - Translate each to English using dictionary
 *    - Find the bridge sentence with most matching words
 *    - Enforce monotonicity (sentence N must map to bridge >= sentence N-1's mapping)
 */

import { lookupWord, isSupportedLanguage, type SupportedLanguage } from '@/lib/dictionary/lookup-sqlite';
import { WordTimestamp } from './align-timestamps';

// Common filler words to skip in both source and target languages
const ENGLISH_FILLER_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'may', 'might', 'must', 'shall', 'can', 'need', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before',
  'after', 'above', 'below', 'between', 'under', 'again', 'then', 'once', 'here',
  'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more', 'most',
  'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
  'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because', 'until',
  'while', 'although', 'this', 'that', 'these', 'those', 'it', 'its', 'he', 'she',
  'they', 'them', 'his', 'her', 'their', 'my', 'your', 'our', 'who', 'which',
  'what', 'whom', 'also', 'about', 'over', 'out', 'up', 'down', 'off', 'any',
  'been', 'being', 'both', 'into', 'most', 'much', 'now', 'said', 'says', 'say',
]);

// German filler words (articles, prepositions, pronouns, auxiliaries)
const GERMAN_FILLER_WORDS = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einer', 'einem', 'einen', 'eines',
  'und', 'oder', 'aber', 'denn', 'weil', 'wenn', 'als', 'ob', 'dass', 'daß',
  'in', 'an', 'auf', 'aus', 'bei', 'mit', 'nach', 'von', 'zu', 'für', 'um', 'durch',
  'gegen', 'ohne', 'unter', 'über', 'vor', 'hinter', 'neben', 'zwischen',
  'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'mich', 'dich', 'sich', 'uns', 'euch',
  'mein', 'dein', 'sein', 'ihr', 'unser', 'euer', 'meine', 'deine', 'seine', 'ihre', 'unsere', 'eure',
  'ist', 'sind', 'war', 'waren', 'wird', 'werden', 'wurde', 'wurden', 'hat', 'haben', 'hatte', 'hatten',
  'kann', 'können', 'konnte', 'konnten', 'muss', 'müssen', 'musste', 'mussten',
  'will', 'wollen', 'wollte', 'wollten', 'soll', 'sollen', 'sollte', 'sollten',
  'nicht', 'auch', 'noch', 'schon', 'nur', 'sehr', 'mehr', 'so', 'wie', 'was', 'wer', 'wo', 'wann',
  'hier', 'dort', 'da', 'dann', 'jetzt', 'nun', 'immer', 'wieder', 'bereits', 'etwa',
  'diese', 'dieser', 'dieses', 'diesen', 'diesem', 'jene', 'jener', 'jenes', 'welche', 'welcher',
]);

// Spanish filler words
const SPANISH_FILLER_WORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'de', 'del', 'al', 'en', 'con', 'por', 'para', 'sin', 'sobre', 'entre', 'hacia', 'desde', 'hasta',
  'y', 'o', 'pero', 'sino', 'que', 'si', 'como', 'cuando', 'donde', 'porque', 'aunque',
  'yo', 'tú', 'él', 'ella', 'nosotros', 'vosotros', 'ellos', 'ellas', 'usted', 'ustedes',
  'me', 'te', 'se', 'nos', 'os', 'lo', 'la', 'le', 'les',
  'mi', 'tu', 'su', 'nuestro', 'vuestro', 'mis', 'tus', 'sus',
  'es', 'son', 'está', 'están', 'era', 'eran', 'fue', 'fueron', 'ser', 'estar',
  'ha', 'han', 'he', 'has', 'hemos', 'había', 'habían', 'haber', 'tener',
  'no', 'sí', 'muy', 'más', 'menos', 'tan', 'también', 'ya', 'aún', 'todavía',
  'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'esos', 'esas', 'aquel', 'aquella',
  'qué', 'quién', 'cuál', 'cómo', 'dónde', 'cuándo', 'cuánto',
]);

// French filler words
const FRENCH_FILLER_WORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'au', 'aux',
  'et', 'ou', 'mais', 'donc', 'or', 'ni', 'car', 'que', 'qui', 'quoi',
  'à', 'de', 'en', 'dans', 'sur', 'sous', 'avec', 'sans', 'pour', 'par', 'vers', 'chez',
  'je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles',
  'me', 'te', 'se', 'lui', 'leur', 'y', 'en',
  'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses', 'notre', 'nos', 'votre', 'vos', 'leur', 'leurs',
  'est', 'sont', 'était', 'étaient', 'être', 'été', 'sera', 'seront',
  'a', 'ont', 'avait', 'avaient', 'avoir', 'eu', 'aura', 'auront',
  'ne', 'pas', 'plus', 'moins', 'très', 'bien', 'aussi', 'encore', 'toujours', 'jamais', 'déjà',
  'ce', 'cet', 'cette', 'ces', 'celui', 'celle', 'ceux', 'celles',
  'si', 'quand', 'comme', 'où', 'comment', 'pourquoi', 'combien',
]);

function getFillerWords(language: string): Set<string> {
  const lang = language.toLowerCase();
  if (lang.includes('german')) return GERMAN_FILLER_WORDS;
  if (lang.includes('spanish')) return SPANISH_FILLER_WORDS;
  if (lang.includes('french')) return FRENCH_FILLER_WORDS;
  return new Set();
}

interface TranslatedSentence {
  text: string;
  startWordIndex: number;
  endWordIndex: number;
}

interface BridgeSentence {
  text: string;
  contentWords: Set<string>;
}

// Helper to detect sentence boundaries
function isSentenceEnd(word: string): boolean {
  return word.endsWith('.') || word.endsWith('!') || word.endsWith('?');
}

// Parse timestamps into sentences
function parseTranslatedSentences(timestamps: WordTimestamp[]): TranslatedSentence[] {
  if (timestamps.length === 0) return [];

  const sentences: TranslatedSentence[] = [];
  let sentenceStart = 0;
  let sentenceWords: string[] = [];

  for (let i = 0; i < timestamps.length; i++) {
    sentenceWords.push(timestamps[i].word);

    if (isSentenceEnd(timestamps[i].word) || i === timestamps.length - 1) {
      sentences.push({
        text: sentenceWords.join(' '),
        startWordIndex: sentenceStart,
        endWordIndex: i,
      });
      sentenceStart = i + 1;
      sentenceWords = [];
    }
  }

  return sentences;
}

// Parse bridge text into sentences with pre-extracted content words
function parseBridgeSentences(text: string): BridgeSentence[] {
  if (!text.trim()) return [];

  const sentences: BridgeSentence[] = [];
  const regex = /[^.!?]*[.!?]+/g;
  let match;
  let lastEnd = 0;

  while ((match = regex.exec(text)) !== null) {
    const sentenceText = match[0].trim();
    if (sentenceText) {
      sentences.push({
        text: sentenceText,
        contentWords: extractEnglishContentWords(sentenceText),
      });
    }
    lastEnd = match.index + match[0].length;
  }

  // Handle remaining text without sentence-ending punctuation
  if (lastEnd < text.length) {
    const remaining = text.slice(lastEnd).trim();
    if (remaining) {
      sentences.push({
        text: remaining,
        contentWords: extractEnglishContentWords(remaining),
      });
    }
  }

  return sentences;
}

// Extract content words from English text (bridge sentences)
function extractEnglishContentWords(text: string): Set<string> {
  const words = text.toLowerCase().split(/[\s,.!?;:'"()\[\]{}–—-]+/);
  const contentWords = new Set<string>();

  for (const word of words) {
    // Skip short words, filler words, and non-alphanumeric
    if (word.length < 3) continue;
    if (ENGLISH_FILLER_WORDS.has(word)) continue;
    if (!/^[a-z0-9]+$/i.test(word)) continue;

    contentWords.add(word);
  }

  // Also add numbers as they're universal anchors
  const numbers = text.match(/\d+/g);
  if (numbers) {
    numbers.forEach(n => contentWords.add(n));
  }

  return contentWords;
}

// Extract content words from translated sentence and translate them to English
function extractAndTranslateContentWords(
  sentence: string,
  targetLanguage: string,
  fillerWords: Set<string>
): string[] {
  const words = sentence.split(/[\s,.!?;:'"()\[\]{}–—-]+/).filter(w => w.length > 0);
  const englishWords: string[] = [];

  // Check if dictionary is available for this language
  const supportedLang = isSupportedLanguage(targetLanguage) ? targetLanguage as SupportedLanguage : null;

  for (const word of words) {
    const cleanWord = word.replace(/[^\p{L}\p{N}]/gu, '');
    if (!cleanWord || cleanWord.length < 2) continue;

    // Check for numbers (universal anchors)
    const numberMatch = cleanWord.match(/\d+/);
    if (numberMatch) {
      englishWords.push(numberMatch[0]);
      continue;
    }

    // Skip filler words
    if (fillerWords.has(cleanWord.toLowerCase())) continue;

    // Try to translate using dictionary
    if (supportedLang) {
      try {
        const entry = lookupWord(word, supportedLang);
        if (entry && entry.definition) {
          // Extract first word/phrase from definition
          // e.g., "house, dwelling" -> "house"
          const firstWord = entry.definition.split(/[,;()]/)[0].trim().toLowerCase();
          const translated = firstWord.split(/\s+/)[0];
          if (translated && translated.length >= 2 && !ENGLISH_FILLER_WORDS.has(translated)) {
            englishWords.push(translated);
          }
        }
      } catch {
        // Dictionary lookup failed, skip this word
      }
    }
  }

  return englishWords;
}

// Score how well a bridge sentence matches translated words
function scoreBridgeSentence(
  bridgeSentence: BridgeSentence,
  translatedWords: string[]
): number {
  if (translatedWords.length === 0) return 0;

  let matches = 0;
  for (const word of translatedWords) {
    if (bridgeSentence.contentWords.has(word.toLowerCase())) {
      matches++;
    }
  }

  return matches;
}

/**
 * Compute the bridge sentence mapping for an article.
 *
 * @param timestamps - Word timestamps from audio transcription
 * @param bridgeText - Full bridge (English) text
 * @param targetLanguage - The target language (German, Spanish, French)
 * @returns Array where index is translated sentence index, value is bridge sentence index
 */
export function computeBridgeSentenceMap(
  timestamps: WordTimestamp[],
  bridgeText: string,
  targetLanguage: string
): number[] {
  // Parse both texts into sentences
  const translatedSentences = parseTranslatedSentences(timestamps);
  const bridgeSentences = parseBridgeSentences(bridgeText);

  if (translatedSentences.length === 0 || bridgeSentences.length === 0) {
    return [];
  }

  const fillerWords = getFillerWords(targetLanguage);
  const mapping: number[] = [];
  let lastMatchedIdx = 0;

  console.log(`[BridgeMapping] Computing mapping for ${translatedSentences.length} translated sentences → ${bridgeSentences.length} bridge sentences`);

  for (let tIdx = 0; tIdx < translatedSentences.length; tIdx++) {
    const translatedSentence = translatedSentences[tIdx];

    // Extract content words and translate to English
    const englishWords = extractAndTranslateContentWords(
      translatedSentence.text,
      targetLanguage,
      fillerWords
    );

    // Calculate expected position based on ratio
    const expectedIdx = Math.floor((tIdx / translatedSentences.length) * bridgeSentences.length);

    // If no content words could be translated, use position-based mapping
    if (englishWords.length === 0) {
      const fallbackIdx = Math.max(lastMatchedIdx, Math.min(expectedIdx, bridgeSentences.length - 1));
      mapping.push(fallbackIdx);
      lastMatchedIdx = fallbackIdx;
      continue;
    }

    // Search for best matching bridge sentence
    // Start from lastMatchedIdx (enforce monotonicity) but also check around expected position
    const searchStart = lastMatchedIdx;
    const searchEnd = Math.min(bridgeSentences.length - 1, Math.max(expectedIdx + 3, lastMatchedIdx + 5));

    let bestIdx = Math.max(lastMatchedIdx, expectedIdx);
    let bestScore = 0;

    for (let bIdx = searchStart; bIdx <= searchEnd; bIdx++) {
      const score = scoreBridgeSentence(bridgeSentences[bIdx], englishWords);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = bIdx;
      }
    }

    // If no matches found, use position-based guess (but respect monotonicity)
    if (bestScore === 0) {
      bestIdx = Math.max(lastMatchedIdx, Math.min(expectedIdx, bridgeSentences.length - 1));
    }

    mapping.push(bestIdx);
    lastMatchedIdx = bestIdx;

    // Log significant mappings for debugging
    if (bestScore > 0 && bestIdx !== expectedIdx) {
      console.log(
        `[BridgeMapping] Sentence ${tIdx} → Bridge ${bestIdx} (expected ${expectedIdx}, matched ${bestScore}/${englishWords.length} words)`
      );
    }
  }

  console.log(`[BridgeMapping] Completed mapping: ${mapping.join(', ')}`);

  return mapping;
}

/**
 * Get the bridge sentence index for a given word index.
 *
 * @param wordIndex - Current word index in the translated text
 * @param timestamps - Word timestamps
 * @param bridgeSentenceMap - Pre-computed mapping
 * @returns Bridge sentence index
 */
export function getBridgeSentenceForWord(
  wordIndex: number,
  timestamps: WordTimestamp[],
  bridgeSentenceMap: number[]
): number {
  if (bridgeSentenceMap.length === 0) return 0;

  // Find which translated sentence contains this word
  let currentSentence = 0;
  for (let i = 0; i < timestamps.length; i++) {
    if (i === wordIndex) break;
    if (isSentenceEnd(timestamps[i].word)) {
      currentSentence++;
    }
  }

  // Clamp to valid range
  currentSentence = Math.min(currentSentence, bridgeSentenceMap.length - 1);

  return bridgeSentenceMap[currentSentence];
}
