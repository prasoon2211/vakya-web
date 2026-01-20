"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Sparkles,
  Bookmark,
  Check,
  ChevronDown,
  ExternalLink,
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

interface WordTooltipProps {
  word: string;
  contextSentence?: string;
  targetLanguage: string;
  articleId?: string;
  // Bookmark support
  wordIndex?: number;
  isBookmarked?: boolean;
  onSetBookmark?: (wordIndex: number) => void;
  onRemoveBookmark?: () => void;
}

interface DictionaryResult {
  found: boolean;
  word: string;
  language?: string;
  translation?: string;
  definitions?: string[];
  partOfSpeech?: string;
  article?: string;
  gender?: string;
  forms?: string;
  parsedForms?: Record<string, string>;
  ipa?: string;
  audioUrl?: string;
  message?: string;
}

interface AIAnalysis {
  word: string;
  translation: string;
  pos: string;
  article?: string;
  gender?: string;
  example: string;
  explanation: string;
}

// Gender color schemes per language - more vibrant for visibility
const genderColors = {
  masculine: {
    bg: "bg-blue-100",
    text: "text-blue-800",
    border: "border-blue-300",
    dot: "bg-blue-500",
  },
  feminine: {
    bg: "bg-pink-100",
    text: "text-pink-800",
    border: "border-pink-300",
    dot: "bg-pink-500",
  },
  neuter: {
    bg: "bg-emerald-100",
    text: "text-emerald-800",
    border: "border-emerald-300",
    dot: "bg-emerald-500",
  },
};

// Language code mapping for Wiktionary URLs
const wiktionaryLanguageCodes: Record<string, string> = {
  German: "German",
  French: "French",
  Spanish: "Spanish",
};

// Extract base word from inflection notes like "past participle of konzentrieren" or "from: Hund"
function parseInflectionNote(
  note: string
): { prefix: string; baseWord: string } | null {
  // Pattern 1: "X of word" (most common)
  const ofMatch = note.match(/^(.+?\s+of\s+)([a-zA-ZÀ-ÿ\-]+)$/i);
  if (ofMatch) {
    return { prefix: ofMatch[1], baseWord: ofMatch[2] };
  }

  // Pattern 2: "from: word"
  const fromMatch = note.match(/^(from:\s*)([a-zA-ZÀ-ÿ\-]+)$/i);
  if (fromMatch) {
    return { prefix: fromMatch[1], baseWord: fromMatch[2] };
  }

  return null;
}

function getWiktionaryUrl(word: string, language: string): string {
  const langAnchor = wiktionaryLanguageCodes[language] || language;
  return `https://en.wiktionary.org/wiki/${encodeURIComponent(
    word
  )}#${encodeURIComponent(langAnchor)}`;
}

// Check if a definition is just an inflection reference without a real meaning
// e.g., "gerund of überlaufen" should trigger AI lookup for full meaning
function isIncompleteDefinition(definition: string | undefined): boolean {
  if (!definition) return true;

  // Patterns that indicate the definition is just a reference, not a real meaning
  const inflectionPatterns = [
    /^(plural|singular|inflection|gerund|participle|infinitive) of /i,
    /^(past|present|perfect|future|active|passive) participle of /i,
    /^(first|second|third)[- ]person .* of /i,
    /^(nominative|accusative|genitive|dative|vocative) .* of /i,
    /^(masculine|feminine|neuter) .* of /i,
    /^(comparative|superlative) (form |degree )?of /i,
    /^(diminutive|augmentative) (form )?of /i,
    /^(alternative|archaic|obsolete|dated) (form|spelling) of /i,
    /^(strong|weak|mixed) (genitive|inflection|form) of /i,
    /^from: /i,
  ];

  return inflectionPatterns.some((p) => p.test(definition));
}

