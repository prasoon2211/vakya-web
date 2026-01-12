"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { WordTimestamp } from "@/lib/audio/align-timestamps";
import { WordTooltip } from "./word-tooltip";
import { cn } from "@/lib/utils";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from "@/components/ui/drawer";

interface ReadingModeTextProps {
  timestamps: WordTimestamp[];
  currentWordIndex: number;
  onWordClick: (index: number) => void;
  onTooltipClose: () => void;
  targetLanguage: string;
  articleId: string;
  isPlaying: boolean;
}

export function ReadingModeText({
  timestamps,
  currentWordIndex,
  onWordClick,
  onTooltipClose,
  targetLanguage,
  articleId,
  isPlaying,
}: ReadingModeTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const currentWordRef = useRef<HTMLSpanElement>(null);
  const [selectedWordIndex, setSelectedWordIndex] = useState<number | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  // Auto-scroll to keep current word visible
  useEffect(() => {
    if (currentWordRef.current && containerRef.current) {
      const container = containerRef.current;
      const word = currentWordRef.current;

      const containerRect = container.getBoundingClientRect();
      const wordRect = word.getBoundingClientRect();

      const isAbove = wordRect.top < containerRect.top + 100;
      const isBelow = wordRect.bottom > containerRect.bottom - 100;

      if (isAbove || isBelow) {
        word.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    }
  }, [currentWordIndex]);

  const handleWordClick = useCallback((absoluteIndex: number) => {
    onWordClick(absoluteIndex);
    setSelectedWordIndex(absoluteIndex);
    setShowTooltip(true);
  }, [onWordClick]);

  // Close tooltip when audio starts playing again
  useEffect(() => {
    if (isPlaying && showTooltip) {
      setShowTooltip(false);
    }
  }, [isPlaying, showTooltip]);

  // Get context sentence for the selected word
  const getContextSentence = useCallback((index: number): string => {
    if (index < 0 || index >= timestamps.length) return "";
    const contextStart = Math.max(0, index - 5);
    const contextEnd = Math.min(timestamps.length, index + 6);
    return timestamps
      .slice(contextStart, contextEnd)
      .map((w) => w.word)
      .join(" ");
  }, [timestamps]);

  // Find sentence boundaries for better context display
  const getSentenceRange = useCallback((wordIndex: number): { start: number; end: number } => {
    let start = wordIndex;
    while (start > 0) {
      const prevWord = timestamps[start - 1]?.word || "";
      if (prevWord.endsWith(".") || prevWord.endsWith("!") || prevWord.endsWith("?")) {
        break;
      }
      start--;
    }

    let end = wordIndex;
    while (end < timestamps.length - 1) {
      const word = timestamps[end]?.word || "";
      if (word.endsWith(".") || word.endsWith("!") || word.endsWith("?")) {
        end++;
        break;
      }
      end++;
    }

    const maxContext = 25;
    if (wordIndex - start > maxContext) start = wordIndex - maxContext;
    if (end - wordIndex > maxContext) end = wordIndex + maxContext;

    return { start, end };
  }, [timestamps]);

  const { start: sentenceStart, end: sentenceEnd } = getSentenceRange(currentWordIndex);
  const visibleWords = timestamps.slice(sentenceStart, sentenceEnd);

  return (
    <>
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 flex items-center"
      >
        <div className="w-full max-w-xl mx-auto">
          {/* Main text display */}
          <p className="text-center leading-loose break-words text-lg sm:text-xl text-[#1a1a1a]">
            {visibleWords.map((wordTs, localIndex) => {
              const absoluteIndex = sentenceStart + localIndex;
              const isCurrent = absoluteIndex === currentWordIndex;
              const isPast = absoluteIndex < currentWordIndex;

              return (
                <span key={absoluteIndex}>
                  <span
                    ref={isCurrent ? currentWordRef : undefined}
                    onClick={() => handleWordClick(absoluteIndex)}
                    className={cn(
                      "cursor-pointer transition-all duration-150 select-none rounded-sm",
                      isCurrent && [
                        "font-medium text-[#1a1a1a]",
                        "bg-[#c45c3e]/15",
                        "shadow-[0_0_0_3px_rgba(196,92,62,0.15)]", // Visual padding without layout impact
                      ],
                      isPast && "text-[#9a9a9a]",
                      !isCurrent && !isPast && "text-[#4a4a4a]",
                      "hover:text-[#1a1a1a] hover:bg-[#e8dfd3]/40"
                    )}
                  >
                    {wordTs.word}
                  </span>
                  {localIndex < visibleWords.length - 1 && " "}
                </span>
              );
            })}
          </p>

          {/* Word counter */}
          <p className="text-center text-[#9a9a9a] text-sm mt-8">
            Word {currentWordIndex + 1} of {timestamps.length}
          </p>
        </div>
      </div>

      {/* Word tooltip drawer */}
      {selectedWordIndex !== null && timestamps[selectedWordIndex] && (
        <Drawer
          open={showTooltip}
          onOpenChange={(open) => {
            setShowTooltip(open);
            if (!open) {
              onTooltipClose();
            }
          }}
        >
          <DrawerContent className="max-h-[85vh]">
            <DrawerTitle className="sr-only">Word Definition</DrawerTitle>
            <div className="px-6 pt-2 pb-10 overflow-y-auto">
              <WordTooltip
                word={timestamps[selectedWordIndex].word}
                contextSentence={getContextSentence(selectedWordIndex)}
                targetLanguage={targetLanguage}
                articleId={articleId}
              />
            </div>
          </DrawerContent>
        </Drawer>
      )}
    </>
  );
}
