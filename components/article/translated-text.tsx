"use client";

import { useState, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Drawer, DrawerContent, DrawerTrigger, DrawerTitle } from "@/components/ui/drawer";
import { WordTooltip } from "./word-tooltip";
import { useIsMobile } from "@/lib/hooks/use-media-query";

interface TranslationBlock {
  original: string;
  translated: string;
}

interface TranslatedTextProps {
  blocks: TranslationBlock[];
  targetLanguage: string;
  articleId: string;
  showOriginal?: boolean;
  isOriginalContent?: boolean; // When source = target, hide toggle hints
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
  const isMobile = useIsMobile();

  // On mobile, use drawer (bottom sheet)
  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={setIsOpen}>
        <DrawerTrigger asChild>
          <span
            className="cursor-pointer rounded-sm px-0.5 -mx-0.5 transition-colors duration-150 active:bg-[#c45c3e]/20 active:text-[#c45c3e]"
            onClick={() => setIsOpen(true)}
          >
            {display}
          </span>
        </DrawerTrigger>
        <DrawerContent className="max-h-[80vh]">
          <DrawerTitle className="sr-only">Word Definition</DrawerTitle>
          <div className="px-6 pt-2 overflow-y-auto flex-1" style={{ paddingBottom: 'max(2.5rem, env(safe-area-inset-bottom, 2.5rem))' }}>
            <WordTooltip
              word={word}
              contextSentence={sentence}
              targetLanguage={targetLanguage}
              articleId={articleId}
            />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  // On desktop, use popover
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
// Renders BOTH original and translated, uses CSS to toggle (instant, no re-render)
function TranslationChunk({
  block,
  targetLanguage,
  articleId,
  showOriginal,
}: {
  block: TranslationBlock;
  targetLanguage: string;
  articleId: string;
  showOriginal: boolean;
}) {
  // Split translated text into paragraphs (chunks may have internal \n\n breaks)
  const translatedParagraphs = block.translated.split(/\n\n+/).filter(p => p.trim());

  return (
    <div className="relative">
      {/* Original text - hidden by default, shown when showOriginal is true */}
      <div className={showOriginal ? "block" : "hidden"}>
        <OriginalText text={block.original} />
      </div>
      {/* Translated text - shown by default, hidden when showOriginal is true */}
      <div className={showOriginal ? "hidden" : "block"}>
        {translatedParagraphs.map((paragraph, i) => (
          <ParagraphText
            key={i}
            text={paragraph}
            targetLanguage={targetLanguage}
            articleId={articleId}
          />
        ))}
      </div>
    </div>
  );
}

export function TranslatedText({ blocks, targetLanguage, articleId, showOriginal = false, isOriginalContent = false }: TranslatedTextProps) {
  const [localShowOriginal, setLocalShowOriginal] = useState(showOriginal);
  const isMobile = useIsMobile();

  // Sync with prop changes
  useEffect(() => {
    setLocalShowOriginal(showOriginal);
  }, [showOriginal]);

  // Desktop: Handle Cmd/Ctrl key for showing original (skip if original content)
  useEffect(() => {
    if (isMobile || isOriginalContent) return; // Skip on mobile or when source = target

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Meta" || e.key === "Control") {
        setLocalShowOriginal(true);
      }
    };

    const handleGlobalKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Meta" || e.key === "Control") {
        setLocalShowOriginal(false);
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    window.addEventListener("keyup", handleGlobalKeyUp);

    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
      window.removeEventListener("keyup", handleGlobalKeyUp);
    };
  }, [isMobile, isOriginalContent]);

  return (
    <div className="max-w-none">
      {/* Desktop hint - hide when source = target */}
      {!isMobile && !isOriginalContent && (
        <div className="hidden md:block text-right mb-4">
          <span className="text-xs text-[#9a9a9a] bg-white/80 px-2 py-0.5 rounded">
            {localShowOriginal ? "Showing original" : "Hold ⌘ for original"}
          </span>
        </div>
      )}

      {blocks.map((block, index) => (
        <TranslationChunk
          key={index}
          block={block}
          targetLanguage={targetLanguage}
          articleId={articleId}
          showOriginal={localShowOriginal}
        />
      ))}
    </div>
  );
}
