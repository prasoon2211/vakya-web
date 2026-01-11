"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { WordTooltip } from "./word-tooltip";

interface TranslationBlock {
  original: string;
  translated: string;
}

interface TranslatedTextProps {
  blocks: TranslationBlock[];
  targetLanguage: string;
  articleId: string;
}

interface WordSpanProps {
  word: string;
  display: string;
  sentence: string;
  targetLanguage: string;
  articleId: string;
}

function WordSpan({ word, display, sentence, targetLanguage, articleId }: WordSpanProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <span
          className="cursor-pointer rounded-sm px-0.5 -mx-0.5 transition-colors duration-150 hover:bg-amber-500/20 hover:text-amber-300"
          onClick={() => setIsOpen(true)}
        >
          {display}
        </span>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-4"
        side="top"
        align="center"
        sideOffset={8}
      >
        <WordTooltip
          word={word}
          contextSentence={sentence}
          targetLanguage={targetLanguage}
          articleId={articleId}
        />
      </PopoverContent>
    </Popover>
  );
}

function Paragraph({
  block,
  targetLanguage,
  articleId,
}: {
  block: TranslationBlock;
  targetLanguage: string;
  articleId: string;
}) {
  const [showOriginal, setShowOriginal] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const isLongPress = useRef(false);

  const handleMouseDown = useCallback(() => {
    isLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      setShowOriginal(true);
    }, 500);
  }, []);

  const handleMouseUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
    if (isLongPress.current) {
      setShowOriginal(false);
    }
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Meta" || e.key === "Control") {
      setShowOriginal(true);
    }
  }, []);

  const handleKeyUp = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Meta" || e.key === "Control") {
      setShowOriginal(false);
    }
  }, []);

  // Handle global keydown/keyup for Cmd/Ctrl
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Meta" || e.key === "Control") {
        setShowOriginal(true);
      }
    };

    const handleGlobalKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Meta" || e.key === "Control") {
        setShowOriginal(false);
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    window.addEventListener("keyup", handleGlobalKeyUp);

    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
      window.removeEventListener("keyup", handleGlobalKeyUp);
    };
  }, []);

  // Split translated text into words
  const words = block.translated.split(/(\s+)/);

  return (
    <div
      className="relative group"
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleMouseDown}
      onTouchEnd={handleMouseUp}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      tabIndex={0}
    >
      <p className="text-lg leading-relaxed text-white mb-6">
        {showOriginal ? (
          <span className="text-gray-400 italic">
            {block.original}
          </span>
        ) : (
          words.map((segment, i) => {
            // Check if it's whitespace
            if (/^\s+$/.test(segment)) {
              return <span key={i}>{segment}</span>;
            }

            // Extract the clean word (letters only)
            const cleanWord = segment.replace(/[^\p{L}\p{M}'-]/gu, "");
            if (!cleanWord) {
              return <span key={i}>{segment}</span>;
            }

            return (
              <WordSpan
                key={i}
                word={cleanWord}
                display={segment}
                sentence={block.translated}
                targetLanguage={targetLanguage}
                articleId={articleId}
              />
            );
          })
        )}
      </p>

      {/* Hold hint */}
      <div className="absolute -left-8 top-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none hidden md:block">
        <span className="text-xs text-gray-500">
          {showOriginal ? "Original" : "Hold Cmd"}
        </span>
      </div>
    </div>
  );
}

export function TranslatedText({ blocks, targetLanguage, articleId }: TranslatedTextProps) {
  return (
    <div className="max-w-none">
      {blocks.map((block, index) => (
        <Paragraph
          key={index}
          block={block}
          targetLanguage={targetLanguage}
          articleId={articleId}
        />
      ))}
    </div>
  );
}
