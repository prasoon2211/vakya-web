"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Loader2, Check, BookmarkPlus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { useIsMobile } from "@/lib/hooks/use-media-query";
import { cn } from "@/lib/utils";
import type { WordLookupResult } from "@/app/api/vocabulary/lookup/route";

interface AddWordModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetLanguage: string;
  onWordAdded: () => void;
}

// Check if input looks like a single word (no spaces, reasonable length)
function isSingleWord(text: string): boolean {
  const trimmed = text.trim();
  // Single word: no spaces, at least 2 chars, max 50 chars
  return trimmed.length >= 2 && trimmed.length <= 50 && !/\s/.test(trimmed);
}

// Tokenize text into words
function tokenizeText(text: string): { word: string; index: number }[] {
  const tokens: { word: string; index: number }[] = [];
  const regex = /[\p{L}\p{N}]+/gu;
  let match;
  while ((match = regex.exec(text)) !== null) {
    tokens.push({ word: match[0], index: match.index });
  }
  return tokens;
}

export function AddWordModal({
  open,
  onOpenChange,
  targetLanguage,
  onWordAdded,
}: AddWordModalProps) {
  const isMobile = useIsMobile();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Input state
  const [input, setInput] = useState("");
  const [tokens, setTokens] = useState<{ word: string; index: number }[]>([]);
  const [selectedToken, setSelectedToken] = useState<{ word: string; index: number } | null>(null);
  const [savedWords, setSavedWords] = useState<Set<string>>(new Set());

  // Lookup state
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupResult, setLookupResult] = useState<WordLookupResult | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Save state
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  // Determine mode based on input
  const isMultiWordMode = input.trim().length > 0 && !isSingleWord(input);
  const activeWord = isMultiWordMode ? selectedToken?.word : (isSingleWord(input) ? input.trim() : null);

  // Update tokens when input changes (for multi-word mode)
  useEffect(() => {
    if (isMultiWordMode) {
      setTokens(tokenizeText(input));
      setSelectedToken(null);
      setLookupResult(null);
    } else {
      setTokens([]);
      setSelectedToken(null);
    }
  }, [input, isMultiWordMode]);

  // Debounced lookup for single word mode
  useEffect(() => {
    if (!isSingleWord(input) || !input.trim()) {
      setLookupResult(null);
      return;
    }

    const word = input.trim();
    const timer = setTimeout(() => {
      lookupWord(word);
    }, 400);

    return () => clearTimeout(timer);
  }, [input, targetLanguage]);

  // Lookup when token is selected in multi-word mode
  useEffect(() => {
    if (selectedToken && isMultiWordMode) {
      lookupWord(selectedToken.word);
    }
  }, [selectedToken, isMultiWordMode, targetLanguage]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setInput("");
      setTokens([]);
      setSelectedToken(null);
      setLookupResult(null);
      setLookupError(null);
      setSavedWords(new Set());
      setJustSaved(false);
    }
  }, [open]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Focus input when modal opens
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onOpenChange(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  const lookupWord = useCallback(async (word: string) => {
    if (!word.trim()) return;

    setIsLookingUp(true);
    setLookupError(null);
    setLookupResult(null);

    try {
      const res = await fetch("/api/vocabulary/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word: word.trim(),
          targetLanguage,
          contextSentence: isMultiWordMode ? input.slice(0, 200) : null,
        }),
      });

      if (!res.ok) {
        throw new Error("Lookup failed");
      }

      const data: WordLookupResult = await res.json();
      setLookupResult(data);
    } catch {
      setLookupError("Couldn't look up this word");
    } finally {
      setIsLookingUp(false);
    }
  }, [targetLanguage, isMultiWordMode, input]);

  const handleSave = async () => {
    if (!lookupResult || !activeWord) return;

    setIsSaving(true);
    try {
      const res = await fetch("/api/vocabulary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word: activeWord,
          contextSentence: isMultiWordMode ? input.slice(0, 200) : null,
          translation: lookupResult.translation,
          partOfSpeech: lookupResult.partOfSpeech,
          article: lookupResult.article,
          example: lookupResult.example,
          targetLanguage,
        }),
      });

      if (res.status === 409) {
        toast({ title: "Already in your vocabulary" });
        setIsSaving(false);
        return;
      }

      if (!res.ok) throw new Error("Failed to save");

      // Mark as saved
      setSavedWords(prev => new Set(prev).add(activeWord.toLowerCase()));
      setJustSaved(true);
      onWordAdded();

      toast({
        title: "Saved!",
        description: `"${activeWord}" added to vocabulary`,
        variant: "success",
      });

      // In single word mode, close after brief delay
      // In multi-word mode, reset for next word
      if (!isMultiWordMode) {
        setTimeout(() => onOpenChange(false), 600);
      } else {
        setTimeout(() => {
          setJustSaved(false);
          setSelectedToken(null);
          setLookupResult(null);
        }, 800);
      }
    } catch {
      toast({ title: "Failed to save", variant: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  // Check if a word is already saved (either this session or from lookup)
  const isWordSaved = (word: string) => {
    return savedWords.has(word.toLowerCase()) ||
           (lookupResult?.word === word.toLowerCase() && lookupResult?.alreadySaved);
  };

  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex flex-col",
        "bg-[#faf7f2]",
        // Animate in
        "animate-in fade-in duration-200"
      )}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-[#e8dfd3] bg-[#faf7f2]/80 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#c45c3e]/10 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-[#c45c3e]" />
          </div>
          <span className="font-medium text-[#1a1a1a]">Add Word</span>
        </div>
        <button
          onClick={handleClose}
          className="w-8 h-8 rounded-full flex items-center justify-center text-[#6b6b6b] hover:text-[#1a1a1a] hover:bg-[#e8dfd3] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className={cn(
          "mx-auto w-full px-4 py-6",
          isMobile ? "max-w-full" : "max-w-xl"
        )}>
          {/* Input area */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-[#6b6b6b] mb-2">
              Type a word or paste text in {targetLanguage}
            </label>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={targetLanguage === "German"
                ? "e.g., Sehenswürdigkeit or paste a sentence..."
                : "Type a word or paste text..."}
              className={cn(
                "w-full rounded-xl border-2 border-[#e8dfd3] bg-white px-4 py-3",
                "text-[#1a1a1a] placeholder:text-[#9a9a9a]",
                "focus:border-[#c45c3e] focus:outline-none focus:ring-0",
                "transition-colors resize-none",
                "text-lg leading-relaxed"
              )}
              rows={isMultiWordMode ? 4 : 2}
            />
            {!input.trim() && (
              <p className="mt-2 text-xs text-[#9a9a9a]">
                Tip: Press <kbd className="px-1.5 py-0.5 text-xs bg-[#e8dfd3] rounded mx-0.5">Ctrl+V</kbd> to paste from clipboard
              </p>
            )}
          </div>

          {/* Word pills for multi-word mode */}
          {isMultiWordMode && tokens.length > 0 && (
            <div className="mb-6">
              <p className="text-sm font-medium text-[#6b6b6b] mb-3">
                Tap a word to look it up
              </p>
              <div className="flex flex-wrap gap-2">
                {tokens.map((token, idx) => {
                  const isSaved = isWordSaved(token.word);
                  const isSelected = selectedToken?.index === token.index;

                  return (
                    <button
                      key={`${token.word}-${token.index}`}
                      onClick={() => !isSaved && setSelectedToken(token)}
                      disabled={isSaved}
                      className={cn(
                        "px-3 py-2 rounded-lg text-base font-medium transition-all",
                        "border-2",
                        isSelected
                          ? "bg-[#c45c3e] text-white border-[#c45c3e] scale-105 shadow-md"
                          : isSaved
                            ? "bg-[#2d5a47]/10 text-[#2d5a47] border-[#2d5a47]/20 cursor-default"
                            : "bg-white text-[#1a1a1a] border-[#e8dfd3] hover:border-[#c45c3e] hover:bg-[#faf7f2]",
                        // Make pills larger on mobile for easier tapping
                        isMobile && "px-4 py-2.5 text-base"
                      )}
                    >
                      {token.word}
                      {isSaved && (
                        <Check className="w-3.5 h-3.5 ml-1.5 inline-block" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Loading state */}
          {isLookingUp && (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-[#c45c3e] animate-spin" />
                <p className="text-sm text-[#6b6b6b]">Looking up...</p>
              </div>
            </div>
          )}

          {/* Error state */}
          {lookupError && !isLookingUp && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
              <p className="text-red-600 text-sm">{lookupError}</p>
            </div>
          )}

          {/* Lookup result card */}
          {lookupResult && !isLookingUp && (
            <div
              className={cn(
                "bg-white rounded-2xl border-2 border-[#e8dfd3] overflow-hidden",
                "shadow-sm",
                // Animate in
                "animate-in slide-in-from-bottom-4 fade-in duration-300"
              )}
            >
              {/* Word header */}
              <div className="px-5 pt-5 pb-4 border-b border-[#f3ede4]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    {lookupResult.article && (
                      <span className="text-[#c45c3e] text-lg font-medium mr-2">
                        {lookupResult.article}
                      </span>
                    )}
                    <h2 className="inline text-2xl font-semibold text-[#1a1a1a] tracking-tight">
                      {lookupResult.word}
                    </h2>
                    {lookupResult.partOfSpeech && (
                      <span className="ml-3 px-2 py-0.5 text-xs font-medium text-[#6b6b6b] bg-[#f3ede4] rounded-full">
                        {lookupResult.partOfSpeech}
                      </span>
                    )}
                  </div>
                  {lookupResult.alreadySaved && (
                    <span className="shrink-0 px-2 py-1 text-xs font-medium text-[#2d5a47] bg-[#2d5a47]/10 rounded-full">
                      In vocabulary
                    </span>
                  )}
                </div>
              </div>

              {/* Translation */}
              {lookupResult.translation && (
                <div className="px-5 py-4 bg-gradient-to-br from-[#faf8f5] to-[#f3ede4]">
                  <p className="text-xl text-[#1a1a1a] font-medium leading-relaxed">
                    {lookupResult.translation}
                  </p>
                </div>
              )}

              {/* Example */}
              {lookupResult.example && (
                <div className="px-5 py-4 border-t border-[#f3ede4]">
                  <p className="text-xs font-medium text-[#9a9a9a] uppercase tracking-wide mb-1.5">
                    Example
                  </p>
                  <p className="text-[#4a4a4a] italic leading-relaxed">
                    &ldquo;{lookupResult.example}&rdquo;
                  </p>
                </div>
              )}

              {/* Save button */}
              {!lookupResult.alreadySaved && !savedWords.has(lookupResult.word) && (
                <div className="px-5 py-4 border-t border-[#f3ede4] bg-[#faf7f2]">
                  <Button
                    onClick={handleSave}
                    disabled={isSaving || justSaved}
                    className={cn(
                      "w-full h-12 text-base font-medium",
                      justSaved && "bg-[#2d5a47] hover:bg-[#2d5a47]"
                    )}
                  >
                    {justSaved ? (
                      <>
                        <Check className="w-5 h-5 mr-2" />
                        Saved!
                      </>
                    ) : isSaving ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <BookmarkPlus className="w-5 h-5 mr-2" />
                        Save to Vocabulary
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Empty state prompt for single word */}
          {!isMultiWordMode && !input.trim() && !isLookingUp && !lookupResult && (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-2xl bg-[#e8dfd3]/50 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-8 h-8 text-[#9a9a9a]" />
              </div>
              <p className="text-[#6b6b6b] text-sm max-w-xs mx-auto">
                Type a word to instantly see its translation, or paste text to select words from it
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Footer with keyboard hint (desktop only) */}
      {!isMobile && (
        <footer className="px-4 py-3 border-t border-[#e8dfd3] bg-[#faf7f2]/80">
          <p className="text-xs text-[#9a9a9a] text-center">
            Press <kbd className="px-1.5 py-0.5 text-xs bg-[#e8dfd3] rounded mx-0.5">Esc</kbd> to close
          </p>
        </footer>
      )}
    </div>
  );
}
