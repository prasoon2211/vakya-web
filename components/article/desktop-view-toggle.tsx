"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { ViewMode } from "./view-mode-toggle";

interface DesktopViewToggleProps {
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  targetLanguage: string;
  hasBridge?: boolean;
  className?: string;
}

export function DesktopViewToggle({
  mode,
  onModeChange,
  targetLanguage,
  hasBridge = true,
  className,
}: DesktopViewToggleProps) {
  const [isKeyboardActive, setIsKeyboardActive] = useState(false);

  // Track keyboard state for visual feedback
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Meta" || e.key === "Control") {
        setIsKeyboardActive(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Meta" || e.key === "Control") {
        setIsKeyboardActive(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  const segments: { id: ViewMode; label: string }[] = hasBridge
    ? [
        { id: "target", label: targetLanguage },
        { id: "bridge", label: "English" },
        { id: "source", label: "Source" },
      ]
    : [
        { id: "target", label: targetLanguage },
        { id: "source", label: "Source" },
      ];

  const currentIndex = segments.findIndex((s) => s.id === mode);

  return (
    <div
      className={cn(
        "sticky top-[120px] z-30 -mx-4 px-4 py-3 mb-4",
        "bg-[#faf8f5]/95 backdrop-blur-sm",
        "border-b border-[#e8dfd3]/50",
        className
      )}
    >
      <div className="flex items-center justify-between gap-4">
        {/* Toggle */}
        <div
          className={cn(
            "relative inline-flex rounded-full p-1",
            "bg-[#f0ebe4] border border-[#e8dfd3]",
            "transition-shadow duration-200",
            isKeyboardActive && "ring-2 ring-[#c45c3e]/30"
          )}
        >
          {/* Sliding indicator */}
          <motion.div
            className="absolute top-1 bottom-1 rounded-full bg-white shadow-sm"
            style={{ width: `calc(${100 / segments.length}% - 4px)` }}
            initial={false}
            animate={{
              x: `calc(${currentIndex * 100}% + ${currentIndex * 4}px)`,
            }}
            transition={{
              type: "spring",
              stiffness: 500,
              damping: 35,
            }}
          />

          {/* Buttons */}
          {segments.map((segment) => (
            <button
              key={segment.id}
              onClick={() => onModeChange(segment.id)}
              className={cn(
                "relative z-10 px-4 py-1.5 rounded-full",
                "text-sm font-medium",
                "transition-colors duration-200",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c45c3e] focus-visible:ring-offset-2",
                mode === segment.id
                  ? "text-[#1a1a1a]"
                  : "text-[#6b6b6b] hover:text-[#1a1a1a]"
              )}
            >
              {segment.label}
            </button>
          ))}
        </div>

        {/* Keyboard shortcuts */}
        <div className="flex items-center gap-4 text-xs text-[#9a9a9a]">
          {hasBridge ? (
            <>
              <span className="flex items-center gap-1.5">
                <kbd className={cn(
                  "px-2 py-1 rounded border font-mono text-[11px] transition-colors",
                  isKeyboardActive && mode === "bridge"
                    ? "bg-[#c45c3e] text-white border-[#c45c3e]"
                    : "bg-[#f5f0eb] border-[#e8dfd3] text-[#6b6b6b]"
                )}>⌘</kbd>
                <span>English</span>
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className={cn(
                  "px-2 py-1 rounded border font-mono text-[11px] transition-colors",
                  isKeyboardActive && mode === "source"
                    ? "bg-[#c45c3e] text-white border-[#c45c3e]"
                    : "bg-[#f5f0eb] border-[#e8dfd3] text-[#6b6b6b]"
                )}>⌘⇧</kbd>
                <span>Source</span>
              </span>
            </>
          ) : (
            <span className="flex items-center gap-1.5">
              <kbd className={cn(
                "px-2 py-1 rounded border font-mono text-[11px] transition-colors",
                isKeyboardActive && mode === "source"
                  ? "bg-[#c45c3e] text-white border-[#c45c3e]"
                  : "bg-[#f5f0eb] border-[#e8dfd3] text-[#6b6b6b]"
              )}>⌘</kbd>
              <span>Source</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
