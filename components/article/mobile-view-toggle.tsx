"use client";

import { useRef } from "react";
import { motion, PanInfo } from "framer-motion";
import { cn } from "@/lib/utils";
import type { ViewMode } from "./view-mode-toggle";

interface MobileViewToggleProps {
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  targetLanguage: string;
  hasBridge?: boolean;
  hasAudioPlayer?: boolean; // Full audio player vs just "Generate Audio" button
  className?: string;
}

// Get 2-letter language code for compact display
function getLanguageCode(language: string): string {
  const codes: Record<string, string> = {
    german: "DE",
    french: "FR",
    spanish: "ES",
    italian: "IT",
    portuguese: "PT",
    dutch: "NL",
    polish: "PL",
    russian: "RU",
    japanese: "JA",
    chinese: "ZH",
    korean: "KO",
    english: "EN",
  };
  return codes[language.toLowerCase()] || language.slice(0, 2).toUpperCase();
}

export function MobileViewToggle({
  mode,
  onModeChange,
  targetLanguage,
  hasBridge = true,
  hasAudioPlayer = false,
  className,
}: MobileViewToggleProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const segments: { id: ViewMode; label: string }[] = hasBridge
    ? [
        { id: "target", label: getLanguageCode(targetLanguage) },
        { id: "bridge", label: "EN" },
        { id: "source", label: "SRC" },
      ]
    : [
        { id: "target", label: getLanguageCode(targetLanguage) },
        { id: "source", label: "SRC" },
      ];

  const currentIndex = segments.findIndex((s) => s.id === mode);
  const segmentHeight = 40;

  // Handle swipe gestures
  const handlePan = (_: unknown, info: PanInfo) => {
    const threshold = 20;
    if (Math.abs(info.offset.y) > threshold) {
      const direction = info.offset.y > 0 ? 1 : -1;
      const newIndex = Math.max(0, Math.min(segments.length - 1, currentIndex + direction));
      if (newIndex !== currentIndex) {
        onModeChange(segments[newIndex].id);
      }
    }
  };

  return (
    <motion.div
      ref={containerRef}
      className={cn(
        // Fixed position - bottom right, above audio controls
        "fixed right-4 z-40",
        // Conditional bottom offset: audio player (~120px) vs button (~70px)
        hasAudioPlayer ? "bottom-32" : "bottom-20",
        // Solid white background for visibility
        "rounded-2xl p-1",
        "bg-white",
        "shadow-lg shadow-black/20",
        "border border-[#e8dfd3]",
        className
      )}
      initial={{ opacity: 0, scale: 0.9, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      onPanEnd={handlePan}
    >
      <div className="relative">
        {/* Sliding indicator - brand color */}
        <motion.div
          className="absolute left-1 right-1 rounded-xl bg-[#c45c3e]"
          style={{ height: segmentHeight - 4 }}
          initial={false}
          animate={{
            y: currentIndex * segmentHeight + 2,
          }}
          transition={{
            type: "spring",
            stiffness: 500,
            damping: 35,
          }}
        />

        {/* Buttons */}
        <div className="relative flex flex-col">
          {segments.map((segment) => (
            <button
              key={segment.id}
              onClick={() => onModeChange(segment.id)}
              className={cn(
                "relative z-10 w-14 flex items-center justify-center",
                "text-sm font-semibold",
                "transition-colors duration-150",
                "active:scale-95",
                mode === segment.id
                  ? "text-white"
                  : "text-[#6b6b6b]"
              )}
              style={{ height: segmentHeight }}
              aria-selected={mode === segment.id}
              role="tab"
            >
              {segment.label}
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
