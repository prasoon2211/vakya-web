/**
 * Sentence Utilities
 *
 * Provides robust sentence splitting that handles:
 * - Different quotation mark styles across languages
 * - Abbreviations (Mr., Dr., U.S., etc.)
 * - Quotes that span sentence boundaries
 * - Different dash styles
 */

// Common abbreviations that end with periods but aren't sentence ends
const ABBREVIATIONS = new Set([
  // Titles
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'rev', 'hon', 'gen', 'col', 'lt', 'sgt',
  // German titles
  'hr', 'fr', 'hrn', 'ing',
  // French titles
  'mme', 'mlle', 'm',
  // Spanish titles
  'sr', 'sra', 'srta', 'lic', 'dr', 'dra',
  // Common abbreviations
  'etc', 'vs', 'eg', 'ie', 'al', 'ca', 'approx', 'inc', 'ltd', 'corp', 'co',
  'no', 'nos', 'vol', 'vols', 'pp', 'pg', 'ch', 'sec', 'fig', 'figs',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
  'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun',
  // Countries/places
  'u', 'usa', 'uk', 'eu',
]);

// Quote normalization map - normalize all quote styles to standard ASCII
const QUOTE_MAP: Record<string, string> = {
  // German quotes
  "\u201E": '"', // „ - double low-9 quotation mark
  "\u201C": '"', // " - left double quotation mark
  "\u201A": "'", // ‚ - single low-9 quotation mark
  "\u2018": "'", // ' - left single quotation mark
  // French quotes
  "\u00AB": '"', // « - left-pointing double angle
  "\u00BB": '"', // » - right-pointing double angle
  "\u2039": "'", // ‹ - left-pointing single angle
  "\u203A": "'", // › - right-pointing single angle
  // Other curly quotes
  "\u201D": '"', // " - right double quotation mark
  "\u2019": "'", // ' - right single quotation mark
  // Spanish inverted punctuation - remove them (they mark sentence start, not end)
  "\u00BF": '',  // ¿ - inverted question mark
  "\u00A1": '',  // ¡ - inverted exclamation mark
};

// Dash normalization - normalize different dashes to standard
const DASH_MAP: Record<string, string> = {
  "\u2013": '-', // – en-dash
  "\u2014": '-', // — em-dash
  "\u2010": '-', // ‐ hyphen
  "\u2212": '-', // − minus sign
};

/**
 * Normalize text by replacing language-specific quotes and dashes
 */
export function normalizeText(text: string): string {
  let result = text;

  // Normalize quotes
  for (const [from, to] of Object.entries(QUOTE_MAP)) {
    result = result.split(from).join(to);
  }

  // Normalize dashes
  for (const [from, to] of Object.entries(DASH_MAP)) {
    result = result.split(from).join(to);
  }

  return result;
}

/**
 * Check if a word is an abbreviation or ordinal number
 */
function isAbbreviation(word: string): boolean {
  // Remove the period for checking
  const withoutPeriod = word.replace(/\.$/, '');
  const clean = withoutPeriod.toLowerCase();

  // Check against known abbreviations (lowercase)
  if (ABBREVIATIONS.has(clean)) return true;

  // Single letter followed by period (e.g., "A." in "A. Smith")
  if (/^[A-Za-z]$/.test(withoutPeriod)) return true;

  // All caps followed by period (acronyms like "U.S.") - check BEFORE lowercasing
  if (/^[A-Z]+$/.test(withoutPeriod) && withoutPeriod.length <= 4) return true;

  // Ordinal numbers: "1.", "2.", "21." etc. (common in German: "der 1. Mai")
  if (/^\d+$/.test(clean)) return true;

  // Numbers with ordinal suffixes that might have periods: "1st.", "2nd."
  if (/^\d+(st|nd|rd|th)$/i.test(clean)) return true;

  return false;
}

/**
 * Split text into sentences with robust handling of:
 * - Multiple sentence-ending punctuation (.!?)
 * - Quotation marks (doesn't break mid-quote for short quotes)
 * - Abbreviations
 * - Ellipsis (...)
 */
