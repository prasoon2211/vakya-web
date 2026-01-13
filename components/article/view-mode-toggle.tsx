"use client";

import { cn } from "@/lib/utils";

export type ViewMode = "target" | "bridge" | "source";

interface ViewModeToggleProps {
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  targetLanguage: string;
  hasBridge?: boolean; // Whether bridge translation is available
  className?: string;
}

export function ViewModeToggle({
  mode,
  onModeChange,
  targetLanguage,
  hasBridge = true,
  className,
}: ViewModeToggleProps) {
  // If no bridge, fall back to 2-state toggle (target/source)
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

  return (
    <div
      className={cn(
        "inline-flex rounded-full p-1 bg-[#f5f0eb] border border-[#e8dfd3]",
        className
      )}
      role="tablist"
      aria-label="View mode"
    >
      {segments.map((segment) => (
        <button
          key={segment.id}
          role="tab"
          aria-selected={mode === segment.id}
          onClick={() => onModeChange(segment.id)}
          className={cn(
            "px-4 py-1.5 text-sm font-medium rounded-full transition-all duration-200",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c45c3e] focus-visible:ring-offset-1",
            mode === segment.id
              ? "bg-[#c45c3e] text-white shadow-sm"
              : "text-[#6b6b6b] hover:text-[#1a1a1a] hover:bg-white/50"
          )}
        >
          {segment.label}
        </button>
      ))}
    </div>
  );
}
