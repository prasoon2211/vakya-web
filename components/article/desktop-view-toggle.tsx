"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ViewMode } from "./view-mode-toggle";

interface DesktopViewToggleProps {
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  targetLanguage: string;
  hasBridge?: boolean;
  className?: string;
}

// Tooltip descriptions for each tab
function getTabTooltip(id: ViewMode, targetLanguage: string): string {
  switch (id) {
    case "target":
      return `Simplified ${targetLanguage} adapted to your level`;
    case "bridge":
      return "English translation of the simplified text";
    case "source":
      return "Original article text before simplification";
    default:
      return "";
  }
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
    <TooltipProvider delayDuration={300}>
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

            {/* Buttons with tooltips */}
            {segments.map((segment) => (
              <Tooltip key={segment.id}>
                <TooltipTrigger asChild>
                  <button
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
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[200px] text-center">
                  {getTabTooltip(segment.id, targetLanguage)}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>

          {/* Keyboard shortcuts - clearer instructions */}
          <div className="flex items-center gap-3 text-xs text-[#9a9a9a]">
            <span className="text-[#6b6b6b] font-medium">Hold:</span>
            {hasBridge ? (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center gap-1.5 cursor-help">
                      <kbd className={cn(
                        "px-2 py-1 rounded border font-mono text-[11px] transition-colors",
                        isKeyboardActive && mode === "bridge"
                          ? "bg-[#c45c3e] text-white border-[#c45c3e]"
                          : "bg-[#f5f0eb] border-[#e8dfd3] text-[#6b6b6b]"
                      )}>Cmd</kbd>
                      <span>English</span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Hold Cmd (or Ctrl) to see English translation
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center gap-1.5 cursor-help">
                      <kbd className={cn(
                        "px-2 py-1 rounded border font-mono text-[11px] transition-colors",
                        isKeyboardActive && mode === "source"
                          ? "bg-[#c45c3e] text-white border-[#c45c3e]"
                          : "bg-[#f5f0eb] border-[#e8dfd3] text-[#6b6b6b]"
                      )}>Cmd+Shift</kbd>
                      <span>Source</span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Hold Cmd+Shift to see original text
                  </TooltipContent>
                </Tooltip>
              </>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex items-center gap-1.5 cursor-help">
                    <kbd className={cn(
                      "px-2 py-1 rounded border font-mono text-[11px] transition-colors",
                      isKeyboardActive && mode === "source"
                        ? "bg-[#c45c3e] text-white border-[#c45c3e]"
                        : "bg-[#f5f0eb] border-[#e8dfd3] text-[#6b6b6b]"
                    )}>Cmd</kbd>
                    <span>Source</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  Hold Cmd (or Ctrl) to see original text
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
