"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { X, Play, Pause, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Languages, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ReadingModeText } from "./reading-mode-text";
import { findWordAtTime, WordTimestamp } from "@/lib/audio/align-timestamps";
import { cn } from "@/lib/utils";

interface TranslationBlock {
  original: string;
  translated: string;
  bridge?: string;
}

interface ReadingModeProps {
  audioUrl: string;
  timestamps: WordTimestamp[];
  targetLanguage: string;
  articleId: string;
  onClose: () => void;
  initialWordIndex?: number; // Start from this word (will snap to sentence start)
  blocks?: TranslationBlock[]; // Translation blocks with bridge text
}

const PLAYBACK_SPEEDS = [0.75, 1, 1.25];
const BRIDGE_CONTEXT_KEY = "vakya-bridge-context-enabled";

// Helper to detect sentence boundaries
function isSentenceEnd(word: string): boolean {
  return word.endsWith(".") || word.endsWith("!") || word.endsWith("?");
}

// Find the start of the sentence containing the given word index
function findSentenceStart(timestamps: WordTimestamp[], wordIndex: number): number {
  let idx = wordIndex;
  // Go backwards until we find a sentence end (or reach the beginning)
  while (idx > 0 && !isSentenceEnd(timestamps[idx - 1]?.word || "")) {
    idx--;
  }
  return idx;
}

// Parse bridge text into sentences with their character positions
interface BridgeSentence {
  text: string;
  charStart: number;
  charEnd: number;
  // Pre-extracted content words for matching (lowercase)
  contentWords: Set<string>;
}

// Common English words to skip when matching (articles, prepositions, etc.)
const COMMON_ENGLISH_WORDS = new Set([
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
]);

