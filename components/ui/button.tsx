"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "secondary" | "outline" | "ghost" | "destructive";
  size?: "default" | "sm" | "lg" | "icon";
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", asChild = false, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    const baseStyles = "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c45c3e] focus-visible:ring-offset-2 focus-visible:ring-offset-[#faf7f2] disabled:pointer-events-none disabled:opacity-50";

    const variants = {
      default: "bg-[#c45c3e] text-white font-semibold hover:bg-[#a34a30] shadow-sm hover:shadow-md active:shadow-sm",
      secondary: "bg-[#f3ede4] text-[#3d3d3d] border border-[#e8dfd3] hover:bg-[#e8dfd3] hover:border-[#d4c5b5]",
      outline: "border border-[#e8dfd3] bg-white text-[#3d3d3d] hover:bg-[#faf7f2] hover:border-[#c45c3e]/30",
      ghost: "text-[#6b6b6b] hover:text-[#1a1a1a] hover:bg-[#f3ede4]",
      destructive: "bg-red-600 text-white hover:bg-red-700 shadow-sm",
    };

    const sizes = {
      default: "h-11 px-5 py-2 text-sm",
      sm: "h-9 px-4 text-sm",
      lg: "h-12 px-8 text-base",
      icon: "h-10 w-10",
    };

    return (
      <Comp
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </Comp>
    );
  }
);

Button.displayName = "Button";

export { Button };
