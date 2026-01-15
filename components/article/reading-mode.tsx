"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { X, Play, Pause, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ReadingModeText } from "./reading-mode-text";
import { findWordAtTime, WordTimestamp } from "@/lib/audio/align-timestamps";
import { cn } from "@/lib/utils";

interface ReadingModeProps {
  audioUrl: string;
  timestamps: WordTimestamp[];
  targetLanguage: string;
  articleId: string;
  onClose: () => void;
  initialWordIndex?: number; // Start from this word (will snap to sentence start)
}

const PLAYBACK_SPEEDS = [0.75, 1, 1.25];

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

export function ReadingMode({
  audioUrl,
  timestamps,
  targetLanguage,
  articleId,
  onClose,
  initialWordIndex = 0,
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

  // Update current word based on audio time
  useEffect(() => {
    if (timestamps.length > 0) {
      const wordIndex = findWordAtTime(timestamps, currentTime);
      setCurrentWordIndex(wordIndex);
    }
  }, [currentTime, timestamps]);

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
