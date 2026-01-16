"use client";

import { useState, useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from "react";
import { Bookmark } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Drawer, DrawerContent, DrawerTrigger, DrawerTitle } from "@/components/ui/drawer";
import { WordTooltip } from "./word-tooltip";
import { useIsMobile } from "@/lib/hooks/use-media-query";
import { type ViewMode } from "./view-mode-toggle";
import { MobileViewToggle } from "./mobile-view-toggle";
import { DesktopViewToggle } from "./desktop-view-toggle";
import { saveBookmark } from "./bookmark-control";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

export interface TranslationBlock {
  original: string;
  translated: string;
  bridge?: string; // 1-1 English translation of the translated text
}

export interface TranslatedTextRef {
  containerRef: React.RefObject<HTMLDivElement | null>;
}

interface TranslatedTextProps {
  blocks: TranslationBlock[];
  targetLanguage: string;
  articleId: string;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  hasAudioPlayer?: boolean;
  bookmarkWordIndex?: number | null;
  onBookmarkChange?: (wordIndex: number | null) => void;
}

interface WordSpanProps {
  word: string;
  display: string;
  sentence: string;
  targetLanguage: string;
  articleId: string;
  wordIndex: number;
  isBookmarked: boolean;
  onSetBookmark: (wordIndex: number) => void;
  onRemoveBookmark: () => void;
}

function WordSpan({
  word,
  display,
  sentence,
  targetLanguage,
  articleId,
  wordIndex,
  isBookmarked,
  onSetBookmark,
  onRemoveBookmark,
}: WordSpanProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isMobile = useIsMobile();

  const wordElement = (
    <span
      data-word-index={wordIndex}
      className={cn(
        "cursor-pointer rounded-sm px-0.5 -mx-0.5 transition-colors duration-150 relative",
        isBookmarked
          ? "bg-[#c45c3e]/20 text-[#c45c3e]"
          : isMobile
            ? "active:bg-[#c45c3e]/20 active:text-[#c45c3e]"
            : "hover:bg-[#c45c3e]/20 hover:text-[#c45c3e]"
      )}
      onClick={() => setIsOpen(true)}
    >
      {isBookmarked && (
        <Bookmark className="absolute -top-3 left-1/2 -translate-x-1/2 w-3 h-3 text-[#c45c3e] fill-[#c45c3e]" />
      )}
      {display}
    </span>
  );

  // On mobile, use drawer (bottom sheet)
  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={setIsOpen}>
        <DrawerTrigger asChild>
          {wordElement}
        </DrawerTrigger>
        <DrawerContent className="max-h-[60vh]">
          <DrawerTitle className="sr-only">Word Definition</DrawerTitle>
          <div className="px-4 pt-1 overflow-y-auto flex-1" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 1rem))' }}>
            <WordTooltip
              word={word}
              contextSentence={sentence}
              targetLanguage={targetLanguage}
              articleId={articleId}
              wordIndex={wordIndex}
              isBookmarked={isBookmarked}
              onSetBookmark={onSetBookmark}
              onRemoveBookmark={onRemoveBookmark}
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
        {wordElement}
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
          wordIndex={wordIndex}
          isBookmarked={isBookmarked}
          onSetBookmark={onSetBookmark}
          onRemoveBookmark={onRemoveBookmark}
        />
      </PopoverContent>
    </Popover>
  );
}

