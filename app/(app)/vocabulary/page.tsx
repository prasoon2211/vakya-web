"use client";

import { useState, useEffect } from "react";
import {
  Search,
  BookOpen,
  RotateCcw,
  Trophy,
  Trash2,
  Loader2,
  ChevronRight,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import type { SavedWord } from "@/lib/db/schema";

export default function VocabularyPage() {
  const [words, setWords] = useState<SavedWord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedWord, setSelectedWord] = useState<SavedWord | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showReviewMode, setShowReviewMode] = useState(false);
  const [reviewWords, setReviewWords] = useState<SavedWord[]>([]);
  const [currentReviewIndex, setCurrentReviewIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  useEffect(() => {
    fetchWords();
  }, [filter, search]);

  const fetchWords = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("filter", filter);
      if (search) params.set("search", search);

      const res = await fetch(`/api/vocabulary?${params}`);
      if (res.ok) {
        const data = await res.json();
        setWords(data.words || []);
      }
    } catch (error) {
      console.error("Failed to fetch vocabulary:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedWord) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/vocabulary/${selectedWord.id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setWords((prev) => prev.filter((w) => w.id !== selectedWord.id));
        toast({ title: "Word deleted", variant: "success" });
      }
    } catch {
      toast({ title: "Failed to delete word", variant: "error" });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
      setSelectedWord(null);
    }
  };

  const startReview = () => {
    const dueWords = words.filter((w) => {
      if (w.masteryLevel >= 5) return false;
      if (!w.nextReviewAt) return true;
      return new Date(w.nextReviewAt) <= new Date();
    });

    if (dueWords.length === 0) {
      toast({
        title: "No words to review",
        description: "Check back later or add more words",
      });
      return;
    }

    // Shuffle words
    const shuffled = [...dueWords].sort(() => Math.random() - 0.5);
    setReviewWords(shuffled);
    setCurrentReviewIndex(0);
    setShowAnswer(false);
    setShowReviewMode(true);
  };

  const submitReview = async (rating: number) => {
    const currentWord = reviewWords[currentReviewIndex];
    if (!currentWord) return;

    setIsSubmittingReview(true);
    try {
      const res = await fetch("/api/vocabulary/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wordId: currentWord.id,
          rating,
        }),
      });

      if (res.ok) {
        // Move to next word
        if (currentReviewIndex < reviewWords.length - 1) {
          setCurrentReviewIndex((prev) => prev + 1);
          setShowAnswer(false);
        } else {
          // Review complete
          setShowReviewMode(false);
          toast({
            title: "Review complete!",
            description: `You reviewed ${reviewWords.length} words`,
            variant: "success",
          });
          fetchWords();
        }
      }
    } catch {
      toast({ title: "Failed to submit review", variant: "error" });
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const getMasteryBadge = (level: number) => {
    if (level === 0) return { variant: "secondary" as const, label: "New" };
    if (level < 3) return { variant: "warning" as const, label: "Learning" };
    if (level < 5) return { variant: "default" as const, label: "Familiar" };
    return { variant: "success" as const, label: "Mastered" };
  };

  // Review Mode UI
  if (showReviewMode && reviewWords.length > 0) {
    const currentWord = reviewWords[currentReviewIndex];
    const mastery = getMasteryBadge(currentWord.masteryLevel);

    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        {/* Progress */}
        <div className="flex items-center justify-between mb-8">
          <Button
            variant="ghost"
            onClick={() => setShowReviewMode(false)}
          >
            <X className="h-4 w-4 mr-2" />
            Exit Review
          </Button>
          <span className="text-sm text-[#6b6b6b]">
            {currentReviewIndex + 1} / {reviewWords.length}
          </span>
        </div>

        {/* Flashcard */}
        <Card className="p-8 text-center">
          <Badge variant={mastery.variant} className="mb-4">
            {mastery.label}
          </Badge>

          <h2 className="font-serif text-3xl font-bold text-[#1a1a1a] mb-2">{currentWord.word}</h2>
          {currentWord.article && (
            <p className="text-lg text-[#c45c3e] mb-4">{currentWord.article}</p>
          )}

          {currentWord.contextSentence && (
            <p className="text-sm text-[#6b6b6b] italic mb-6">
              &ldquo;{currentWord.contextSentence}&rdquo;
            </p>
          )}

          {!showAnswer ? (
            <Button onClick={() => setShowAnswer(true)} className="mt-4">
              Show Answer
            </Button>
          ) : (
            <div className="space-y-6 mt-6 pt-6 border-t border-[#e8dfd3]">
              <div>
                <p className="text-sm text-[#9a9a9a] uppercase tracking-wide mb-1">
                  Translation
                </p>
                <p className="text-xl font-semibold text-[#1a1a1a]">{currentWord.translation || "No translation"}</p>
              </div>

              {currentWord.example && (
                <div>
                  <p className="text-sm text-[#9a9a9a] uppercase tracking-wide mb-1">
                    Example
                  </p>
                  <p className="text-[#6b6b6b] italic">
                    {currentWord.example}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-2 justify-center pt-4">
                <Button
                  variant="outline"
                  onClick={() => submitReview(0)}
                  disabled={isSubmittingReview}
                  className="flex-1 min-w-[80px]"
                >
                  Again
                </Button>
                <Button
                  variant="outline"
                  onClick={() => submitReview(1)}
                  disabled={isSubmittingReview}
                  className="flex-1 min-w-[80px]"
                >
                  Hard
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => submitReview(2)}
                  disabled={isSubmittingReview}
                  className="flex-1 min-w-[80px]"
                >
                  Good
                </Button>
                <Button
                  onClick={() => submitReview(3)}
                  disabled={isSubmittingReview}
                  className="flex-1 min-w-[80px]"
                >
                  Easy
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-[#2d5a47]/10 flex items-center justify-center">
            <BookOpen className="h-5 w-5 text-[#2d5a47]" />
          </div>
          <div>
            <h1 className="font-serif text-2xl font-bold text-[#1a1a1a]">Vocabulary</h1>
            <p className="text-[#6b6b6b]">
              {words.length} word{words.length !== 1 ? "s" : ""} saved
            </p>
          </div>
        </div>
        <Button onClick={startReview}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Start Review
        </Button>
      </div>

      {/* Search & Filter */}
      <div className="mb-6 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9a9a9a]" />
          <Input
            placeholder="Search words..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            <TabsTrigger value="all">
              <BookOpen className="h-4 w-4 mr-2" />
              All
            </TabsTrigger>
            <TabsTrigger value="review">
              <RotateCcw className="h-4 w-4 mr-2" />
              Due
            </TabsTrigger>
            <TabsTrigger value="mastered">
              <Trophy className="h-4 w-4 mr-2" />
              Mastered
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Word List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[#c45c3e]" />
        </div>
      ) : words.length === 0 ? (
        <Card className="p-8 text-center border-dashed border-2 bg-[#faf7f2]">
          <BookOpen className="h-12 w-12 mx-auto text-[#9a9a9a] opacity-50 mb-4" />
          <p className="text-[#6b6b6b]">
            {search
              ? "No words found matching your search"
              : filter === "review"
                ? "No words due for review. Great job!"
                : filter === "mastered"
                  ? "No mastered words yet. Keep learning!"
                  : "No saved words yet. Click on words while reading to save them!"}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {words.map((word) => {
            const mastery = getMasteryBadge(word.masteryLevel);
            return (
              <Card
                key={word.id}
                className="p-4 cursor-pointer"
                onClick={() => setSelectedWord(word)}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {word.article && (
                        <span className="text-[#c45c3e] text-sm font-medium">
                          {word.article}
                        </span>
                      )}
                      <span className="font-semibold text-[#1a1a1a] truncate">{word.word}</span>
                      {word.partOfSpeech && (
                        <Badge variant="outline" className="text-xs">
                          {word.partOfSpeech}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-[#6b6b6b] truncate">
                      {word.translation || "No translation"}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <Badge variant={mastery.variant}>{mastery.label}</Badge>
                    <ChevronRight className="h-4 w-4 text-[#9a9a9a]" />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Word Detail Dialog */}
      <Dialog open={!!selectedWord && !showDeleteDialog} onOpenChange={(open) => !open && setSelectedWord(null)}>
        {selectedWord && (
          <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedWord.article && (
                  <span className="text-[#c45c3e]">{selectedWord.article}</span>
                )}
                {selectedWord.word}
              </DialogTitle>
              {selectedWord.partOfSpeech && (
                <DialogDescription>{selectedWord.partOfSpeech}</DialogDescription>
              )}
            </DialogHeader>

            <div className="space-y-4 py-4 overflow-hidden">
              {selectedWord.translation && (
                <div>
                  <p className="text-xs text-[#9a9a9a] uppercase tracking-wide mb-1">
                    Translation
                  </p>
                  <p className="text-[#1a1a1a] break-words">{selectedWord.translation}</p>
                </div>
              )}

              {selectedWord.example && (
                <div>
                  <p className="text-xs text-[#9a9a9a] uppercase tracking-wide mb-1">
                    Example
                  </p>
                  <p className="text-[#6b6b6b] italic break-words">{selectedWord.example}</p>
                </div>
              )}

              {selectedWord.contextSentence && (
                <div>
                  <p className="text-xs text-[#9a9a9a] uppercase tracking-wide mb-1">
                    Context
                  </p>
                  <p className="text-[#6b6b6b] italic break-words line-clamp-4">
                    &ldquo;{selectedWord.contextSentence}&rdquo;
                  </p>
                </div>
              )}

              {selectedWord.notes && (
                <div>
                  <p className="text-xs text-[#9a9a9a] uppercase tracking-wide mb-1">
                    Notes
                  </p>
                  <p className="text-[#6b6b6b] break-words">{selectedWord.notes}</p>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <Badge variant={getMasteryBadge(selectedWord.masteryLevel).variant}>
                  {getMasteryBadge(selectedWord.masteryLevel).label}
                </Badge>
                <span className="text-xs text-[#9a9a9a]">
                  Level {selectedWord.masteryLevel}/5
                </span>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="destructive"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Word</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{selectedWord?.word}&rdquo;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              loading={isDeleting}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
