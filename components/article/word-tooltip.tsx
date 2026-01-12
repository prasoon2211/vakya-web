"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Sparkles, BookmarkPlus, Check, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";

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

  // Fetch dictionary result on mount
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
          fetchAIDetails: fetchDetails && !aiAnalysis, // Request AI analysis if we don't have it yet
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

  return (
    <div className="w-full max-w-sm min-h-[180px]">
      {/* Word header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h3 className="text-xl font-semibold text-[#1a1a1a]">{word}</h3>
          {dictionaryResult?.phonetic && (
            <p className="text-sm text-[#6b6b6b]">{dictionaryResult.phonetic}</p>
          )}
        </div>
        {dictionaryResult?.audioUrl && (
          <button
            onClick={playAudio}
            className="p-2 rounded-lg hover:bg-[#f3ede4] transition-colors"
          >
            <Volume2 className="h-4 w-4 text-[#6b6b6b]" />
          </button>
        )}
      </div>

      {/* Loading state */}
      {isLoadingDict && (
        <div className="flex items-center gap-2 py-4">
          <Loader2 className="h-4 w-4 animate-spin text-[#6b6b6b]" />
          <span className="text-sm text-[#6b6b6b]">Looking up...</span>
        </div>
      )}

      {/* Dictionary result */}
      {!isLoadingDict && dictionaryResult && !aiAnalysis && (
        <div className="space-y-3">
          {dictionaryResult.found ? (
            <>
              {/* Badges for article, POS, gender */}
              <div className="flex flex-wrap gap-2">
                {dictionaryResult.article && (
                  <Badge variant="default">{dictionaryResult.article}</Badge>
                )}
                {dictionaryResult.partOfSpeech && (
                  <Badge variant="secondary">{dictionaryResult.partOfSpeech}</Badge>
                )}
                {dictionaryResult.gender && (
                  <Badge variant="outline">{dictionaryResult.gender}</Badge>
                )}
              </div>
              {/* Translation from local dictionary */}
              {dictionaryResult.translation && (
                <div>
                  <p className="text-xs text-[#9a9a9a] uppercase tracking-wide mb-1">
                    Translation
                  </p>
                  <p className="text-[#1a1a1a] font-medium text-lg">{dictionaryResult.translation}</p>
                </div>
              )}
              {/* Fallback to definition if no translation */}
              {!dictionaryResult.translation && dictionaryResult.definition && (
                <p className="text-sm text-[#4a4a4a]">
                  {dictionaryResult.definition}
                </p>
              )}
              {dictionaryResult.example && (
                <p className="text-sm text-[#6b6b6b] italic">
                  &ldquo;{dictionaryResult.example}&rdquo;
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-[#6b6b6b]">
              {dictionaryResult.message || "No dictionary entry found"}
            </p>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            <Button
              onClick={handleAnalyzeWithAI}
              disabled={isLoadingAI}
              variant="secondary"
              className="flex-1"
            >
              {isLoadingAI ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  {dictionaryResult.found ? "Details" : "Analyze"}
                </>
              )}
            </Button>
            <Button
              onClick={() => handleSaveWord(true)}
              disabled={isSaved || isSaving}
              className="flex-1"
            >
              {isSaved ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Saved
                </>
              ) : isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                <>
                  <BookmarkPlus className="h-4 w-4 mr-2" />
                  Save
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* AI Analysis result */}
      {aiAnalysis && (
        <div className="space-y-3">
          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            {aiAnalysis.article && (
              <Badge variant="default">{aiAnalysis.article}</Badge>
            )}
            {aiAnalysis.pos && (
              <Badge variant="secondary">{aiAnalysis.pos}</Badge>
            )}
            {aiAnalysis.gender && (
              <Badge variant="outline">{aiAnalysis.gender}</Badge>
            )}
          </div>

          {/* Translation */}
          <div>
            <p className="text-xs text-[#9a9a9a] uppercase tracking-wide mb-1">
              Translation
            </p>
            <p className="text-[#1a1a1a] font-medium text-lg">{aiAnalysis.translation}</p>
          </div>

          {/* Example */}
          {aiAnalysis.example && (
            <div>
              <p className="text-xs text-[#9a9a9a] uppercase tracking-wide mb-1">
                Example
              </p>
              <p className="text-sm text-[#4a4a4a] italic">
                {aiAnalysis.example}
              </p>
            </div>
          )}

          {/* Explanation */}
          {aiAnalysis.explanation && (
            <div>
              <p className="text-xs text-[#9a9a9a] uppercase tracking-wide mb-1">
                Notes
              </p>
              <p className="text-sm text-[#4a4a4a]">
                {aiAnalysis.explanation}
              </p>
            </div>
          )}

          {/* Save button */}
          <Button
            onClick={() => handleSaveWord(false)}
            disabled={isSaved || isSaving}
            className="w-full"
          >
            {isSaved ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                Saved
              </>
            ) : isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              <>
                <BookmarkPlus className="h-4 w-4 mr-2" />
                Save to Vocabulary
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
