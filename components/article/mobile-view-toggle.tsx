"use client";

import { useRef, useState } from "react";
import { motion, PanInfo } from "framer-motion";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Drawer, DrawerContent, DrawerTrigger, DrawerTitle } from "@/components/ui/drawer";
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

// Get full tooltip description for each tab
function getTabDescription(id: ViewMode, targetLanguage: string): { title: string; description: string } {
  switch (id) {
    case "target":
      return {
        title: targetLanguage,
        description: `Simplified ${targetLanguage} adapted to your learning level`,
      };
    case "bridge":
      return {
        title: "English",
        description: "English translation that matches the simplified text 1-to-1",
      };
    case "source":
      return {
        title: "Source",
        description: "Original article text before any simplification",
      };
    default:
      return { title: "", description: "" };
  }
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
  const [showHelp, setShowHelp] = useState(false);

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
    <>
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

        {/* Help button */}
        <Drawer open={showHelp} onOpenChange={setShowHelp}>
          <DrawerTrigger asChild>
            <button
              className={cn(
                "absolute -top-2 -left-2",
                "w-6 h-6 rounded-full",
                "bg-[#f5f0eb] border border-[#e8dfd3]",
                "flex items-center justify-center",
                "text-[#6b6b6b] hover:text-[#1a1a1a]",
                "shadow-sm"
              )}
              aria-label="View tab descriptions"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </DrawerTrigger>
          <DrawerContent>
            <DrawerTitle className="sr-only">View Modes</DrawerTitle>
            <div className="px-4 pt-2 pb-6">
              <h3 className="text-lg font-semibold text-[#1a1a1a] mb-4">Reading Views</h3>
              <div className="space-y-4">
                {segments.map((segment) => {
                  const info = getTabDescription(segment.id, targetLanguage);
                  return (
                    <button
                      key={segment.id}
                      onClick={() => {
                        onModeChange(segment.id);
                        setShowHelp(false);
                      }}
                      className={cn(
                        "w-full text-left p-3 rounded-xl transition-colors",
                        mode === segment.id
                          ? "bg-[#c45c3e]/10 border-2 border-[#c45c3e]"
                          : "bg-[#f5f0eb] border-2 border-transparent"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-xs font-bold",
                          mode === segment.id
                            ? "bg-[#c45c3e] text-white"
                            : "bg-[#e8dfd3] text-[#6b6b6b]"
                        )}>
                          {segment.label}
                        </span>
                        <span className="font-medium text-[#1a1a1a]">{info.title}</span>
                      </div>
                      <p className="text-sm text-[#6b6b6b]">{info.description}</p>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-[#9a9a9a] mt-4 text-center">
                Swipe up/down on the toggle to switch views
              </p>
            </div>
          </DrawerContent>
        </Drawer>
      </motion.div>
    </>
  );
}