export function splitIntoSentences(text: string): string[] {
  if (!text.trim()) return [];

  // First normalize quotes and dashes
  const normalized = normalizeText(text);

  const sentences: string[] = [];
  let currentSentence = '';
  let i = 0;

  while (i < normalized.length) {
    const char = normalized[i];
    currentSentence += char;

    // Check for sentence-ending punctuation
    if (char === '.' || char === '!' || char === '?') {
      // Look ahead to see what follows
      let nextNonSpace = i + 1;
      while (nextNonSpace < normalized.length && /\s/.test(normalized[nextNonSpace])) {
        nextNonSpace++;
      }

      const nextChar = normalized[nextNonSpace] || '';

      // Get the word before the punctuation to check for abbreviation
      const wordBeforeMatch = currentSentence.match(/(\S+)[.!?]$/);
      const wordBefore = wordBeforeMatch ? wordBeforeMatch[1] + char : '';

      // Check if this is a real sentence end
      let isSentenceEnd = false;

      if (char === '!' || char === '?') {
        // Exclamation and question marks are almost always sentence ends
        isSentenceEnd = true;
      } else if (char === '.') {
        // Check for ellipsis (...)
        if (normalized.slice(i, i + 3) === '...') {
          // Ellipsis - add remaining dots and recalculate next char
          currentSentence += normalized.slice(i + 1, i + 3);
          i += 2;

          // Recalculate what comes after the ellipsis
          let afterEllipsis = i + 1;
          while (afterEllipsis < normalized.length && /\s/.test(normalized[afterEllipsis])) {
            afterEllipsis++;
          }
          const charAfterEllipsis = normalized[afterEllipsis] || '';

          // Ellipsis is sentence end if followed by capital letter, quote, number, or end of text
          isSentenceEnd = /^[A-ZÄÖÜÉÈÊËÀÂÎÏÔÛÙÇ"0-9]/.test(charAfterEllipsis) || afterEllipsis >= normalized.length;
        } else if (isAbbreviation(wordBefore)) {
          // Abbreviation - not a sentence end
          isSentenceEnd = false;
        } else if (/^[a-zäöüéèêëàâîïôûùç]/.test(nextChar)) {
          // Next word starts with lowercase - probably not a sentence end
          isSentenceEnd = false;
        } else if (nextNonSpace >= normalized.length || nextChar === '') {
          // End of text - definitely a sentence end
          isSentenceEnd = true;
        } else if (/^[A-ZÄÖÜÉÈÊËÀÂÎÏÔÛÙÇ"0-9]/.test(nextChar)) {
          // Next word starts with capital, quote, or number - likely sentence end
          isSentenceEnd = true;
        } else {
          // Unknown character - assume sentence end to be safe
          isSentenceEnd = true;
        }
      }

      // Handle closing quotes after punctuation
      if (isSentenceEnd) {
        // Capture any closing quotes/punctuation that follow
        let j = i + 1;
        while (j < normalized.length && /["')}\]]/.test(normalized[j])) {
          currentSentence += normalized[j];
          j++;
        }
        i = j - 1;

        // Add the sentence
        const trimmed = currentSentence.trim();
        if (trimmed) {
          sentences.push(trimmed);
        }
        currentSentence = '';
      }
    }

    i++;
  }

  // Don't forget any remaining text
  const remaining = currentSentence.trim();
  if (remaining) {
    sentences.push(remaining);
  }

  return sentences;
}

/**
 * Check if a word ends a sentence (for word-by-word processing)
 * More robust than just checking for .!?
 * Handles cases like: "word." "word!" "word?" "word."" "word!""
 */
export function isSentenceEndWord(word: string, nextWord?: string): boolean {
  // Normalize the word first (handle different quote styles)
  const normalizedWord = normalizeText(word);

  // Strip trailing quotes/brackets to find the core punctuation
  const withoutTrailingQuotes = normalizedWord.replace(/["')\]}>]+$/, '');

  // Check for sentence-ending punctuation (with or without trailing quotes)
  if (!withoutTrailingQuotes.match(/[.!?]$/)) return false;

  // Exclamation and question marks are always sentence ends
  if (withoutTrailingQuotes.endsWith('!') || withoutTrailingQuotes.endsWith('?')) return true;

  // For periods, check if it's an abbreviation
  if (withoutTrailingQuotes.endsWith('.')) {
    // Check for ellipsis
    if (withoutTrailingQuotes.endsWith('...')) {
      // Ellipsis - check if next word starts with capital, number, quote, or is absent
      return !nextWord || /^[A-ZÄÖÜÉÈÊËÀÂÎÏÔÛÙÇ"0-9]/.test(nextWord);
    }

    // Check for abbreviation (use the word without trailing quotes)
    if (isAbbreviation(withoutTrailingQuotes)) return false;

    // Check if next word starts with lowercase (continuation)
    if (nextWord && /^[a-zäöüéèêëàâîïôûùç]/.test(nextWord)) return false;

    // Otherwise, it's a sentence end (includes: capital letters, numbers, quotes, or no next word)
    return true;
  }

  return false;
}