// Render a single paragraph with clickable words and word indices
function ParagraphText({
  text,
  targetLanguage,
  articleId,
  startWordIndex,
  bookmarkWordIndex,
  onSetBookmark,
  onRemoveBookmark,
}: {
  text: string;
  targetLanguage: string;
  articleId: string;
  startWordIndex: number;
  bookmarkWordIndex: number | null;
  onSetBookmark: (wordIndex: number) => void;
  onRemoveBookmark: () => void;
}) {
  // Split text into words while preserving whitespace
  const segments = text.split(/(\s+)/);
  let wordIndex = startWordIndex;

  return (
    <p className="text-lg leading-relaxed text-[#1a1a1a] mb-6">
      {segments.map((segment, i) => {
        // Check if it's whitespace
        if (/^\s+$/.test(segment)) {
          return <span key={i}>{segment}</span>;
        }

        // Extract the clean word (letters only)
        const cleanWord = segment.replace(/[^\p{L}\p{M}'-]/gu, "");
        if (!cleanWord) {
          return <span key={i}>{segment}</span>;
        }

        const currentWordIndex = wordIndex;
        wordIndex++;

        return (
          <WordSpan
            key={i}
            word={cleanWord}
            display={segment}
            sentence={text}
            targetLanguage={targetLanguage}
            articleId={articleId}
            wordIndex={currentWordIndex}
            isBookmarked={bookmarkWordIndex === currentWordIndex}
            onSetBookmark={onSetBookmark}
            onRemoveBookmark={onRemoveBookmark}
          />
        );
      })}
    </p>
  );
}

// Count words in text
function countWords(text: string): number {
  const segments = text.split(/\s+/);
  return segments.filter(s => s.replace(/[^\p{L}\p{M}'-]/gu, "")).length;
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
  viewMode,
  startWordIndex,
  bookmarkWordIndex,
  onSetBookmark,
  onRemoveBookmark,
}: {
  block: TranslationBlock;
  targetLanguage: string;
  articleId: string;
  viewMode: ViewMode;
  startWordIndex: number;
  bookmarkWordIndex: number | null;
  onSetBookmark: (wordIndex: number) => void;
  onRemoveBookmark: () => void;
}) {
  const translatedParagraphs = block.translated.split(/\n\n+/).filter(p => p.trim());
  const bridgeParagraphs = block.bridge?.split(/\n\n+/).filter(p => p.trim()) || [];

  // Track word index across paragraphs within this block
  let currentWordIndex = startWordIndex;

  return (
    <div className="relative">
      {/* Target language (translated) - shown by default */}
      <div className={viewMode === "target" ? "block" : "hidden"}>
        {translatedParagraphs.map((paragraph, i) => {
          const paragraphStartIndex = currentWordIndex;
          currentWordIndex += countWords(paragraph);

          return (
            <ParagraphText
              key={i}
              text={paragraph}
              targetLanguage={targetLanguage}
              articleId={articleId}
              startWordIndex={paragraphStartIndex}
              bookmarkWordIndex={bookmarkWordIndex}
              onSetBookmark={onSetBookmark}
              onRemoveBookmark={onRemoveBookmark}
            />
          );
        })}
      </div>
      {/* Bridge (1-1 English translation) */}
      <div className={viewMode === "bridge" ? "block" : "hidden"}>
        {bridgeParagraphs.length > 0 ? (
          bridgeParagraphs.map((paragraph, i) => (
            <p key={i} className="text-lg leading-relaxed text-[#4a4a4a] mb-6">
              {paragraph}
            </p>
          ))
        ) : (
          <p className="text-lg leading-relaxed text-[#9a9a9a] italic mb-6">
            English translation not available for this section.
          </p>
        )}
      </div>
      {/* Source (original article text) */}
      <div className={viewMode === "source" ? "block" : "hidden"}>
        <OriginalText text={block.original} />
      </div>
    </div>
  );
}

export const TranslatedText = forwardRef<TranslatedTextRef, TranslatedTextProps>(function TranslatedText({
  blocks,
  targetLanguage,
  articleId,
  viewMode: externalViewMode = "target",
  onViewModeChange,
  hasAudioPlayer = false,
  bookmarkWordIndex = null,
  onBookmarkChange,
}, ref) {
  const [internalViewMode, setInternalViewMode] = useState<ViewMode>(externalViewMode);
  const isMobile = useIsMobile();
  const containerRef = useRef<HTMLDivElement>(null);

  // Expose containerRef for bookmark control
  useImperativeHandle(ref, () => ({
    containerRef,
  }), []);

  // Check if any block has bridge translation
  const hasBridge = blocks.some(block => block.bridge && block.bridge.length > 0);

  // Sync with external prop changes
  useEffect(() => {
    setInternalViewMode(externalViewMode);
  }, [externalViewMode]);

  // Use external or internal state
  const viewMode = onViewModeChange ? externalViewMode : internalViewMode;
  const setViewMode = onViewModeChange || setInternalViewMode;

  // Handle setting bookmark
  const handleSetBookmark = useCallback(async (wordIndex: number) => {
    const success = await saveBookmark(articleId, wordIndex);
    if (success) {
      onBookmarkChange?.(wordIndex);
      toast({
        title: "Bookmark saved",
        variant: "success",
      });
    } else {
      toast({
        title: "Failed to save bookmark",
        variant: "error",
      });
    }
  }, [articleId, onBookmarkChange]);

  // Handle removing bookmark
  const handleRemoveBookmark = useCallback(async () => {
    try {
      const res = await fetch(`/api/articles/${articleId}/bookmark`, {
        method: "DELETE",
      });
      if (res.ok) {
        onBookmarkChange?.(null);
        toast({
          title: "Bookmark removed",
          variant: "success",
        });
      }
    } catch {
      toast({
        title: "Failed to remove bookmark",
        variant: "error",
      });
    }
  }, [articleId, onBookmarkChange]);

  // Desktop: Handle Cmd/Ctrl key for quick view switching
  useEffect(() => {
    if (isMobile) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Meta" || e.key === "Control") {
        if (e.shiftKey) {
          setViewMode("source");
        } else if (hasBridge) {
          setViewMode("bridge");
        } else {
          setViewMode("source");
        }
      } else if (e.key === "Shift" && (e.metaKey || e.ctrlKey)) {
        setViewMode("source");
      }
    };

    const handleGlobalKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Meta" || e.key === "Control") {
        setViewMode("target");
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    window.addEventListener("keyup", handleGlobalKeyUp);

    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
      window.removeEventListener("keyup", handleGlobalKeyUp);
    };
  }, [isMobile, hasBridge, setViewMode]);

  // Calculate word indices for each block
  let globalWordIndex = 0;

  return (
    <div ref={containerRef} className="max-w-none">
      {/* Desktop: Floating toggle on right side */}
      {!isMobile && (
        <DesktopViewToggle
          mode={viewMode}
          onModeChange={setViewMode}
          targetLanguage={targetLanguage}
          hasBridge={hasBridge}
        />
      )}

      {/* Mobile: Floating toggle in bottom-right corner */}
      {isMobile && (
        <MobileViewToggle
          mode={viewMode}
          onModeChange={setViewMode}
          targetLanguage={targetLanguage}
          hasBridge={hasBridge}
          hasAudioPlayer={hasAudioPlayer}
        />
      )}

      {blocks.map((block, index) => {
        const blockStartIndex = globalWordIndex;
        // Count words in this block's translated text
        const blockWordCount = block.translated
          .split(/\n\n+/)
          .filter(p => p.trim())
          .reduce((sum, p) => sum + countWords(p), 0);
        globalWordIndex += blockWordCount;

        return (
          <TranslationChunk
            key={index}
            block={block}
            targetLanguage={targetLanguage}
            articleId={articleId}
            viewMode={viewMode}
            startWordIndex={blockStartIndex}
            bookmarkWordIndex={bookmarkWordIndex}
            onSetBookmark={handleSetBookmark}
            onRemoveBookmark={handleRemoveBookmark}
          />
        );
      })}
    </div>
  );
});
