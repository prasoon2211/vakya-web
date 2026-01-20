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

// Heuristic constants (tuneable)
const GLOBAL_ANCHOR_SCORE = 2.5;
const GLOBAL_ANCHOR_DISTINCTNESS = 1.4;
const LOCAL_ANCHOR_SCORE = 1.5;
const SHORT_SENTENCE_MAX_WORDS = 3;
const SHORT_SENTENCE_MATCH_RATIO = 0.8;
const BASE_SEARCH_RADIUS_FRACTION = 0.15;
const MIN_SEARCH_RADIUS = 10;
const INTERPOLATION_TOLERANCE_MAX = 3;
const INTERPOLATION_TOLERANCE_FRACTION = 0.15;

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

interface ExtractedWords {
  englishWords: string[];  // Dictionary-translated words
  sourceWords: string[];   // Original content words (for cognate matching)
}

// Extract content words from translated sentence and translate them to English
function extractAndTranslateContentWords(
  sentence: string,
  targetLanguage: string,
  fillerWords: Set<string>
): ExtractedWords {
  const words = sentence.split(/[\s,.!?;:'"()\[\]{}–—-]+/).filter(w => w.length > 0);
  const englishWords: string[] = [];
  const sourceWords: string[] = [];

  // Check if dictionary is available for this language
  const supportedLang = isSupportedLanguage(targetLanguage) ? targetLanguage as SupportedLanguage : null;

  for (const word of words) {
    const cleanWord = word.replace(/[^\p{L}\p{N}]/gu, '');
    if (!cleanWord || cleanWord.length < 2) continue;

    // Check for numbers (universal anchors)
    const numberMatch = cleanWord.match(/\d+/);
    if (numberMatch) {
      englishWords.push(numberMatch[0]);
      sourceWords.push(numberMatch[0]);
      continue;
    }

    // Skip filler words
    if (fillerWords.has(cleanWord.toLowerCase())) continue;

    // Keep source word for cognate matching (if long enough)
    if (cleanWord.length >= 4) {
      sourceWords.push(cleanWord);
    }

    // Try to translate using dictionary
    if (supportedLang) {
      try {
        // Use cleanWord for lookup (without punctuation)
        const entry = lookupWord(cleanWord, supportedLang);
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

  return { englishWords, sourceWords };
}

// Check if two words are cognates (similar spelling across languages)
function areCognates(word1: string, word2: string): boolean {
  const w1 = word1.toLowerCase();
  const w2 = word2.toLowerCase();

  // Exact match
  if (w1 === w2) return true;

  // Too different in length
  if (Math.abs(w1.length - w2.length) > 3) return false;

  // Both must be at least 4 chars for cognate matching
  if (w1.length < 4 || w2.length < 4) return false;

  // Calculate Levenshtein distance
  const matrix: number[][] = [];
  for (let i = 0; i <= w1.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= w2.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= w1.length; i++) {
    for (let j = 1; j <= w2.length; j++) {
      const cost = w1[i - 1] === w2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const distance = matrix[w1.length][w2.length];
  const maxLen = Math.max(w1.length, w2.length);

  // Heuristic adjustments
  const startMatch = w1[0] === w2[0];

  // Standard threshold
  let threshold = 0.2;
  if (maxLen >= 8) threshold = 0.25;

  // Relaxed threshold for short words (4-6 chars) if they start with the same letter
  // e.g. "Haus" vs "House" (dist 2, len 5, ratio 0.4) -> Should match
  if (startMatch && maxLen >= 4 && maxLen <= 6) {
    if (distance <= 2 && distance / maxLen <= 0.41) return true;
  }

  return distance / maxLen <= threshold;
}

// Score how well a bridge sentence matches translated words
function scoreBridgeSentence(
  bridgeSentence: BridgeSentence,
  translatedWords: string[],
  sourceWords: string[] = []  // Original German words for cognate matching
): number {
  if (translatedWords.length === 0 && sourceWords.length === 0) return 0;

  let matches = 0;
  const bridgeWordsArray = Array.from(bridgeSentence.contentWords);
  const matchedBridgeWords = new Set<string>();  // Track what we've already matched

  // Check dictionary-translated words first (higher confidence)
  for (const word of translatedWords) {
    const lowerWord = word.toLowerCase();
    if (bridgeSentence.contentWords.has(lowerWord)) {
      matches++;
      matchedBridgeWords.add(lowerWord);  // Mark as matched
    }
  }

  // Check cognates from source words, but skip if bridge word already matched via dictionary
  for (const sourceWord of sourceWords) {
    for (const bridgeWord of bridgeWordsArray) {
      // Skip if this bridge word was already matched via dictionary
      if (matchedBridgeWords.has(bridgeWord)) continue;

      if (areCognates(sourceWord, bridgeWord)) {
        matches += 0.8;
        matchedBridgeWords.add(bridgeWord);  // Mark as matched
        break;
      }
    }
  }

  return matches;
}

// Weighted increasing subsequence helper (by bIdx) returning indices
function weightedIncreasingSubsequence<T extends { bIdx: number; score: number }>(
  items: T[]
): number[] {
  const n = items.length;
  if (n === 0) return [];

  const dp: number[] = new Array(n).fill(0);
  const parent: number[] = new Array(n).fill(-1);

  for (let i = 0; i < n; i++) {
    dp[i] = items[i].score;
    for (let j = 0; j < i; j++) {
      if (items[j].bIdx < items[i].bIdx) {
        const newScore = dp[j] + items[i].score;
        if (newScore > dp[i]) {
          dp[i] = newScore;
          parent[i] = j;
        }
      }
    }
  }

  let bestEnd = -1;
  let bestTotal = 0;
  for (let i = 0; i < n; i++) {
    if (dp[i] > bestTotal) {
      bestTotal = dp[i];
      bestEnd = i;
    }
  }

  const selected: number[] = [];
  let curr = bestEnd;
  while (curr !== -1) {
    selected.push(curr);
    curr = parent[curr];
  }
  return selected.reverse();
}

/**
 * Compute the bridge sentence mapping for an article.
 *
 * Algorithm: Anchor-based alignment with interpolation
 * 1. Find Global Anchors (unambiguous matches across full text)
 * 2. Define Piecewise Search Zones based on Global Anchors
 * 3. Find Best Local Matches within zones
 * 4. Apply Weighted LIS to enforce monotonicity
 * 5. Interpolate gaps
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
  const numTranslated = translatedSentences.length;
  const numBridge = bridgeSentences.length;

  console.log(`[BridgeMapping] Computing mapping for ${numTranslated} translated → ${numBridge} bridge sentences`);

  // Pre-calculate extracted words for all translated sentences to avoid re-work
  const extractedTranslated = translatedSentences.map(s => 
    extractAndTranslateContentWords(s.text, targetLanguage, fillerWords)
  );

  // --- Step 1: Global Anchor Search ---
  // Find "Islands of Certainty" to fix the drift problem.
  // We look for sentences that match uniquely and strongly anywhere in the document.
  
  interface AnchorPoint { tIdx: number; bIdx: number; score: number }
  const globalAnchors: AnchorPoint[] = [];

  // Only run global search if documents are large enough to drift
  if (numTranslated > 5 && numBridge > 5) {
    // Sample for long documents to keep runtime reasonable
    const sampleStep = numTranslated > 50 ? 3 : 1;

    for (let tIdx = 0; tIdx < numTranslated; tIdx += sampleStep) {
      const { englishWords, sourceWords } = extractedTranslated[tIdx];
      
      // Skip sentences with too little information to be unique
      if (englishWords.length + sourceWords.length < 2) continue;

      let bestB = -1;
      let bestS = 0;
      let secondBestS = 0;

      // Full scan of bridge sentences
      for (let bIdx = 0; bIdx < numBridge; bIdx++) {
        const score = scoreBridgeSentence(bridgeSentences[bIdx], englishWords, sourceWords);
        if (score > bestS) {
          secondBestS = bestS;
          bestS = score;
          bestB = bIdx;
        } else if (score > secondBestS) {
          secondBestS = score;
        }
      }

      // Global Anchor Criteria:
      // 1. Strong match (>= threshold)
      // 2. Distinct (Best is significantly better than second best)
      if (
        bestB !== -1 &&
        bestS >= GLOBAL_ANCHOR_SCORE &&
        (secondBestS === 0 || bestS / secondBestS >= GLOBAL_ANCHOR_DISTINCTNESS)
      ) {
        globalAnchors.push({ tIdx, bIdx: bestB, score: bestS });
      }
    }
  }

  // Filter global anchors to ensure they are monotonic using weighted LIS
  const cleanGlobalAnchors: AnchorPoint[] = [];
  if (globalAnchors.length > 0) {
    const selected = weightedIncreasingSubsequence(globalAnchors);
    for (const idx of selected) {
      cleanGlobalAnchors.push(globalAnchors[idx]);
    }
  }
  
  // Add virtual start/end anchors for interpolation
  const guideAnchors = [
    { tIdx: 0, bIdx: 0 },
    ...cleanGlobalAnchors.filter(a => a.tIdx > 0 && a.tIdx < numTranslated - 1),
    { tIdx: numTranslated - 1, bIdx: numBridge - 1 }
  ];

  console.log(`[BridgeMapping] Global Anchors found: ${cleanGlobalAnchors.length}`);


  // --- Step 2: Local Search with Adaptive Window ---
  
  interface SentenceMatch {
    bestIdx: number;
    bestScore: number;
    englishWords: string[];
    sourceWords: string[];
  }

  const matches: SentenceMatch[] = [];

  for (let tIdx = 0; tIdx < numTranslated; tIdx++) {
    const { englishWords, sourceWords } = extractedTranslated[tIdx];

    // Determine expected position based on Piecewise Linear Interpolation of Guide Anchors
    let prevAnchor = guideAnchors[0];
    let nextAnchor = guideAnchors[guideAnchors.length - 1];
    
    // Find the bounding anchors
    for (let i = 0; i < guideAnchors.length - 1; i++) {
      if (tIdx >= guideAnchors[i].tIdx && tIdx <= guideAnchors[i+1].tIdx) {
        prevAnchor = guideAnchors[i];
        nextAnchor = guideAnchors[i+1];
        break;
      }
    }

    // Interpolate expected index
    let expectedIdx: number;
    if (nextAnchor.tIdx === prevAnchor.tIdx) {
      expectedIdx = prevAnchor.bIdx;
    } else {
      const progress = (tIdx - prevAnchor.tIdx) / (nextAnchor.tIdx - prevAnchor.tIdx);
      expectedIdx = prevAnchor.bIdx + Math.round(progress * (nextAnchor.bIdx - prevAnchor.bIdx));
    }

    // Adaptive Search Radius
    // Use a wider radius if we are far from anchors, but constrain it generally
    const baseRadius = Math.max(MIN_SEARCH_RADIUS, Math.ceil(numBridge * BASE_SEARCH_RADIUS_FRACTION));
    const searchStart = Math.max(0, expectedIdx - baseRadius);
    const searchEnd = Math.min(numBridge - 1, expectedIdx + baseRadius);

    let bestIdx = expectedIdx;
    let bestScore = 0;

    for (let bIdx = searchStart; bIdx <= searchEnd; bIdx++) {
      const score = scoreBridgeSentence(bridgeSentences[bIdx], englishWords, sourceWords);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = bIdx;
      }
    }

    matches.push({ bestIdx, bestScore, englishWords, sourceWords });
  }

  // Step 3: Identify anchor candidates (high-confidence matches) for LIS
  // An anchor must have score >= threshold OR be a strong short-sentence match
  const anchorCandidates: { tIdx: number; bIdx: number; score: number }[] = [];

  for (let tIdx = 0; tIdx < numTranslated; tIdx++) {
    const match = matches[tIdx];
    
    // Adaptive Threshold:
    // 1. Standard high score
    // 2. Or near-perfect match for short sentences based on dictionary words
    const totalDictWords = match.englishWords.length;
    const isPerfectShort =
      totalDictWords > 0 &&
      totalDictWords <= SHORT_SENTENCE_MAX_WORDS &&
      match.bestScore >= totalDictWords * SHORT_SENTENCE_MATCH_RATIO;

    if (match.bestScore >= LOCAL_ANCHOR_SCORE || isPerfectShort) {
      anchorCandidates.push({ tIdx, bIdx: match.bestIdx, score: match.bestScore });
    }
  }

  // Add first/last as soft anchors (lower priority, will be used if compatible)
  // Only force them if they don't conflict with strong matches
  const firstMatch = matches[0];
  const lastMatch = matches[numTranslated - 1];

  // Step 4: Find best monotonic subsequence using weighted LIS
  // Weight = score, prioritize sequences with higher total score
  anchorCandidates.sort((a, b) => a.tIdx - b.tIdx);

  const selectedIndices = weightedIncreasingSubsequence(anchorCandidates);

  // Build valid anchors from selected indices
  const validAnchors: { tIdx: number; bIdx: number }[] = [];

  // Add first sentence anchor if it fits
  if (selectedIndices.length === 0 || anchorCandidates[selectedIndices[0]].tIdx > 0) {
    // Check if first sentence has a reasonable match, otherwise use 0→0
    if (firstMatch.bestScore >= 1 && firstMatch.bestIdx < (selectedIndices.length > 0 ? anchorCandidates[selectedIndices[0]].bIdx : numBridge - 1)) {
      validAnchors.push({ tIdx: 0, bIdx: firstMatch.bestIdx });
    } else {
      validAnchors.push({ tIdx: 0, bIdx: 0 });
    }
  }

  // Add selected high-confidence anchors
  for (const idx of selectedIndices) {
    const anchor = anchorCandidates[idx];
    // Ensure monotonicity with what we've added
    if (validAnchors.length === 0 || anchor.bIdx > validAnchors[validAnchors.length - 1].bIdx) {
      validAnchors.push({ tIdx: anchor.tIdx, bIdx: anchor.bIdx });
    }
  }

  // Add last sentence anchor if it fits
  const lastValidBIdx = validAnchors.length > 0 ? validAnchors[validAnchors.length - 1].bIdx : -1;
  if (validAnchors.length === 0 || validAnchors[validAnchors.length - 1].tIdx < numTranslated - 1) {
    if (lastMatch.bestScore >= 1 && lastMatch.bestIdx > lastValidBIdx) {
      validAnchors.push({ tIdx: numTranslated - 1, bIdx: lastMatch.bestIdx });
    } else if (numBridge - 1 > lastValidBIdx) {
      validAnchors.push({ tIdx: numTranslated - 1, bIdx: numBridge - 1 });
    }
  }

  // Fallback: if no anchors at all, use simple position-based endpoints
  if (validAnchors.length === 0) {
    validAnchors.push({ tIdx: 0, bIdx: 0 });
    validAnchors.push({ tIdx: numTranslated - 1, bIdx: numBridge - 1 });
  }

  console.log(`[BridgeMapping] Found ${validAnchors.length} anchors (from ${anchorCandidates.length} candidates): ${validAnchors.map(a => `${a.tIdx}→${a.bIdx}`).join(', ')}`);

  // Step 5: Interpolate between anchors
  const mapping: number[] = new Array(numTranslated);

  for (let i = 0; i < validAnchors.length - 1; i++) {
    const startAnchor = validAnchors[i];
    const endAnchor = validAnchors[i + 1];

    const tRange = endAnchor.tIdx - startAnchor.tIdx;
    const bRange = endAnchor.bIdx - startAnchor.bIdx;

    for (let tIdx = startAnchor.tIdx; tIdx <= endAnchor.tIdx; tIdx++) {
      if (tIdx === startAnchor.tIdx) {
        mapping[tIdx] = startAnchor.bIdx;
      } else if (tIdx === endAnchor.tIdx) {
        mapping[tIdx] = endAnchor.bIdx;
      } else {
        // Linear interpolation
        const progress = (tIdx - startAnchor.tIdx) / tRange;
        const interpolatedIdx = startAnchor.bIdx + Math.round(progress * bRange);

        // But prefer a good content match if available nearby
        // Use tighter tolerance: max 3 sentences or 15% of range, whichever is smaller
        const match = matches[tIdx];
        if (match.bestScore >= 1) {
          const maxTolerance = Math.min(
            INTERPOLATION_TOLERANCE_MAX,
            Math.max(1, Math.ceil(bRange * INTERPOLATION_TOLERANCE_FRACTION))
          );
          const interpolationDiff = Math.abs(match.bestIdx - interpolatedIdx);
          if (interpolationDiff <= maxTolerance) {
            mapping[tIdx] = match.bestIdx;
            continue;
          }
        }

        mapping[tIdx] = interpolatedIdx;
      }
    }
  }

  // Handle any remaining sentences (shouldn't happen with proper anchors)
  for (let tIdx = 0; tIdx < numTranslated; tIdx++) {
    if (mapping[tIdx] === undefined) {
      const expectedIdx = Math.floor((tIdx / numTranslated) * numBridge);
      mapping[tIdx] = Math.min(expectedIdx, numBridge - 1);
    }
  }

  // Step 6: Smooth out any remaining jumps
  // If a sentence jumps backward significantly, smooth it
  for (let tIdx = 1; tIdx < numTranslated; tIdx++) {
    if (mapping[tIdx] < mapping[tIdx - 1] - 1) {
      // This sentence goes backwards too much - use previous or interpolate
      mapping[tIdx] = mapping[tIdx - 1];
    }
  }

  console.log(`[BridgeMapping] Final mapping: ${mapping.join(', ')}`);

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
