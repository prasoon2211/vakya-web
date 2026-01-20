import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const then = new Date(date);
  const diffInSeconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (diffInSeconds < 60) return "just now";
  if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  }
  if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  }
  if (diffInSeconds < 604800) {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days} day${days > 1 ? "s" : ""} ago`;
  }
  return then.toLocaleDateString();
}

export function extractDomain(url: string): string {
  try {
    const domain = new URL(url).hostname;
    return domain.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + "...";
}

/**
 * Format word display based on language and part of speech
 *
 * German: All nouns are capitalized (Haus, Streit, etc.)
 * French/Spanish: Nouns are NOT capitalized (maison, casa)
 *
 * @param word - The word to format
 * @param language - Target language (German, French, Spanish)
 * @param partOfSpeech - Part of speech (noun, verb, etc.)
 * @returns Properly formatted word
 */
export function formatWordDisplay(
  word: string,
  language?: string | null,
  partOfSpeech?: string | null
): string {
  if (!word) return word;

  // For German nouns, capitalize the first letter
  if (language === "German" && partOfSpeech?.toLowerCase().includes("noun")) {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }

  // For other languages or non-nouns, keep as-is
  return word;
}
