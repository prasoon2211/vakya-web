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
          className="cursor-pointer rounded-sm px-0.5 -mx-0.5 transition-colors duration-150 hover:bg-[#c45c3e]/20 hover:text-[#c45c3e]"
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

// Render a single paragraph with clickable words
function ParagraphText({
  text,
  targetLanguage,
  articleId,
}: {
  text: string;
  targetLanguage: string;
  articleId: string;
}) {
  // Split text into words while preserving whitespace
  const words = text.split(/(\s+)/);

  return (
    <p className="text-lg leading-relaxed text-[#1a1a1a] mb-6">
      {words.map((segment, i) => {
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
            sentence={text}
            targetLanguage={targetLanguage}
            articleId={articleId}
          />
        );
      })}
    </p>
  );
}

// Render original text with paragraph breaks
function OriginalText({ text }: { text: string }) {
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim());

  return (
    <>
      {paragraphs.map((paragraph, i) => (
        <p key={i} className="text-lg leading-relaxed text-[#6b6b6b] italic mb-6">
          {paragraph}
        </p>
      ))}
    </>
  );
}

// A chunk may contain multiple paragraphs separated by \n\n
function TranslationChunk({
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

  // Split translated text into paragraphs (chunks may have internal \n\n breaks)
  const translatedParagraphs = block.translated.split(/\n\n+/).filter(p => p.trim());

  return (
    <div
      className="relative group"
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleMouseDown}
      onTouchEnd={handleMouseUp}
      tabIndex={0}
    >
      {showOriginal ? (
        <OriginalText text={block.original} />
      ) : (
        translatedParagraphs.map((paragraph, i) => (
          <ParagraphText
            key={i}
            text={paragraph}
            targetLanguage={targetLanguage}
            articleId={articleId}
          />
        ))
      )}

      {/* Hold hint - only show on first chunk paragraph */}
      <div className="absolute -top-6 right-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none hidden md:block">
        <span className="text-xs text-[#9a9a9a] bg-white/80 px-2 py-0.5 rounded">
          {showOriginal ? "Original" : "Hold ⌘ for original"}
        </span>
      </div>
    </div>
  );
}

export function TranslatedText({ blocks, targetLanguage, articleId }: TranslatedTextProps) {
  return (
    <div className="max-w-none">
      {blocks.map((block, index) => (
        <TranslationChunk
          key={index}
          block={block}
          targetLanguage={targetLanguage}
          articleId={articleId}
        />
      ))}
    </div>
  );
}
