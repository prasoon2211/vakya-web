import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-xl bg-white border border-[#e8dfd3] px-4 py-2 text-sm text-[#1a1a1a] placeholder:text-[#9a9a9a] transition-all duration-200",
          "focus:outline-none focus:ring-2 focus:ring-[#c45c3e]/20 focus:border-[#c45c3e]",
          "hover:border-[#d4c5b5]",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[#f3ede4]",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";

export { Input };
