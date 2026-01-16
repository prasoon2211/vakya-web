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
      });
    }
  }

  return sentences;
}

// Extract bridge context using percentage-based position mapping
// Shows ~400 chars of context, snapped to sentence boundaries
function extractBridgeContext(
  fullBridgeText: string,
  bridgeSentences: BridgeSentence[],
  currentWordIndex: number,
  totalTranslatedWords: number,
  debug: boolean = false
): string {
  const WINDOW_SIZE = 400; // ~6-8 sentences of context
  const EDGE_BUFFER_PERCENT = 0.03; // 3% at edges

  if (!fullBridgeText || bridgeSentences.length === 0 || totalTranslatedWords === 0) {
    if (debug) {
      console.log("[BridgeContext] Empty: no text, sentences, or words");
    }
    return "";
  }

  const bridgeLength = fullBridgeText.length;

  // Calculate reading position as percentage (0 to 1)
  const readingPercent = totalTranslatedWords <= 1
    ? 0
    : Math.min(1, currentWordIndex / (totalTranslatedWords - 1));

  // Map to target character position in bridge text
  let targetCharPos = Math.floor(readingPercent * bridgeLength);
  const originalTargetCharPos = targetCharPos;

  // Edge handling: At start, keep window at beginning until we've read enough
  // At end, keep window at end
  const halfWindow = WINDOW_SIZE / 2;

  if (readingPercent < EDGE_BUFFER_PERCENT) {
    // Near start: window starts at 0, don't shift yet
    targetCharPos = Math.min(targetCharPos, halfWindow);
  } else if (readingPercent > 1 - EDGE_BUFFER_PERCENT) {
    // Near end: window ends at bridgeLength
    targetCharPos = Math.max(targetCharPos, bridgeLength - halfWindow);
  }

  // Calculate raw window bounds
  let windowStart = Math.max(0, targetCharPos - halfWindow);
  let windowEnd = Math.min(bridgeLength, targetCharPos + halfWindow);

  // Clamp window to text bounds
  if (windowStart === 0) {
    windowEnd = Math.min(bridgeLength, WINDOW_SIZE);
  }
  if (windowEnd === bridgeLength) {
    windowStart = Math.max(0, bridgeLength - WINDOW_SIZE);
  }

  // Find the CENTER sentence - the one containing the target character position
  let centerSentenceIndex = 0;
  for (let i = 0; i < bridgeSentences.length; i++) {
    const sentence = bridgeSentences[i];
    if (targetCharPos >= sentence.charStart && targetCharPos < sentence.charEnd) {
      centerSentenceIndex = i;
      break;
    }
    // If we're past all sentences, use the last one
    if (i === bridgeSentences.length - 1) {
      centerSentenceIndex = i;
    }
  }

  // Start with center sentence, add 1 before for context, then fill with sentences after
  const includedSentences: string[] = [bridgeSentences[centerSentenceIndex].text];
  const includedSentenceIndices: number[] = [centerSentenceIndex];
  let totalLength = bridgeSentences[centerSentenceIndex].text.length;

  // Add just 1 sentence before for context (if available)
  if (centerSentenceIndex > 0) {
    const beforeSentence = bridgeSentences[centerSentenceIndex - 1];
    includedSentences.unshift(beforeSentence.text);
    includedSentenceIndices.unshift(centerSentenceIndex - 1);
    totalLength += beforeSentence.text.length + 1;
  }

  // Fill remaining space with sentences after
  let afterIdx = centerSentenceIndex + 1;
  while (totalLength < WINDOW_SIZE && afterIdx < bridgeSentences.length) {
    const afterSentence = bridgeSentences[afterIdx];
    if (totalLength + afterSentence.text.length + 1 <= WINDOW_SIZE + 100) {
      includedSentences.push(afterSentence.text);
      includedSentenceIndices.push(afterIdx);
      totalLength += afterSentence.text.length + 1;
      afterIdx++;
    } else {
      break;
    }
  }

  if (debug) {
    // Get a snippet of the bridge text around the target position
    const snippetStart = Math.max(0, targetCharPos - 30);
    const snippetEnd = Math.min(bridgeLength, targetCharPos + 30);
    const bridgeSnippet = fullBridgeText.substring(snippetStart, snippetEnd);

    // Compact format: word|%|charPos|centerSentence|sentences|snippet
    console.log(
      `[Bridge] word=${currentWordIndex}/${totalTranslatedWords} (${(readingPercent * 100).toFixed(1)}%) | ` +
      `char=${targetCharPos} | ` +
      `center=${centerSentenceIndex} | ` +
      `showing=[${includedSentenceIndices.join(',')}] | ` +
      `"...${bridgeSnippet.replace(/\n/g, ' ')}..."`
    );
  }

  return includedSentences.join(" ");
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
  const [displayedBridgeText, setDisplayedBridgeText] = useState("");

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

  // Update bridge context based on current word position
  // Uses percentage mapping and shows complete sentences within a ~400 char window
  useEffect(() => {
    if (!hasBridge) return;

    const context = extractBridgeContext(
      fullBridgeText,
      bridgeSentences,
      currentWordIndex,
      timestamps.length,
      true // Enable debug logging
    );

    setDisplayedBridgeText(context);
  }, [currentWordIndex, hasBridge, fullBridgeText, bridgeSentences, timestamps.length]);

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
              <p className="text-sm text-[#4a4a4a] leading-relaxed transition-opacity duration-200">
                {displayedBridgeText || "..."}
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
