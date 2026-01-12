"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Sparkles, Bookmark, Check } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

interface WordTooltipProps {
  word: string;
  contextSentence?: string;
  targetLanguage: string;
  articleId?: string;
}

interface DictionaryResult {
  found: boolean;
  word: string;
  translation?: string;
  partOfSpeech?: string;
  article?: string;
  gender?: string;
  definition?: string;
  example?: string;
  synonyms?: string[];
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

export function WordTooltip({
  word,
  contextSentence,
  targetLanguage,
  articleId,
}: WordTooltipProps) {
  const [dictionaryResult, setDictionaryResult] =
    useState<DictionaryResult | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [isLoadingDict, setIsLoadingDict] = useState(true);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const fetchDictionary = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/word/lookup?word=${encodeURIComponent(
          word
        )}&language=${encodeURIComponent(targetLanguage)}`
      );
      const data = await res.json();
      setDictionaryResult(data);
    } catch {
      setDictionaryResult({ found: false, word, message: "Lookup failed" });
    } finally {
      setIsLoadingDict(false);
    }
  }, [word, targetLanguage]);

  useEffect(() => {
    fetchDictionary();
  }, [fetchDictionary]);

  const handleAnalyzeWithAI = async () => {
    setIsLoadingAI(true);
    try {
      const res = await fetch("/api/word/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word,
          contextSentence,
          targetLanguage,
        }),
      });

      if (!res.ok) {
        throw new Error("Analysis failed");
      }

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
  };

  const handleSaveWord = async (fetchDetails = false) => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/vocabulary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word,
          contextSentence,
          translation:
            aiAnalysis?.translation ||
            dictionaryResult?.translation ||
            dictionaryResult?.definition,
          partOfSpeech: aiAnalysis?.pos || dictionaryResult?.partOfSpeech,
          article: aiAnalysis?.article || dictionaryResult?.article,
          example: aiAnalysis?.example || dictionaryResult?.example,
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

  // Get display data from AI analysis or dictionary
  const article = aiAnalysis?.article || dictionaryResult?.article;
  const partOfSpeech = aiAnalysis?.pos || dictionaryResult?.partOfSpeech;
  const translation = aiAnalysis?.translation || dictionaryResult?.translation;
  const definition = dictionaryResult?.definition;
  const example = aiAnalysis?.example || dictionaryResult?.example;
  const explanation = aiAnalysis?.explanation;

  return (
    <div className="w-full">
      {/* Loading state */}
      {isLoadingDict && (
        <div className="flex items-center justify-center gap-2 py-6 md:py-4">
          <Loader2 className="h-4 w-4 text-[#c45c3e] animate-spin" />
          <span className="text-sm text-[#6b6b6b]">Looking up...</span>
        </div>
      )}

      {/* Main content */}
      {!isLoadingDict && dictionaryResult && (
        <div className="space-y-3 md:space-y-2.5">
          {/* Word header - more compact, left-aligned feel with centered content */}
          <div className="space-y-1">
            {/* Word with article and POS inline */}
            <div className="flex items-baseline justify-center gap-2 flex-wrap">
              {article && (
                <span className="text-[#c45c3e] text-base md:text-sm font-medium">
                  {article}
                </span>
              )}
              <h2 className="text-2xl md:text-xl font-semibold text-[#1a1a1a]">
                {word}
              </h2>
              {partOfSpeech && (
                <span className="text-xs text-[#9a9a9a] font-medium">
                  {partOfSpeech}
                </span>
              )}
            </div>
          </div>

          {/* Translation/Definition - clean and prominent */}
          {(translation || definition) && (
            <p className="text-[#1a1a1a] text-base md:text-sm leading-relaxed text-center">
              {translation || definition}
            </p>
          )}

          {/* Not found state */}
          {!dictionaryResult.found && !translation && !definition && (
            <p className="text-[#9a9a9a] text-sm text-center py-2">
              {dictionaryResult.message || "No dictionary entry found"}
            </p>
          )}

          {/* Example - subtle styling */}
          {example && (
            <p className="text-[#6b6b6b] text-sm md:text-xs italic text-center border-t border-[#f3ede4] pt-2.5 md:pt-2">
              "{example}"
            </p>
          )}

          {/* AI Explanation - compact card */}
          {explanation && (
            <div className="bg-[#faf8f5] rounded-lg p-2.5 md:p-2 border border-[#f3ede4]">
              <div className="flex items-start gap-2">
                <Sparkles className="h-3.5 w-3.5 text-[#c45c3e] mt-0.5 shrink-0" />
                <p className="text-xs text-[#4a4a4a] leading-relaxed">
                  {explanation}
                </p>
              </div>
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-[#f3ede4]" />

          {/* Action row - cleaner, more integrated */}
          <div className="flex items-center justify-between pt-1 pb-6 md:pb-1">
            {/* Left: More details link */}
            {!aiAnalysis && (
              <button
                onClick={handleAnalyzeWithAI}
                disabled={isLoadingAI}
                className={cn(
                  "flex items-center gap-1.5 text-sm md:text-xs font-medium",
                  "text-[#6b6b6b] hover:text-[#c45c3e] transition-colors",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                {isLoadingAI ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Analyzing...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>
                      {dictionaryResult.found ? "More details" : "AI lookup"}
                    </span>
                  </>
                )}
              </button>
            )}

            {/* Spacer when no AI button */}
            {aiAnalysis && <div />}

            {/* Right: Save button */}
            <button
              onClick={() => handleSaveWord(!aiAnalysis)}
              disabled={isSaved || isSaving}
              className={cn(
                "flex items-center gap-1.5",
                "py-1.5 md:py-1 px-3 md:px-2.5 rounded-full",
                "text-sm md:text-xs font-medium transition-all duration-200",
                isSaved
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-[#c45c3e] text-white hover:bg-[#b35537] active:scale-[0.97]",
                "disabled:opacity-70 disabled:cursor-not-allowed disabled:active:scale-100"
              )}
            >
              {isSaved ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  <span>Saved</span>
                </>
              ) : isSaving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Bookmark className="h-3.5 w-3.5" />
                  <span>Save</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
