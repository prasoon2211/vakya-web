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

    const baseStyles = "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0f14] disabled:pointer-events-none disabled:opacity-50";

    const variants = {
      default: "bg-gradient-to-r from-amber-500 to-orange-500 text-black font-semibold hover:from-amber-400 hover:to-orange-400 shadow-lg shadow-amber-500/25",
      secondary: "bg-white/5 text-white border border-white/10 hover:bg-white/10",
      outline: "border border-white/10 bg-transparent text-white hover:bg-white/5",
      ghost: "text-gray-400 hover:text-white hover:bg-white/5",
      destructive: "bg-red-500 text-white hover:bg-red-600",
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
