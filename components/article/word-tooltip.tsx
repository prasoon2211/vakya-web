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
  phonetic?: string;
  audioUrl?: string;
  partOfSpeech?: string;
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

  const handleSaveWord = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/vocabulary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word,
          context_sentence: contextSentence,
          translation: aiAnalysis?.translation || dictionaryResult?.definition,
          part_of_speech: aiAnalysis?.pos || dictionaryResult?.partOfSpeech,
          article: aiAnalysis?.article,
          example: aiAnalysis?.example || dictionaryResult?.example,
          target_language: targetLanguage,
          source_article_id: articleId,
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
        description: "Added to your vocabulary",
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
    <div className="w-full max-w-sm">
      {/* Word header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h3 className="text-xl font-semibold text-white">{word}</h3>
          {dictionaryResult?.phonetic && (
            <p className="text-sm text-gray-500">{dictionaryResult.phonetic}</p>
          )}
        </div>
        {dictionaryResult?.audioUrl && (
          <button
            onClick={playAudio}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors"
          >
            <Volume2 className="h-4 w-4 text-gray-500" />
          </button>
        )}
      </div>

      {/* Loading state */}
      {isLoadingDict && (
        <div className="flex items-center gap-2 py-4">
          <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
          <span className="text-sm text-gray-500">Looking up...</span>
        </div>
      )}

      {/* Dictionary result */}
      {!isLoadingDict && dictionaryResult && !aiAnalysis && (
        <div className="space-y-3">
          {dictionaryResult.found ? (
            <>
              {dictionaryResult.partOfSpeech && (
                <Badge variant="secondary">{dictionaryResult.partOfSpeech}</Badge>
              )}
              {dictionaryResult.definition && (
                <p className="text-sm text-gray-400">
                  {dictionaryResult.definition}
                </p>
              )}
              {dictionaryResult.example && (
                <p className="text-sm text-gray-500 italic">
                  &ldquo;{dictionaryResult.example}&rdquo;
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-500">
              {dictionaryResult.message || "No dictionary entry found"}
            </p>
          )}

          <Button
            onClick={handleAnalyzeWithAI}
            disabled={isLoadingAI}
            variant="secondary"
            className="w-full"
          >
            {isLoadingAI ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Analyze with AI
              </>
            )}
          </Button>
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
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
              Translation
            </p>
            <p className="text-white">{aiAnalysis.translation}</p>
          </div>

          {/* Example */}
          {aiAnalysis.example && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                Example
              </p>
              <p className="text-sm text-gray-400 italic">
                {aiAnalysis.example}
              </p>
            </div>
          )}

          {/* Explanation */}
          {aiAnalysis.explanation && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                Notes
              </p>
              <p className="text-sm text-gray-500">
                {aiAnalysis.explanation}
              </p>
            </div>
          )}

          {/* Save button */}
          <Button
            onClick={handleSaveWord}
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
