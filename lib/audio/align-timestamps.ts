/**
 * Word timestamp alignment utilities for reading mode audio sync
 */

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  charStart: number;
  charEnd: number;
}

export interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

/**
 * Normalize a word for comparison (lowercase, remove punctuation from edges)
 */
function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+/u, "") // Remove leading non-alphanumeric
    .replace(/[^\p{L}\p{N}]+$/u, ""); // Remove trailing non-alphanumeric
}

/**
 * Calculate similarity between two words (simple Levenshtein-based score)
 * Returns value between 0 and 1
 */
function wordSimilarity(a: string, b: string): number {
  const aNorm = normalizeWord(a);
  const bNorm = normalizeWord(b);

  if (aNorm === bNorm) return 1;
  if (aNorm.length === 0 || bNorm.length === 0) return 0;

  // Simple containment check (handles abbreviations, contractions)
  if (aNorm.includes(bNorm) || bNorm.includes(aNorm)) return 0.8;

  // Levenshtein distance
  const maxLen = Math.max(aNorm.length, bNorm.length);
  const distance = levenshtein(aNorm, bNorm);
  return Math.max(0, 1 - distance / maxLen);
}

/**
 * Levenshtein distance between two strings
 */
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Split text into words while preserving character positions
 */
function splitTextIntoWords(
  text: string
): Array<{ word: string; charStart: number; charEnd: number }> {
  const words: Array<{ word: string; charStart: number; charEnd: number }> = [];
  // Match words (sequences of non-whitespace)
  const regex = /\S+/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    words.push({
      word: match[0],
      charStart: match.index,
      charEnd: match.index + match[0].length,
    });
  }

  return words;
}

/**
 * Align transcribed words from Whisper to original text
 * Uses fuzzy matching to handle pronunciation variations
 */
export function alignWordsToOriginal(
  originalText: string,
  transcribedWords: WhisperWord[]
): WordTimestamp[] {
  const originalWords = splitTextIntoWords(originalText);
  const aligned: WordTimestamp[] = [];

  if (transcribedWords.length === 0 || originalWords.length === 0) {
    return aligned;
  }

  let transcribedIdx = 0;
  const similarityThreshold = 0.5;

  for (let i = 0; i < originalWords.length; i++) {
    const origWord = originalWords[i];

    // Try to find the best matching transcribed word within a window
    let bestMatch = -1;
    let bestSimilarity = 0;
    const windowSize = 3; // Look ahead up to 3 words

    for (
      let j = transcribedIdx;
      j < Math.min(transcribedIdx + windowSize, transcribedWords.length);
      j++
    ) {
      const similarity = wordSimilarity(
        origWord.word,
        transcribedWords[j].word
      );
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = j;
      }
    }

    if (bestSimilarity >= similarityThreshold && bestMatch !== -1) {
      // Found a good match
      aligned.push({
        word: origWord.word,
        start: transcribedWords[bestMatch].start,
        end: transcribedWords[bestMatch].end,
        charStart: origWord.charStart,
        charEnd: origWord.charEnd,
      });
      transcribedIdx = bestMatch + 1;
    } else {
      // No good match found - interpolate timing
      const prevTimestamp = aligned.length > 0 ? aligned[aligned.length - 1] : null;
      const nextTranscribed = transcribedWords[transcribedIdx];

      let interpolatedStart: number;
      let interpolatedEnd: number;

      if (prevTimestamp && nextTranscribed) {
        // Interpolate between previous and next
        const gap = nextTranscribed.start - prevTimestamp.end;
        interpolatedStart = prevTimestamp.end;
        interpolatedEnd = prevTimestamp.end + gap * 0.5;
      } else if (prevTimestamp) {
        // After last transcribed word
        const avgWordDuration = 0.3; // ~300ms per word
        interpolatedStart = prevTimestamp.end;
        interpolatedEnd = prevTimestamp.end + avgWordDuration;
      } else if (nextTranscribed) {
        // Before first transcribed word
        interpolatedStart = Math.max(0, nextTranscribed.start - 0.3);
        interpolatedEnd = nextTranscribed.start;
      } else {
        // No reference points - use estimates
        const avgWordDuration = 0.3;
        interpolatedStart = i * avgWordDuration;
        interpolatedEnd = (i + 1) * avgWordDuration;
      }

      aligned.push({
        word: origWord.word,
        start: interpolatedStart,
        end: interpolatedEnd,
        charStart: origWord.charStart,
        charEnd: origWord.charEnd,
      });
    }
  }

  return aligned;
}

/**
 * Find the word index at a given audio timestamp
 */
export function findWordAtTime(
  timestamps: WordTimestamp[],
  currentTime: number
): number {
  // Binary search for efficiency
  let left = 0;
  let right = timestamps.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const word = timestamps[mid];

    if (currentTime >= word.start && currentTime < word.end) {
      return mid;
    } else if (currentTime < word.start) {
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }

  // Return closest word if exact match not found
  if (left >= timestamps.length) return timestamps.length - 1;
  if (left === 0) return 0;

  // Check which is closer
  const prevDiff = Math.abs(timestamps[left - 1].end - currentTime);
  const nextDiff = Math.abs(timestamps[left].start - currentTime);
  return prevDiff < nextDiff ? left - 1 : left;
}
