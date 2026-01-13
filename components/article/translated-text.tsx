"use client";

import { useState, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Drawer, DrawerContent, DrawerTrigger, DrawerTitle } from "@/components/ui/drawer";
import { WordTooltip } from "./word-tooltip";
import { useIsMobile } from "@/lib/hooks/use-media-query";
import { type ViewMode } from "./view-mode-toggle";
import { MobileViewToggle } from "./mobile-view-toggle";
import { DesktopViewToggle } from "./desktop-view-toggle";

export interface TranslationBlock {
  original: string;
  translated: string;
  bridge?: string; // 1-1 English translation of the translated text
}

interface TranslatedTextProps {
  blocks: TranslationBlock[];
  targetLanguage: string;
  articleId: string;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  isOriginalContent?: boolean; // When source = target, hide toggle hints
  hasAudioPlayer?: boolean; // Whether full audio player is showing (affects mobile toggle position)
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
        <DrawerContent className="max-h-[60vh]">
          <DrawerTitle className="sr-only">Word Definition</DrawerTitle>
          <div className="px-4 pt-1 overflow-y-auto flex-1" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 1rem))' }}>
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
// Renders all 3 versions (target, bridge, source), uses CSS to toggle (instant, no re-render)
function TranslationChunk({
  block,
  targetLanguage,
  articleId,
  viewMode,
}: {
  block: TranslationBlock;
  targetLanguage: string;
  articleId: string;
  viewMode: ViewMode;
}) {
  // Split translated text into paragraphs (chunks may have internal \n\n breaks)
  const translatedParagraphs = block.translated.split(/\n\n+/).filter(p => p.trim());
  const bridgeParagraphs = block.bridge?.split(/\n\n+/).filter(p => p.trim()) || [];

  return (
    <div className="relative">
      {/* Target language (translated) - shown by default */}
      <div className={viewMode === "target" ? "block" : "hidden"}>
        {translatedParagraphs.map((paragraph, i) => (
          <ParagraphText
            key={i}
            text={paragraph}
            targetLanguage={targetLanguage}
            articleId={articleId}
          />
        ))}
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
          // Fallback if no bridge available
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

export function TranslatedText({
  blocks,
  targetLanguage,
  articleId,
  viewMode: externalViewMode = "target",
  onViewModeChange,
  isOriginalContent = false,
  hasAudioPlayer = false,
}: TranslatedTextProps) {
  const [internalViewMode, setInternalViewMode] = useState<ViewMode>(externalViewMode);
  const isMobile = useIsMobile();

  // Check if any block has bridge translation
  const hasBridge = blocks.some(block => block.bridge && block.bridge.length > 0);

  // Sync with external prop changes
  useEffect(() => {
    setInternalViewMode(externalViewMode);
  }, [externalViewMode]);

  // Use external or internal state
  const viewMode = onViewModeChange ? externalViewMode : internalViewMode;
  const setViewMode = onViewModeChange || setInternalViewMode;

  // Desktop: Handle Cmd/Ctrl key for quick view switching (skip if original content)
  useEffect(() => {
    if (isMobile || isOriginalContent) return;

    let originalMode: ViewMode = "target";

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Meta" || e.key === "Control") {
        // Save current mode before switching
        originalMode = viewMode;
        if (e.shiftKey) {
          // Cmd+Shift = Source
          setViewMode("source");
        } else if (hasBridge) {
          // Cmd = Bridge (only if available)
          setViewMode("bridge");
        } else {
          // Fallback to source if no bridge
          setViewMode("source");
        }
      } else if (e.key === "Shift" && (e.metaKey || e.ctrlKey)) {
        // If already holding Cmd and press Shift, switch to source
        setViewMode("source");
      }
    };

    const handleGlobalKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Meta" || e.key === "Control") {
        // Return to target when releasing Cmd/Ctrl
        setViewMode("target");
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    window.addEventListener("keyup", handleGlobalKeyUp);

    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
      window.removeEventListener("keyup", handleGlobalKeyUp);
    };
  }, [isMobile, isOriginalContent, hasBridge, viewMode, setViewMode]);

  return (
    <div className="max-w-none">
      {/* Desktop: Floating toggle on right side */}
      {!isOriginalContent && !isMobile && (
        <DesktopViewToggle
          mode={viewMode}
          onModeChange={setViewMode}
          targetLanguage={targetLanguage}
          hasBridge={hasBridge}
        />
      )}

      {/* Mobile: Floating toggle in bottom-right corner */}
      {!isOriginalContent && isMobile && (
        <MobileViewToggle
          mode={viewMode}
          onModeChange={setViewMode}
          targetLanguage={targetLanguage}
          hasBridge={hasBridge}
          hasAudioPlayer={hasAudioPlayer}
        />
      )}

      {blocks.map((block, index) => (
        <TranslationChunk
          key={index}
          block={block}
          targetLanguage={targetLanguage}
          articleId={articleId}
          viewMode={viewMode}
        />
      ))}
    </div>
  );
}