// Extract content words from English text (for bridge sentences)
function extractContentWords(text: string): Set<string> {
  const words = text.toLowerCase().split(/[\s,.!?;:'"()\[\]{}]+/);
  const contentWords = new Set<string>();
  for (const word of words) {
    // Keep words that are: 3+ chars, not common, and alphanumeric
    if (word.length >= 3 && !COMMON_ENGLISH_WORDS.has(word) && /^[a-z0-9]+$/i.test(word)) {
      contentWords.add(word);
    }
    // Always keep numbers (universal anchors)
    if (/^\d+$/.test(word)) {
      contentWords.add(word);
    }
  }
  return contentWords;
}

// Extract signal words from translated text (nouns, numbers, long words)
function extractSignalWords(sentence: string, targetLanguage: string): string[] {
  const words = sentence.split(/[\s,.!?;:'"()\[\]{}]+/).filter(w => w.length > 0);
  const signals: string[] = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const cleanWord = word.replace(/[^\p{L}\p{N}]/gu, '');
    if (!cleanWord || cleanWord.length < 2) continue;

    // Numbers are universal anchors (always include)
    if (/\d/.test(cleanWord)) {
      signals.push(cleanWord);
      continue;
    }

    // For German: capitalized words (not at sentence start) are nouns
    if (targetLanguage.toLowerCase().includes('german')) {
      if (i > 0 && /^[A-ZÄÖÜ]/.test(word)) {
        signals.push(word);
        continue;
      }
    }

    // For other languages: long words are likely content words
    if (cleanWord.length >= 5) {
      signals.push(word);
    }
  }

  // Limit to top 5 signal words to keep API calls reasonable
  return signals.slice(0, 5);
}

// Translated sentence parsed from timestamps
interface TranslatedSentence {
  text: string;
  startWordIndex: number;
  endWordIndex: number; // inclusive
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

// Find which translated sentence contains the given word index
function findTranslatedSentenceIndex(
  sentences: TranslatedSentence[],
  wordIndex: number
): number {
  for (let i = 0; i < sentences.length; i++) {
    if (wordIndex >= sentences[i].startWordIndex && wordIndex <= sentences[i].endWordIndex) {
      return i;
    }
  }
  return sentences.length - 1;
}

// Sentence alignment result
interface SentenceAlignment {
  translatedSentenceIdx: number;
  bridgeSentenceIdx: number;
  confidence: number; // 0-1, how confident we are in this alignment
}

// Look up a word translation via API
async function lookupTranslation(
  word: string,
  targetLanguage: string
): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      word: word,
      language: targetLanguage,
    });
    const res = await fetch(`/api/word/lookup?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.found && data.translation) {
      // Extract first word/phrase from translation (often contains extra info)
      // e.g., "house, dwelling" -> "house"
      const firstWord = data.translation.split(/[,;()]/)[0].trim().toLowerCase();
      // Get just the first word if it's a phrase
      return firstWord.split(/\s+/)[0] || null;
    }
    return null;
  } catch {
    return null;
  }
}

// Score how well a bridge sentence matches translated signal words
function scoreBridgeSentence(
  bridgeSentence: BridgeSentence,
  translatedWords: string[]
): number {
  if (translatedWords.length === 0) return 0;

  let matches = 0;
  for (const word of translatedWords) {
    const lowerWord = word.toLowerCase();
    if (bridgeSentence.contentWords.has(lowerWord)) {
      matches++;
    }
  }

  return matches / translatedWords.length;
}

// Find the best matching bridge sentence for a translated sentence
async function findBestBridgeSentence(
  translatedSentence: TranslatedSentence,
  bridgeSentences: BridgeSentence[],
  expectedBridgeIdx: number,
  targetLanguage: string
): Promise<SentenceAlignment> {
  // Extract signal words from the translated sentence
  const signalWords = extractSignalWords(translatedSentence.text, targetLanguage);

  if (signalWords.length === 0 || bridgeSentences.length === 0) {
    // No signal words, fall back to position-based
    return {
      translatedSentenceIdx: -1, // Will be set by caller
      bridgeSentenceIdx: expectedBridgeIdx,
      confidence: 0,
    };
  }

  // Separate numbers (universal anchors) from words needing translation
  const numbersInSignal: string[] = [];
  const wordsToTranslate: string[] = [];

  for (const word of signalWords) {
    const numberMatch = word.match(/\d+/);
    if (numberMatch) {
      numbersInSignal.push(numberMatch[0]);
    } else {
      wordsToTranslate.push(word);
    }
  }

  // Look up translations for non-number signal words (in parallel)
  const translationPromises = wordsToTranslate.map(word => lookupTranslation(word, targetLanguage));
  const translations = await Promise.all(translationPromises);

  // Combine successful translations with numbers
  const englishWords = [
    ...translations.filter((t): t is string => t !== null),
    ...numbersInSignal,
  ];

  if (englishWords.length === 0) {
    // No translations found, fall back to position-based
    return {
      translatedSentenceIdx: -1,
      bridgeSentenceIdx: expectedBridgeIdx,
      confidence: 0,
    };
  }

  // Score candidate bridge sentences (±3 around expected position)
  const windowSize = 3;
  let bestIdx = expectedBridgeIdx;
  let bestScore = 0; // Start at 0, not -1, so we only override if we find actual matches

  for (
    let i = Math.max(0, expectedBridgeIdx - windowSize);
    i <= Math.min(bridgeSentences.length - 1, expectedBridgeIdx + windowSize);
    i++
  ) {
    const score = scoreBridgeSentence(bridgeSentences[i], englishWords);
    // Only update if this candidate scores BETTER (not equal)
    // This ensures we stick with expectedBridgeIdx if all score 0
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  return {
    translatedSentenceIdx: -1, // Will be set by caller
    bridgeSentenceIdx: bestIdx,
    confidence: bestScore,
  };
}

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
        charStart: match.index,
        charEnd: match.index + match[0].length,
        contentWords: extractContentWords(sentenceText),
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
        charStart: lastEnd,
        charEnd: text.length,
        contentWords: extractContentWords(remaining),
      });
    }
  }

  return sentences;
}

// Calculate which sentence contains the target character position
function findCenterSentence(
  bridgeSentences: BridgeSentence[],
  fullBridgeText: string,
  currentWordIndex: number,
  totalTranslatedWords: number,
  debug: boolean = false
): number {
  if (bridgeSentences.length === 0 || totalTranslatedWords === 0) return 0;

  const bridgeLength = fullBridgeText.length;
  const readingPercent = totalTranslatedWords <= 1
    ? 0
    : Math.min(1, currentWordIndex / (totalTranslatedWords - 1));

  const targetCharPos = Math.floor(readingPercent * bridgeLength);

  for (let i = 0; i < bridgeSentences.length; i++) {
    const sentence = bridgeSentences[i];
    if (targetCharPos >= sentence.charStart && targetCharPos < sentence.charEnd) {
      if (debug) {
        // Show snippet of the sentence we found
        const snippet = sentence.text.substring(0, 50);
        console.log(
          `[Bridge] word=${currentWordIndex}/${totalTranslatedWords} (${(readingPercent * 100).toFixed(1)}%) → ` +
          `char=${targetCharPos}/${bridgeLength} → sentence=${i}: "${snippet}..."`
        );
      }
      return i;
    }
  }
  return bridgeSentences.length - 1;
}

export function ReadingMode({
  audioUrl,
  timestamps,
  targetLanguage,
  articleId,
  onClose,
  initialWordIndex = 0,
  blocks = [],
}: ReadingModeProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [hasInitialized, setHasInitialized] = useState(false);

  // Calculate initial position - snap to sentence start for cleaner UX
  const startingWordIndex = findSentenceStart(timestamps, initialWordIndex);
  const [currentWordIndex, setCurrentWordIndex] = useState(startingWordIndex);
  const [wasPlayingBeforeTap, setWasPlayingBeforeTap] = useState(false);

  // Bridge context state
  const [showBridgeContext, setShowBridgeContext] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(BRIDGE_CONTEXT_KEY) === "true";
    }
    return false;
  });

  // Stable window state - only shifts when center approaches edge
  const WINDOW_SIZE = 6; // Number of sentences to show
  const SENTENCES_BEFORE = 1; // How many sentences to show BEFORE the center
  const [windowStartIdx, setWindowStartIdx] = useState(0);

  // Combine all bridge text from blocks
  const fullBridgeText = useMemo(() => {
    return blocks
      .map(block => block.bridge || "")
      .filter(Boolean)
      .join(" ");
  }, [blocks]);

  // Check if bridge text is available
  const hasBridge = fullBridgeText.length > 0;

  // Parse bridge text into sentences with character positions
  const bridgeSentences = useMemo(() => {
    if (!fullBridgeText) return [];
    return parseBridgeSentences(fullBridgeText);
  }, [fullBridgeText]);

  // Parse translated text into sentences (for alignment)
  const translatedSentences = useMemo(() => {
    return parseTranslatedSentences(timestamps);
  }, [timestamps]);

  // Track which translated sentence we're currently in
  const currentTranslatedSentenceIdx = useMemo(() => {
    if (translatedSentences.length === 0) return 0;
    return findTranslatedSentenceIndex(translatedSentences, currentWordIndex);
  }, [translatedSentences, currentWordIndex]);

  // Alignment cache: translatedSentenceIdx -> bridgeSentenceIdx
  const alignmentCacheRef = useRef<Map<number, SentenceAlignment>>(new Map());
  // Track which alignments are currently being computed
  const pendingAlignmentsRef = useRef<Set<number>>(new Set());
  // Counter to force re-render when alignment cache updates
  const [alignmentVersion, setAlignmentVersion] = useState(0);

  // Compute alignment for a translated sentence
  const computeAlignment = useCallback(async (translatedSentenceIdx: number) => {
    // Skip if already cached or being computed
    if (
      alignmentCacheRef.current.has(translatedSentenceIdx) ||
      pendingAlignmentsRef.current.has(translatedSentenceIdx) ||
      !hasBridge ||
      bridgeSentences.length === 0 ||
      translatedSentenceIdx >= translatedSentences.length
    ) {
      return;
    }

    pendingAlignmentsRef.current.add(translatedSentenceIdx);

    try {
      const translatedSentence = translatedSentences[translatedSentenceIdx];

      // Calculate expected bridge index using position ratio (fallback)
      const ratio = translatedSentenceIdx / Math.max(1, translatedSentences.length - 1);
      const expectedBridgeIdx = Math.min(
        Math.floor(ratio * bridgeSentences.length),
        bridgeSentences.length - 1
      );

      // Find best matching bridge sentence
      const alignment = await findBestBridgeSentence(
        translatedSentence,
        bridgeSentences,
        expectedBridgeIdx,
        targetLanguage
      );

      alignment.translatedSentenceIdx = translatedSentenceIdx;

      // Cache the result
      alignmentCacheRef.current.set(translatedSentenceIdx, alignment);

      // Trigger re-render so centerSentenceIdx picks up the new alignment
      setAlignmentVersion(v => v + 1);

      // Log only when alignment differs from expected (adjustment made)
      if (alignment.confidence >= 0.3 && alignment.bridgeSentenceIdx !== expectedBridgeIdx) {
        console.log(
          `[Alignment] Adjusted: sentence ${translatedSentenceIdx} → bridge ${alignment.bridgeSentenceIdx} ` +
          `(was ${expectedBridgeIdx}, confidence: ${(alignment.confidence * 100).toFixed(0)}%)`
        );
      }
    } catch (error) {
      console.error('[Alignment] Error computing alignment:', error);
    } finally {
      pendingAlignmentsRef.current.delete(translatedSentenceIdx);
    }
  }, [hasBridge, bridgeSentences, translatedSentences, targetLanguage]);

  // Pre-compute alignments for current and upcoming sentences
  useEffect(() => {
    if (!hasBridge || !showBridgeContext || translatedSentences.length === 0) return;

    // Compute current sentence alignment immediately
    computeAlignment(currentTranslatedSentenceIdx);

    // Pre-compute next 2 sentences with delays (cleanup on sentence change)
    const timeoutIds: NodeJS.Timeout[] = [];
    for (let i = 1; i <= 2; i++) {
      const nextIdx = currentTranslatedSentenceIdx + i;
      if (nextIdx < translatedSentences.length) {
        // Slight delay for pre-computation to prioritize current sentence
        const timeoutId = setTimeout(() => computeAlignment(nextIdx), i * 150);
        timeoutIds.push(timeoutId);
      }
    }

    // Cleanup timeouts if sentence changes before they fire
    return () => {
      timeoutIds.forEach(id => clearTimeout(id));
    };
  }, [currentTranslatedSentenceIdx, hasBridge, showBridgeContext, translatedSentences.length, computeAlignment]);

  // Calculate current center sentence - using alignment if available, otherwise fallback to position
  const centerSentenceIdx = useMemo(() => {
    if (!hasBridge || bridgeSentences.length === 0) return 0;

    // Check if we have a confident alignment for the current translated sentence
    // Require at least 30% confidence (e.g., 2/5 words matched) to override position-based guess
    const alignment = alignmentCacheRef.current.get(currentTranslatedSentenceIdx);
    if (alignment && alignment.confidence >= 0.3) {
      // Use aligned bridge sentence
      return alignment.bridgeSentenceIdx;
    }

    // Fallback: use position-based calculation
    return findCenterSentence(bridgeSentences, fullBridgeText, currentWordIndex, timestamps.length, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasBridge, bridgeSentences, fullBridgeText, currentWordIndex, timestamps.length, currentTranslatedSentenceIdx, alignmentVersion]);

  // Toggle bridge context and persist
  const toggleBridgeContext = useCallback(() => {
    setShowBridgeContext(prev => {
      const newValue = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem(BRIDGE_CONTEXT_KEY, String(newValue));
      }
      return newValue;
    });
  }, []);

  // Update window position only when center approaches edge (hysteresis)
  // Goal: Keep center sentence near the TOP of the window (after SENTENCES_BEFORE sentences)
  // This shows what you're reading NOW, plus upcoming content
  useEffect(() => {
    if (!hasBridge || bridgeSentences.length === 0) return;

    const windowEndIdx = windowStartIdx + WINDOW_SIZE - 1;

    // Ideal position for center sentence within the window
    const idealCenterPosition = SENTENCES_BEFORE; // position 1 (second sentence shown)

    // Current position of center within the window
    const currentCenterPosition = centerSentenceIdx - windowStartIdx;

    let newWindowStart = windowStartIdx;

    // If center is past the end of visible window, shift forward
    if (centerSentenceIdx > windowEndIdx) {
      // Position window so center is at ideal position (near top)
      newWindowStart = Math.max(0, centerSentenceIdx - idealCenterPosition);
    }
    // If center is before the start of visible window, shift backward
    else if (centerSentenceIdx < windowStartIdx) {
      // Position window so center is at ideal position
      newWindowStart = Math.max(0, centerSentenceIdx - idealCenterPosition);
    }
    // If center is getting close to the end, preemptively shift
    else if (currentCenterPosition > WINDOW_SIZE - 2) {
      newWindowStart = Math.max(0, centerSentenceIdx - idealCenterPosition);
    }

    // Clamp to valid range
    const maxStart = Math.max(0, bridgeSentences.length - WINDOW_SIZE);
    newWindowStart = Math.max(0, Math.min(newWindowStart, maxStart));

    if (newWindowStart !== windowStartIdx) {
      setWindowStartIdx(newWindowStart);
    }
  }, [centerSentenceIdx, windowStartIdx, hasBridge, bridgeSentences.length]);

  // Build array of sentences for display (enables individual highlighting)
  const displayedSentences = useMemo(() => {
    if (!hasBridge || bridgeSentences.length === 0) return [];
    const endIdx = Math.min(windowStartIdx + WINDOW_SIZE, bridgeSentences.length);
    return bridgeSentences.slice(windowStartIdx, endIdx).map(s => s.text);
  }, [hasBridge, bridgeSentences, windowStartIdx]);

  // Calculate which sentence in the window should be highlighted
  const highlightIdx = useMemo(() => {
    if (displayedSentences.length === 0) return -1;
    const idx = centerSentenceIdx - windowStartIdx;
    // Clamp to valid range
    return Math.max(0, Math.min(idx, displayedSentences.length - 1));
  }, [centerSentenceIdx, windowStartIdx, displayedSentences.length]);

  // Update current word based on audio time (only during playback)
  // When manually navigating via goToWord, we set currentWordIndex directly
  // and don't want this effect to override it with a potentially imprecise value
  useEffect(() => {
    if (timestamps.length > 0 && isPlaying) {
      const wordIndex = findWordAtTime(timestamps, currentTime);
      setCurrentWordIndex(wordIndex);
    }
  }, [currentTime, timestamps, isPlaying]);

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("loadedmetadata", updateDuration);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("loadedmetadata", updateDuration);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  // Set initial audio position based on starting word
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || hasInitialized) return;

    const initializePosition = () => {
      if (startingWordIndex > 0 && timestamps[startingWordIndex]) {
        audio.currentTime = timestamps[startingWordIndex].start;
        setCurrentTime(timestamps[startingWordIndex].start);
      }
      setHasInitialized(true);
    };

    // If audio is already loaded, initialize immediately
    if (audio.readyState >= 1) {
      initializePosition();
    } else {
      // Otherwise wait for metadata to load
      audio.addEventListener("loadedmetadata", initializePosition, { once: true });
      return () => audio.removeEventListener("loadedmetadata", initializePosition);
    }
  }, [startingWordIndex, timestamps, hasInitialized]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const goToWord = useCallback((index: number) => {
    const audio = audioRef.current;
    if (!audio || !timestamps[index]) return;
    audio.currentTime = timestamps[index].start;
    setCurrentTime(timestamps[index].start);
    setCurrentWordIndex(index);
  }, [timestamps]);

  const goToPreviousWord = useCallback(() => {
    if (currentWordIndex > 0) {
      goToWord(currentWordIndex - 1);
    }
  }, [currentWordIndex, goToWord]);

  const goToNextWord = useCallback(() => {
    if (currentWordIndex < timestamps.length - 1) {
      goToWord(currentWordIndex + 1);
    }
  }, [currentWordIndex, timestamps.length, goToWord]);

  const goToPreviousSentence = useCallback(() => {
    let idx = currentWordIndex;

    if (idx > 0 && isSentenceEnd(timestamps[idx - 1]?.word || "")) {
      idx--;
    }

    while (idx > 0 && !isSentenceEnd(timestamps[idx - 1]?.word || "")) {
      idx--;
    }

    if (idx > 0) {
      idx--;
      while (idx > 0 && !isSentenceEnd(timestamps[idx - 1]?.word || "")) {
        idx--;
      }
    }

    goToWord(idx);
  }, [currentWordIndex, timestamps, goToWord]);

  const goToNextSentence = useCallback(() => {
    let idx = currentWordIndex;

    while (idx < timestamps.length - 1 && !isSentenceEnd(timestamps[idx]?.word || "")) {
      idx++;
    }

    if (idx < timestamps.length - 1) {
      idx++;
    }

    goToWord(idx);
  }, [currentWordIndex, timestamps.length, timestamps, goToWord]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case " ":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (e.shiftKey) {
            goToPreviousSentence();
          } else {
            goToPreviousWord();
          }
          break;
        case "ArrowRight":
          e.preventDefault();
          if (e.shiftKey) {
            goToNextSentence();
          } else {
            goToNextWord();
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay, goToPreviousWord, goToNextWord, goToPreviousSentence, goToNextSentence, onClose]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const time = parseFloat(e.target.value);
    audio.currentTime = time;
    setCurrentTime(time);
  }, []);

  const cycleSpeed = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackSpeed);
    const nextIndex = (currentIndex + 1) % PLAYBACK_SPEEDS.length;
    const newSpeed = PLAYBACK_SPEEDS[nextIndex];
    audio.playbackRate = newSpeed;
    setPlaybackSpeed(newSpeed);
  }, [playbackSpeed]);

  const handleWordClick = useCallback((index: number) => {
    const audio = audioRef.current;
    if (!audio || !timestamps[index]) return;

    // Remember if we were playing before this tap (to auto-resume later)
    setWasPlayingBeforeTap(isPlaying);

    goToWord(index);
    audio.pause();
    setIsPlaying(false);
  }, [timestamps, goToWord, isPlaying]);

  // Called when tooltip drawer closes - resume if we were playing before
  const handleTooltipClose = useCallback(() => {
    if (wasPlayingBeforeTap) {
      const audio = audioRef.current;
      if (audio) {
        audio.play();
        setIsPlaying(true);
      }
    }
    setWasPlayingBeforeTap(false);
  }, [wasPlayingBeforeTap]);

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="fixed inset-0 z-50 bg-[#faf8f5] flex flex-col">
      {/* Hidden audio element */}
      <audio ref={audioRef} src={audioUrl} preload="auto" />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8dfd3]">
        <button
          onClick={onClose}
          className="p-2 -ml-2 text-[#6b6b6b] hover:text-[#1a1a1a] transition-colors rounded-lg hover:bg-[#e8dfd3]/50"
          title="Close (Esc)"
        >
          <X className="h-5 w-5" />
        </button>
        <h2 className="text-[#1a1a1a] text-sm font-medium">Reading Mode</h2>
        <button
          onClick={cycleSpeed}
          className={cn(
            "px-2.5 py-1 text-sm font-medium rounded-full border transition-all",
            playbackSpeed !== 1
              ? "bg-[#c45c3e]/10 border-[#c45c3e]/30 text-[#c45c3e]"
              : "bg-[#f3ede4] border-[#e8dfd3] text-[#6b6b6b] hover:border-[#d4c5b5]"
          )}
          title="Playback speed"
        >
          {playbackSpeed}x
        </button>
      </div>

      {/* Main content - word display */}
      <ReadingModeText
        timestamps={timestamps}
        currentWordIndex={currentWordIndex}
        onWordClick={handleWordClick}
        onTooltipClose={handleTooltipClose}
        targetLanguage={targetLanguage}
        articleId={articleId}
        isPlaying={isPlaying}
      />

      {/* Bridge Context Panel */}
      {hasBridge && (
        <div className="border-t border-[#e8dfd3] bg-[#f3ede4]/80">
          {/* Toggle button */}
          <button
            onClick={toggleBridgeContext}
            className="w-full flex items-center justify-center gap-2 py-2 text-xs text-[#6b6b6b] hover:text-[#1a1a1a] transition-colors"
          >
            <Languages className="h-3.5 w-3.5" />
            <span>English context</span>
            {showBridgeContext ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5" />
            )}
          </button>

          {/* Context text with smooth transition */}
          <div
            className={cn(
              "overflow-hidden transition-all duration-300 ease-in-out",
              showBridgeContext ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
            )}
          >
            <div className="px-4 pb-3">
              <p className="text-sm text-[#4a4a4a] leading-relaxed">
                {displayedSentences.length > 0 ? (
                  displayedSentences.map((sentence, i) => (
                    <span
                      key={`${windowStartIdx}-${i}`}
                      className={cn(
                        "transition-colors duration-300",
                        i === highlightIdx && "bg-amber-100/50 rounded px-0.5 -mx-0.5"
                      )}
                    >
                      {sentence}{" "}
                    </span>
                  ))
                ) : (
                  "..."
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="bg-white border-t border-[#e8dfd3] px-4 pt-4 pb-6">
        {/* Progress bar */}
        <div className="flex items-center gap-3 mb-5">
          <span className="text-xs text-[#6b6b6b] w-10 font-mono tabular-nums">
            {formatTime(currentTime)}
          </span>
          <div className="flex-1 relative h-1.5 bg-[#e8dfd3] rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-[#c45c3e] rounded-full transition-all duration-100"
              style={{ width: `${progress}%` }}
            />
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>
          <span className="text-xs text-[#6b6b6b] w-10 font-mono tabular-nums text-right">
            {formatTime(duration)}
          </span>
        </div>

        {/* Playback controls - properly aligned */}
        <TooltipProvider delayDuration={200}>
          <div className="flex items-center justify-center">
            <div className="flex items-center gap-1">
              {/* Previous sentence */}
              <div className="flex flex-col items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={goToPreviousSentence}
                      disabled={currentWordIndex === 0}
                      className={cn(
                        "p-2.5 rounded-full transition-all",
                        currentWordIndex === 0
                          ? "text-[#d4c5b5] cursor-not-allowed"
                          : "text-[#6b6b6b] hover:text-[#1a1a1a] hover:bg-[#f3ede4]"
                      )}
                    >
                      <ChevronsLeft className="h-5 w-5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <span className="flex items-center gap-1.5">
                      <kbd className="px-1.5 py-0.5 bg-white/20 rounded text-[11px]">Shift</kbd>
                      <span>+</span>
                      <kbd className="px-1.5 py-0.5 bg-white/20 rounded text-[11px]">←</kbd>
                    </span>
                  </TooltipContent>
                </Tooltip>
                <span className="text-[10px] text-[#9a9a9a] mt-0.5">sentence</span>
              </div>

              {/* Previous word */}
              <div className="flex flex-col items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={goToPreviousWord}
                      disabled={currentWordIndex === 0}
                      className={cn(
                        "p-2.5 rounded-full transition-all",
                        currentWordIndex === 0
                          ? "text-[#d4c5b5] cursor-not-allowed"
                          : "text-[#6b6b6b] hover:text-[#1a1a1a] hover:bg-[#f3ede4]"
                      )}
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <kbd className="px-1.5 py-0.5 bg-white/20 rounded text-[11px]">←</kbd>
                  </TooltipContent>
                </Tooltip>
                <span className="text-[10px] text-[#9a9a9a] mt-0.5">word</span>
              </div>

              {/* Play/Pause */}
              <div className="flex flex-col items-center mx-3">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={togglePlay}
                      size="icon"
                      className="h-14 w-14 rounded-full shadow-md shadow-[#c45c3e]/20"
                    >
                      {isPlaying ? (
                        <Pause className="h-6 w-6" />
                      ) : (
                        <Play className="h-6 w-6 ml-0.5" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <kbd className="px-1.5 py-0.5 bg-white/20 rounded text-[11px]">Space</kbd>
                  </TooltipContent>
                </Tooltip>
                <span className="text-[10px] text-transparent mt-0.5 select-none">play</span>
              </div>

              {/* Next word */}
              <div className="flex flex-col items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={goToNextWord}
                      disabled={currentWordIndex === timestamps.length - 1}
                      className={cn(
                        "p-2.5 rounded-full transition-all",
                        currentWordIndex === timestamps.length - 1
                          ? "text-[#d4c5b5] cursor-not-allowed"
                          : "text-[#6b6b6b] hover:text-[#1a1a1a] hover:bg-[#f3ede4]"
                      )}
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <kbd className="px-1.5 py-0.5 bg-white/20 rounded text-[11px]">→</kbd>
                  </TooltipContent>
                </Tooltip>
                <span className="text-[10px] text-[#9a9a9a] mt-0.5">word</span>
              </div>

              {/* Next sentence */}
              <div className="flex flex-col items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={goToNextSentence}
                      disabled={currentWordIndex === timestamps.length - 1}
                      className={cn(
                        "p-2.5 rounded-full transition-all",
                        currentWordIndex === timestamps.length - 1
                          ? "text-[#d4c5b5] cursor-not-allowed"
                          : "text-[#6b6b6b] hover:text-[#1a1a1a] hover:bg-[#f3ede4]"
                      )}
                    >
                      <ChevronsRight className="h-5 w-5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <span className="flex items-center gap-1.5">
                      <kbd className="px-1.5 py-0.5 bg-white/20 rounded text-[11px]">Shift</kbd>
                      <span>+</span>
                      <kbd className="px-1.5 py-0.5 bg-white/20 rounded text-[11px]">→</kbd>
                    </span>
                  </TooltipContent>
                </Tooltip>
                <span className="text-[10px] text-[#9a9a9a] mt-0.5">sentence</span>
              </div>
            </div>
          </div>
        </TooltipProvider>

        {/* Keyboard hint - desktop only, minimal */}
        <p className="hidden sm:block text-center text-[#9a9a9a] text-xs mt-4">
          Hover over buttons for keyboard shortcuts
        </p>

        {/* Mobile hint */}
        <p className="sm:hidden text-center text-[#9a9a9a] text-xs mt-4">
          Tap any word to pause and see its meaning
        </p>
      </div>
    </div>
  );
}
