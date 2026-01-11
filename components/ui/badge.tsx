import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "success" | "warning" | "error" | "outline" | "forest" | "terracotta";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variants = {
    default: "bg-[#2d5a47]/10 text-[#2d5a47] border-[#2d5a47]/20",
    secondary: "bg-[#f3ede4] text-[#6b6b6b] border-[#e8dfd3]",
    success: "bg-emerald-50 text-emerald-700 border-emerald-200",
    warning: "bg-amber-50 text-amber-700 border-amber-200",
    error: "bg-red-50 text-red-700 border-red-200",
    outline: "bg-transparent text-[#6b6b6b] border-[#e8dfd3]",
    forest: "bg-[#2d5a47]/10 text-[#2d5a47] border-[#2d5a47]/20",
    terracotta: "bg-[#c45c3e]/10 text-[#a34a30] border-[#c45c3e]/20",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-medium",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

export { Badge };
