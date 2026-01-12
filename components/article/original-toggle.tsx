"use client";

import { Languages, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface OriginalToggleProps {
  showOriginal: boolean;
  onToggle: () => void;
}

export function OriginalToggle({ showOriginal, onToggle }: OriginalToggleProps) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "fixed bottom-24 right-4 z-40 md:hidden",
        "flex items-center gap-2 px-4 py-3 rounded-full",
        "shadow-lg backdrop-blur-md transition-all duration-200",
        "active:scale-95",
        showOriginal
          ? "bg-[#c45c3e] text-white"
          : "bg-white/95 text-[#1a1a1a] border border-[#e8dfd3]"
      )}
      aria-label={showOriginal ? "Show translated text" : "Show original text"}
    >
      {showOriginal ? (
        <>
          <Languages className="h-5 w-5" />
          <span className="text-sm font-medium">Translated</span>
        </>
      ) : (
        <>
          <FileText className="h-5 w-5" />
          <span className="text-sm font-medium">Original</span>
        </>
      )}
    </button>
  );
}