export function WordTooltip({
  word,
  contextSentence,
  targetLanguage,
  articleId,
  wordIndex,
  isBookmarked,
  onSetBookmark,
  onRemoveBookmark,
}: WordTooltipProps) {
  const [dictionaryResult, setDictionaryResult] =
    useState<DictionaryResult | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [isLoadingDict, setIsLoadingDict] = useState(true);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showAllDefinitions, setShowAllDefinitions] = useState(false);
  const [showForms, setShowForms] = useState(false);

  const handleAnalyzeWithAI = useCallback(async () => {
    setIsLoadingAI(true);
    try {
      const res = await fetch("/api/word/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word, contextSentence, targetLanguage }),
      });

      if (!res.ok) throw new Error("Analysis failed");
      const data = await res.json();
      setAiAnalysis(data);
    } catch {
      toast({
        title: "Analysis failed",
        description: "Please try again",
        variant: "error",
      });
    } finally {
      setIsLoadingAI(false);
    }
  }, [word, contextSentence, targetLanguage]);

  const fetchDictionary = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/word/lookup?word=${encodeURIComponent(
          word
        )}&language=${encodeURIComponent(targetLanguage)}`
      );
      const data = await res.json();
      setDictionaryResult(data);

      // Auto-trigger AI if:
      // 1. Word not found in dictionary, OR
      // 2. Definition is just an inflection reference without real meaning
      const primaryDef = data.definitions?.[0] || data.translation;
      if (!data.found || isIncompleteDefinition(primaryDef)) {
        handleAnalyzeWithAI();
      }
    } catch {
      setDictionaryResult({ found: false, word, message: "Lookup failed" });
      handleAnalyzeWithAI();
    } finally {
      setIsLoadingDict(false);
    }
  }, [word, targetLanguage, handleAnalyzeWithAI]);

  useEffect(() => {
    fetchDictionary();
  }, [fetchDictionary]);

  const handleSaveWord = async (fetchDetails = false) => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/vocabulary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word,
          contextSentence,
          translation: aiAnalysis?.translation || dictionaryResult?.translation,
          partOfSpeech: aiAnalysis?.pos || dictionaryResult?.partOfSpeech,
          article: aiAnalysis?.article || dictionaryResult?.article,
          example: aiAnalysis?.example,
          targetLanguage,
          sourceArticleId: articleId,
          fetchAIDetails: fetchDetails && !aiAnalysis,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        if (error.error?.includes("duplicate")) {
          toast({
            title: "Word already saved",
            description: "This word is already in your vocabulary",
          });
          setIsSaved(true);
          return;
        }
        throw new Error(error.error || "Failed to save");
      }

      setIsSaved(true);
      toast({
        title: "Word saved!",
        description:
          fetchDetails && !aiAnalysis
            ? "Details will be fetched in the background"
            : "Added to your vocabulary",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Failed to save word",
        description:
          error instanceof Error ? error.message : "Please try again",
        variant: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Get display data
  const article = aiAnalysis?.article || dictionaryResult?.article;
  const gender = aiAnalysis?.gender || dictionaryResult?.gender;
  const partOfSpeech = aiAnalysis?.pos || dictionaryResult?.partOfSpeech;

  const fallbackArticleByGender: Record<string, Record<string, string>> = {
    German: { masculine: "der", feminine: "die", neuter: "das" },
    French: { masculine: "le", feminine: "la" },
    Spanish: { masculine: "el", feminine: "la" },
  };
  const resolvedArticle =
    article ||
    (gender ? fallbackArticleByGender[targetLanguage]?.[gender] : null);
  const translation = aiAnalysis?.translation || dictionaryResult?.translation;
  const definitions = dictionaryResult?.definitions || [];
  const primaryDefinition = translation || definitions[0];
  const ipa = dictionaryResult?.ipa;
  const parsedForms = dictionaryResult?.parsedForms;
  const explanation = aiAnalysis?.explanation;

  const genderStyle = gender
    ? genderColors[gender as keyof typeof genderColors]
    : null;
  const hasForms = parsedForms && Object.keys(parsedForms).length > 0;

  // Grammar markers to extract as labels
  const grammarMarkers = [
    "reflexive",
    "transitive",
    "intransitive",
    "auxiliary",
    "impersonal",
    "reciprocal",
  ];

  // Form note triggers (these go in the inflection note area)
  const formNoteTriggers = [
    "participle",
    "form of",
    "plural of",
    "singular of",
    "inflection",
    "gerund",
    "from:",
    "tense",
    "imperative",
    "subjunctive",
    "indicative",
    "conjugat",
    "comparative",
    "superlative",
    "feminine",
    "masculine",
    "neuter",
    "variant",
    "spelling",
    "romanization",
    "pronunciation",
    "alternative",
  ];

  let mainDefinition = primaryDefinition;
  let inflectionNote: string | null = null;
  let grammarLabels: string[] = [];

  if (primaryDefinition) {
    // First, extract grammar markers from parentheticals
    const grammarMatch = primaryDefinition.match(/^\(([^)]+)\)\s*/);
    if (grammarMatch) {
      const marker = grammarMatch[1].toLowerCase().trim();
      if (grammarMarkers.includes(marker)) {
        grammarLabels.push(marker);
        mainDefinition = primaryDefinition.slice(grammarMatch[0].length);
      }
    }

    // Then check for form notes at the end
    const formMatch = (mainDefinition || primaryDefinition).match(
      /^(.*?)(?:\s*\(([^)]+)\))\s*$/
    );
    if (formMatch) {
      const note = formMatch[2]?.trim() || "";
      const noteLower = note.toLowerCase();
      const isFormNote = formNoteTriggers.some((trigger) =>
        noteLower.includes(trigger)
      );
      const isGrammarMarker = grammarMarkers.includes(noteLower);

      if (isFormNote) {
        mainDefinition =
          formMatch[1].trim() || mainDefinition || primaryDefinition;
        inflectionNote = note;
      } else if (isGrammarMarker && !grammarLabels.includes(noteLower)) {
        grammarLabels.push(noteLower);
        mainDefinition =
          formMatch[1].trim() || mainDefinition || primaryDefinition;
      }
    }

    // Also extract inline grammar markers like "(reflexive) to concentrate"
    if (mainDefinition) {
      const inlineMatch = mainDefinition.match(/^\(([^)]+)\)\s*(.+)$/);
      if (inlineMatch) {
        const marker = inlineMatch[1].toLowerCase().trim();
        if (
          grammarMarkers.includes(marker) &&
          !grammarLabels.includes(marker)
        ) {
          grammarLabels.push(marker);
          mainDefinition = inlineMatch[2];
        }
      }
    }

    // Strip bracketed usage notes like [with auf (+ accusative) 'on something']
    if (mainDefinition) {
      mainDefinition = mainDefinition.replace(/\s*\[[^\]]+\]\s*$/, "").trim();
    }
  }

  const hasPrimaryDefinition = Boolean(mainDefinition);

  // Truncate long definitions
  const MAX_DEF_LENGTH = 80;
  const isDefinitionLong =
    mainDefinition && mainDefinition.length > MAX_DEF_LENGTH;
  const [showFullDefinition, setShowFullDefinition] = useState(false);
  const displayDefinition =
    mainDefinition && isDefinitionLong && !showFullDefinition
      ? mainDefinition.slice(0, MAX_DEF_LENGTH).trim() + "…"
      : mainDefinition;

  // Filter out secondary definitions that duplicate the main definition
  // Extract core meaning words (strip grammar markers, parentheticals, brackets)
  const extractCoreMeaning = (s: string) => {
    return s
      .toLowerCase()
      .replace(/\([^)]*\)/g, "") // remove (reflexive), (transitive), etc.
      .replace(/\[[^\]]*\]/g, "") // remove [with auf ...]
      .replace(/[.,;:!?'"]/g, "")
      .split(/\s+/)
      .filter((word) => word.length > 2) // skip tiny words
      .filter(
        (word) =>
          ![
            "the",
            "to",
            "a",
            "an",
            "of",
            "on",
            "in",
            "for",
            "with",
            "and",
            "or",
          ].includes(word)
      )
      .sort()
      .join(" ")
      .trim();
  };

  const mainCore = mainDefinition ? extractCoreMeaning(mainDefinition) : "";

  const rawSecondaryDefinitions =
    primaryDefinition && definitions[0] === primaryDefinition
      ? definitions.slice(1)
      : definitions;

  const secondaryDefinitions = rawSecondaryDefinitions.filter((def) => {
    const defCore = extractCoreMeaning(def);
    // Filter out if core meanings are the same or one is subset of the other
    if (!mainCore || !defCore) return true;
    const mainWords = new Set(mainCore.split(" "));
    const defWords = new Set(defCore.split(" "));
    // Check if all words in the shorter one are in the longer one
    const smaller = mainWords.size <= defWords.size ? mainWords : defWords;
    const larger = mainWords.size > defWords.size ? mainWords : defWords;
    const isSubset = [...smaller].every((w) => larger.has(w));
    return !isSubset;
  });

  const hasSecondaryDefinitions = secondaryDefinitions.length > 0;

  return (
    <div className="w-full">
      {/* Loading state */}
      {isLoadingDict && (
        <div className="flex items-center justify-center gap-2 py-4">
          <Loader2 className="h-4 w-4 text-[#c45c3e] animate-spin" />
          <span className="text-sm text-[#6b6b6b]">Looking up...</span>
        </div>
      )}

      {/* Main content */}
      {!isLoadingDict && dictionaryResult && (
        <div className="pb-4 md:pb-0">
          {/* Header: Article + Word + POS + Bookmark + Save */}
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              {/* Article with gender color */}
              {resolvedArticle && (
                <span
                  className={cn(
                    "text-sm font-bold px-2 py-0.5 rounded border",
                    genderStyle
                      ? `${genderStyle.bg} ${genderStyle.text} ${genderStyle.border}`
                      : "bg-gray-100 text-gray-700 border-gray-300"
                  )}
                >
                  {resolvedArticle}
                </span>
              )}
              {/* Word */}
              <h2 className="text-xl font-semibold text-[#1a1a1a]">{word}</h2>
              {/* Part of speech badge */}
              {partOfSpeech && (
                <span className="text-[10px] uppercase tracking-wide text-[#7a7a7a] bg-[#f0f0f0] px-1.5 py-0.5 rounded">
                  {partOfSpeech}
                </span>
              )}
              {/* Gender indicator dot (if no article shown) */}
              {!article && genderStyle && (
                <span
                  className={cn("w-2 h-2 rounded-full", genderStyle.dot)}
                  title={gender || ""}
                />
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Reading position bookmark - icon only */}
              {wordIndex !== undefined && onSetBookmark && (
                <button
                  onClick={() => {
                    if (isBookmarked && onRemoveBookmark) {
                      onRemoveBookmark();
                    } else {
                      onSetBookmark(wordIndex);
                    }
                  }}
                  className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-full transition-all duration-200",
                    isBookmarked
                      ? "bg-amber-50 text-amber-600 hover:bg-amber-100"
                      : "text-[#b5b5b5] hover:text-[#c45c3e] hover:bg-[#faf5f0]"
                  )}
                  title={isBookmarked ? "Remove reading bookmark" : "Bookmark this position"}
                >
                  <Bookmark
                    className={cn(
                      "h-4 w-4 transition-transform duration-200",
                      isBookmarked && "fill-current"
                    )}
                  />
                </button>
              )}

              {/* Save to vocabulary */}
              <button
                onClick={() => handleSaveWord(!aiAnalysis)}
                disabled={isSaved || isSaving}
                className={cn(
                  "flex items-center gap-1 py-1 px-2.5 rounded-full",
                  "text-xs font-medium transition-all duration-200",
                  isSaved
                    ? "bg-emerald-50 text-emerald-600"
                    : "bg-[#c45c3e] text-white hover:bg-[#b35537] active:scale-[0.97]",
                  "disabled:opacity-70 disabled:cursor-not-allowed"
                )}
              >
                {isSaved ? (
                  <>
                    <Check className="h-3 w-3" />
                    <span>Saved</span>
                  </>
                ) : isSaving ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <>
                    <Bookmark className="h-3 w-3" />
                    <span>Save</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* IPA Pronunciation */}
          {ipa && (
            <p className="text-sm text-[#8a8a8a] font-mono mb-2">/{ipa}/</p>
          )}

          {/* Definition(s) */}
          {hasPrimaryDefinition && (
            <div className="mb-2 space-y-1.5">
              {/* Grammar labels */}
              {grammarLabels.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {grammarLabels.map((label, i) => (
                    <span key={i} className="text-[10px] text-[#8a8a8a] italic">
                      {label}
                    </span>
                  ))}
                </div>
              )}

              {/* Main definition with optional truncation */}
              <p className="text-[#3a3a3a] text-[15px] leading-relaxed">
                {displayDefinition}
                {isDefinitionLong && (
                  <button
                    onClick={() => setShowFullDefinition(!showFullDefinition)}
                    className="text-[#8a8a8a] hover:text-[#c45c3e] ml-1 text-sm"
                  >
                    {showFullDefinition ? "less" : "more"}
                  </button>
                )}
              </p>

              {/* Form/inflection note - with Wiktionary link for base word */}
              {inflectionNote &&
                (() => {
                  const parsed = parseInflectionNote(inflectionNote);
                  if (parsed) {
                    return (
                      <p className="text-[13px] text-[#7a7a7a] italic">
                        {parsed.prefix}
                        <a
                          href={getWiktionaryUrl(
                            parsed.baseWord,
                            targetLanguage
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#c45c3e] underline underline-offset-2 hover:text-[#b35537] inline-flex items-center gap-0.5"
                        >
                          {parsed.baseWord}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </p>
                    );
                  }
                  return (
                    <p className="text-[13px] text-[#7a7a7a] italic">
                      {inflectionNote}
                    </p>
                  );
                })()}

              {/* Additional definitions */}
              {hasSecondaryDefinitions && (
                <>
                  {showAllDefinitions && (
                    <div className="mt-1.5 space-y-1">
                      {secondaryDefinitions.map((def, i) => (
                        <p
                          key={i}
                          className="text-[#5a5a5a] text-sm leading-relaxed pl-3 border-l-2 border-[#e5e5e5]"
                        >
                          {def}
                        </p>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => setShowAllDefinitions(!showAllDefinitions)}
                    className="text-xs text-[#8a8a8a] hover:text-[#c45c3e] mt-1 flex items-center gap-0.5"
                  >
                    <ChevronDown
                      className={cn(
                        "h-3 w-3 transition-transform",
                        showAllDefinitions && "rotate-180"
                      )}
                    />
                    {showAllDefinitions
                      ? "Less"
                      : `+${secondaryDefinitions.length} more`}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Not found state */}
          {!dictionaryResult.found && !hasPrimaryDefinition && (
            <p className="text-[#9a9a9a] text-sm mb-2">
              {dictionaryResult.message || "No dictionary entry found"}
            </p>
          )}

          {/* Forms section (collapsible) */}
          {hasForms && (
            <div className="mb-2">
              <button
                onClick={() => setShowForms(!showForms)}
                className="text-xs text-[#7a7a7a] hover:text-[#c45c3e] flex items-center gap-1"
              >
                <ChevronDown
                  className={cn(
                    "h-3 w-3 transition-transform",
                    showForms && "rotate-180"
                  )}
                />
                Forms
              </button>
              {showForms && (
                <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-sm bg-[#fafafa] rounded-md p-2">
                  {Object.entries(parsedForms!).map(([key, value]) => (
                    <div key={key} className="flex gap-1.5">
                      <span className="text-[#9a9a9a] capitalize">{key}:</span>
                      <span className="text-[#4a4a4a]">{value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* AI Explanation */}
          {explanation && (
            <div className="flex items-start gap-1.5 bg-[#faf8f5] rounded-md p-2 mb-2 border border-[#f0ebe3]">
              <Sparkles className="h-3 w-3 text-[#c45c3e] mt-0.5 shrink-0" />
              <p className="text-xs text-[#4a4a4a] leading-relaxed">
                {explanation}
              </p>
            </div>
          )}

          {/* Footer row: Wiktionary + More details */}
          <div className="flex items-center gap-2 pt-2 mt-2 border-t border-[#f0ebe3]">
            <a
              href={getWiktionaryUrl(word, targetLanguage)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-2 py-1 rounded-md bg-[#f5f5f5] text-[#5a5a5a] hover:bg-[#ebebeb] hover:text-[#3a3a3a] inline-flex items-center gap-1 transition-colors"
            >
              Wiktionary
              <ExternalLink className="h-3 w-3" />
            </a>

            {!aiAnalysis && (
              <button
                onClick={handleAnalyzeWithAI}
                disabled={isLoadingAI}
                className={cn(
                  "text-xs px-2 py-1 rounded-md inline-flex items-center gap-1 transition-colors",
                  "bg-[#faf5f0] text-[#c45c3e] hover:bg-[#f5ebe0]",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                {isLoadingAI ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Analyzing...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3 w-3" />
                    <span>
                      {dictionaryResult.found ? "More details" : "AI lookup"}
                    </span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
