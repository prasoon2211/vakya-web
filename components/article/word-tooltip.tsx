"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Sparkles, BookmarkPlus, Check, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  phonetic?: string;
  audioUrl?: string;
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
  const [dictionaryResult, setDictionaryResult] = useState<DictionaryResult | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [isLoadingDict, setIsLoadingDict] = useState(true);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const fetchDictionary = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/word/lookup?word=${encodeURIComponent(word)}&language=${encodeURIComponent(targetLanguage)}`
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
          translation: aiAnalysis?.translation || dictionaryResult?.translation || dictionaryResult?.definition,
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
        description: fetchDetails && !aiAnalysis ? "Details will be fetched in the background" : "Added to your vocabulary",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Failed to save word",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const playAudio = () => {
    if (dictionaryResult?.audioUrl) {
      const audio = new Audio(dictionaryResult.audioUrl);
      audio.play();
    }
  };

  // Get display data from AI analysis or dictionary
  const article = aiAnalysis?.article || dictionaryResult?.article;
  const partOfSpeech = aiAnalysis?.pos || dictionaryResult?.partOfSpeech;
  const translation = aiAnalysis?.translation || dictionaryResult?.translation;
  const definition = dictionaryResult?.definition;
  const example = aiAnalysis?.example || dictionaryResult?.example;
  const explanation = aiAnalysis?.explanation;
  const phonetic = dictionaryResult?.phonetic;
  const audioUrl = dictionaryResult?.audioUrl;

  return (
    <div className="w-full">
      {/* Loading state */}
      {isLoadingDict && (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-2 border-[#e8dfd3]" />
            <div className="absolute inset-0 w-12 h-12 rounded-full border-2 border-[#c45c3e] border-t-transparent animate-spin" />
          </div>
          <p className="mt-4 text-sm text-[#9a9a9a]">Looking up word...</p>
        </div>
      )}

      {/* Main content */}
      {!isLoadingDict && dictionaryResult && (
        <div className="space-y-6">
          {/* Word header section */}
          <div className="text-center pb-4 border-b border-[#f3ede4]">
            {/* Article + Word */}
            <div className="flex items-baseline justify-center gap-2">
              {article && (
                <span className="text-[#c45c3e] text-lg font-medium">{article}</span>
              )}
              <h2 className="text-3xl font-semibold text-[#1a1a1a] tracking-tight">
                {word}
              </h2>
            </div>

            {/* Phonetic + Audio */}
            <div className="flex items-center justify-center gap-2 mt-2">
              {phonetic && (
                <span className="text-[#9a9a9a] text-sm">{phonetic}</span>
              )}
              {audioUrl && (
                <button
                  onClick={playAudio}
                  className="p-1.5 rounded-full hover:bg-[#f3ede4] transition-colors group"
                >
                  <Volume2 className="h-4 w-4 text-[#9a9a9a] group-hover:text-[#c45c3e] transition-colors" />
                </button>
              )}
            </div>

            {/* Part of speech pill */}
            {partOfSpeech && (
              <div className="mt-3">
                <span className="inline-block px-3 py-1 text-xs font-medium text-[#6b6b6b] bg-[#f3ede4] rounded-full">
                  {partOfSpeech}
                </span>
              </div>
            )}
          </div>

          {/* Translation - the hero section */}
          {(translation || definition) && (
            <div className="bg-gradient-to-br from-[#faf8f5] to-[#f3ede4] rounded-2xl p-5">
              <p className="text-[#1a1a1a] text-xl font-medium leading-relaxed">
                {translation || definition}
              </p>
            </div>
          )}

          {/* Not found state */}
          {!dictionaryResult.found && !translation && !definition && (
            <div className="text-center py-4">
              <p className="text-[#9a9a9a]">
                {dictionaryResult.message || "No dictionary entry found"}
              </p>
            </div>
          )}

          {/* Example */}
          {example && (
            <div className="relative pl-4">
              <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-[#c45c3e] to-[#c45c3e]/30 rounded-full" />
              <p className="text-[#4a4a4a] italic leading-relaxed">
                &ldquo;{example}&rdquo;
              </p>
            </div>
          )}

          {/* AI Explanation */}
          {explanation && (
            <div className="bg-[#faf8f5] rounded-xl p-4 border border-[#f3ede4]">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-3.5 w-3.5 text-[#c45c3e]" />
                <span className="text-xs font-medium text-[#9a9a9a] uppercase tracking-wide">
                  Note
                </span>
              </div>
              <p className="text-sm text-[#4a4a4a] leading-relaxed">
                {explanation}
              </p>
            </div>
          )}

          {/* Action buttons - extra bottom padding for iOS safe area */}
          <div className="flex gap-3 pt-2 pb-8">
            {!aiAnalysis && (
              <button
                onClick={handleAnalyzeWithAI}
                disabled={isLoadingAI}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl",
                  "text-sm font-medium transition-all duration-200",
                  "border border-[#e8dfd3] text-[#6b6b6b]",
                  "hover:border-[#c45c3e]/30 hover:text-[#c45c3e] hover:bg-[#c45c3e]/5",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                {isLoadingAI ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Analyzing...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>{dictionaryResult.found ? "More details" : "AI Analysis"}</span>
                  </>
                )}
              </button>
            )}

            <button
              onClick={() => handleSaveWord(!aiAnalysis)}
              disabled={isSaved || isSaving}
              className={cn(
                "flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl",
                "text-sm font-medium transition-all duration-200",
                aiAnalysis ? "flex-1" : "",
                isSaved
                  ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                  : "bg-[#c45c3e] text-white shadow-lg shadow-[#c45c3e]/20 hover:bg-[#b35537] active:scale-[0.98]",
                "disabled:opacity-70 disabled:cursor-not-allowed disabled:active:scale-100"
              )}
            >
              {isSaved ? (
                <>
                  <Check className="h-4 w-4" />
                  <span>Saved</span>
                </>
              ) : isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <BookmarkPlus className="h-4 w-4" />
                  <span>Save word</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
