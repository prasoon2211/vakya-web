"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bookmark, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";

interface BookmarkControlProps {
  articleId: string;
  bookmarkWordIndex: number | null;
  onBookmarkChange: (wordIndex: number | null) => void;
  /** Whether audio player is visible (affects positioning) */
  hasAudioPlayer?: boolean;
}

export function BookmarkControl({
  articleId,
  bookmarkWordIndex,
  onBookmarkChange,
  hasAudioPlayer = false,
}: BookmarkControlProps) {
  const [showContinuePrompt, setShowContinuePrompt] = useState(false);
  const hasShownPromptRef = useRef(false);

  // Show "Continue reading" prompt on initial load if bookmark exists
  useEffect(() => {
    if (bookmarkWordIndex !== null && bookmarkWordIndex > 50 && !hasShownPromptRef.current) {
      // Only show prompt if bookmark is further into the article
      const timer = setTimeout(() => {
        setShowContinuePrompt(true);
        hasShownPromptRef.current = true;
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [bookmarkWordIndex]);

  // Scroll to bookmarked word
  const scrollToBookmark = useCallback(() => {
    if (bookmarkWordIndex === null) return;

    const bookmarkedElement = document.querySelector(
      `[data-word-index="${bookmarkWordIndex}"]`
    );
    if (bookmarkedElement) {
      bookmarkedElement.scrollIntoView({ behavior: "smooth", block: "center" });
      setShowContinuePrompt(false);
    }
  }, [bookmarkWordIndex]);

  // Clear bookmark
  const clearBookmark = async () => {
    try {
      await fetch(`/api/articles/${articleId}/bookmark`, {
        method: "DELETE",
      });
      onBookmarkChange(null);
      toast({
        title: "Bookmark removed",
        variant: "success",
      });
    } catch {
      toast({
        title: "Failed to remove bookmark",
        variant: "error",
      });
    }
  };

  // Dismiss continue prompt
  const dismissPrompt = () => {
    setShowContinuePrompt(false);
  };

  return (
    <>
      {/* Continue Reading Prompt - shows once on load if bookmark exists */}
      <AnimatePresence>
        {showContinuePrompt && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className={cn(
              "fixed left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:max-w-sm z-50",
              hasAudioPlayer ? "bottom-36 md:bottom-32" : "bottom-24 md:bottom-20"
            )}
          >
            <div className="bg-white rounded-2xl shadow-lg border border-[#e8dfd3] p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-[#c45c3e]/10 flex items-center justify-center flex-shrink-0">
                  <Bookmark className="w-5 h-5 text-[#c45c3e]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[#1a1a1a] text-sm">
                    Continue where you left off?
                  </p>
                  <p className="text-xs text-[#6b6b6b] mt-0.5">
                    You have a bookmark saved
                  </p>
                </div>
                <button
                  onClick={dismissPrompt}
                  className="p-1 text-[#9a9a9a] hover:text-[#1a1a1a] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={dismissPrompt}
                  className="flex-1 px-3 py-2 text-sm text-[#6b6b6b] hover:bg-[#f3ede4] rounded-lg transition-colors"
                >
                  Start fresh
                </button>
                <button
                  onClick={scrollToBookmark}
                  className="flex-1 px-3 py-2 text-sm font-medium text-white bg-[#c45c3e] hover:bg-[#a34a30] rounded-lg transition-colors"
                >
                  Continue reading
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating bookmark indicator when bookmark exists */}
      <AnimatePresence>
        {bookmarkWordIndex !== null && !showContinuePrompt && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className={cn(
              "fixed left-4 z-40",
              hasAudioPlayer ? "bottom-32" : "bottom-20"
            )}
          >
            <button
              onClick={scrollToBookmark}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-xl",
                "bg-[#c45c3e] border border-[#c45c3e]",
                "shadow-lg shadow-[#c45c3e]/20",
                "text-sm font-medium text-white",
                "hover:bg-[#a34a30]",
                "transition-all duration-200"
              )}
              title="Jump to bookmark"
            >
              <Bookmark className="w-4 h-4 fill-current" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// Save bookmark helper (call from word click)
export async function saveBookmark(articleId: string, wordIndex: number): Promise<boolean> {
  try {
    const res = await fetch(`/api/articles/${articleId}/bookmark`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wordIndex }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
