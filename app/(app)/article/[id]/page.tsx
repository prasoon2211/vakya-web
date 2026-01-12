"use client";

import { useEffect, useState, use, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  Headphones,
  Trash2,
  Loader2,
  Share2,
  Sparkles,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import { TranslatedText } from "@/components/article/translated-text";
import { AudioPlayer } from "@/components/article/audio-player";
import { OriginalToggle } from "@/components/article/original-toggle";
import { ReadingMode } from "@/components/article/reading-mode";
import { extractDomain } from "@/lib/utils";
import type { Article } from "@/lib/db/schema";
import type { WordTimestamp } from "@/lib/audio/align-timestamps";

interface TranslationBlock {
  original: string;
  translated: string;
}

export default function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [article, setArticle] = useState<Article | null>(null);
  const [blocks, setBlocks] = useState<TranslationBlock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [signedAudioUrl, setSignedAudioUrl] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [audioTimestamps, setAudioTimestamps] = useState<WordTimestamp[] | null>(null);
  const [showReadingMode, setShowReadingMode] = useState(false);
  const [initialReadingWordIndex, setInitialReadingWordIndex] = useState(0);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  const fetchArticle = useCallback(async () => {
    try {
      const res = await fetch(`/api/articles/${resolvedParams.id}`);
      if (!res.ok) {
        throw new Error("Article not found");
      }
      const data = await res.json();
      setArticle(data);

      // Parse translated content if available
      if (data.translatedContent) {
        try {
          const parsed = JSON.parse(data.translatedContent);
          setBlocks(Array.isArray(parsed) ? parsed : []);
        } catch {
          setBlocks([]);
        }
      }

      // If translation is in progress, start polling
      if (data.status === "fetching" || data.status === "translating") {
        if (!pollingRef.current) {
          pollingRef.current = setInterval(async () => {
            const statusRes = await fetch(`/api/articles/${resolvedParams.id}/status`);
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              setArticle((prev) => prev ? { ...prev, ...statusData } : null);

              if (statusData.status === "completed" || statusData.status === "failed") {
                if (pollingRef.current) {
                  clearInterval(pollingRef.current);
                  pollingRef.current = null;
                }
                // Refetch full article to get content
                if (statusData.status === "completed") {
                  fetchArticle();
                }
              }
            }
          }, 2000);
        }
      } else if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load article",
        variant: "error",
      });
      router.push("/dashboard");
    } finally {
      setIsLoading(false);
    }
  }, [resolvedParams.id, router]);

  useEffect(() => {
    fetchArticle();
  }, [fetchArticle]);

  // Fetch signed audio URL when article has audio
  useEffect(() => {
    if (article?.audioUrl && !signedAudioUrl) {
      fetchSignedAudioUrl();
    }
  }, [article?.audioUrl]);

  const fetchSignedAudioUrl = async () => {
    try {
      const res = await fetch(`/api/articles/${resolvedParams.id}/audio`);
      if (res.ok) {
        const data = await res.json();
        setSignedAudioUrl(data.audioUrl);
      }
    } catch (error) {
      console.error("Failed to fetch audio URL:", error);
    }
  };

  const fetchTimestamps = async () => {
    try {
      const res = await fetch(`/api/articles/${resolvedParams.id}/timestamps`);
      if (res.ok) {
        const data = await res.json();
        setAudioTimestamps(data.timestamps);
      }
    } catch (error) {
      console.error("Failed to fetch timestamps:", error);
    }
  };

  // Fetch timestamps when audio URL is available
  useEffect(() => {
    if (signedAudioUrl && !audioTimestamps) {
      fetchTimestamps();
    }
  }, [signedAudioUrl]);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/articles/${resolvedParams.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete");
      }

      toast({
        title: "Article deleted",
        variant: "success",
      });
      router.push("/dashboard");
    } catch {
      toast({
        title: "Failed to delete article",
        variant: "error",
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const handleRetryTranslation = async () => {
    setIsRetrying(true);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: article?.sourceUrl,
          targetLanguage: article?.targetLanguage,
          cefrLevel: article?.cefrLevel,
        }),
      });

      if (res.ok) {
        toast({
          title: "Resuming translation...",
          description: "Progress will update automatically",
          variant: "success",
        });
        // Start polling immediately
        if (!pollingRef.current) {
          pollingRef.current = setInterval(async () => {
            const statusRes = await fetch(`/api/articles/${resolvedParams.id}/status`);
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              setArticle((prev) => prev ? { ...prev, ...statusData } : null);

              if (statusData.status === "completed" || statusData.status === "failed") {
                if (pollingRef.current) {
                  clearInterval(pollingRef.current);
                  pollingRef.current = null;
                }
                if (statusData.status === "completed") {
                  fetchArticle();
                }
              }
            }
          }, 1000);
        }
        // Update local state immediately
        setArticle((prev) => prev ? { ...prev, status: "translating", errorMessage: null } : null);
      } else {
        throw new Error("Failed to retry");
      }
    } catch {
      toast({
        title: "Failed to retry",
        variant: "error",
      });
    } finally {
      setIsRetrying(false);
    }
  };

  const handleGenerateAudio = async () => {
    setIsGeneratingAudio(true);
    try {
      const res = await fetch(`/api/articles/${resolvedParams.id}/audio`, {
        method: "POST",
      });

      if (!res.ok) {
        throw new Error("Failed to generate audio");
      }

      const data = await res.json();
      setSignedAudioUrl(data.audioUrl);
      setArticle((prev) =>
        prev ? { ...prev, audioUrl: "generated" } : null
      );

      toast({
        title: "Audio generated!",
        description: "You can now listen to the article",
        variant: "success",
      });
    } catch {
      toast({
        title: "Failed to generate audio",
        description: "Please try again",
        variant: "error",
      });
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: article?.title || "Vakya Article",
          url: window.location.href,
        });
      } catch {
        // User cancelled
      }
    } else {
      await navigator.clipboard.writeText(window.location.href);
      toast({
        title: "Link copied!",
        variant: "success",
      });
    }
  };

  const handleOpenReadingMode = () => {
    if (!audioTimestamps || audioTimestamps.length === 0) {
      setShowReadingMode(true);
      return;
    }

    // Calculate scroll position to find starting word
    const scrollWrapper = document.getElementById("app-scroll-wrapper");
    if (scrollWrapper) {
      const scrollPercent = scrollWrapper.scrollTop /
        Math.max(1, scrollWrapper.scrollHeight - scrollWrapper.clientHeight);

      // Find word at approximately this percentage through the article
      // Use a bit ahead of the scroll position (user is reading what's visible, not what's scrolled past)
      const adjustedPercent = Math.min(1, scrollPercent + 0.1); // Look 10% ahead
      const wordIndex = Math.floor(adjustedPercent * audioTimestamps.length);
      setInitialReadingWordIndex(Math.min(wordIndex, audioTimestamps.length - 1));
    } else {
      setInitialReadingWordIndex(0);
    }

    setShowReadingMode(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-[#c45c3e]" />
      </div>
    );
  }

  if (!article) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-[#6b6b6b]">Article not found</p>
        <Link href="/dashboard">
          <Button variant="outline">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  // Determine states
  const isTranslationInProgress = article.status === "fetching" || article.status === "translating";
  const isTranslationFailed = article.status === "failed";
  const hasContent = blocks.length > 0;

  // Check if this is original content (source = target, no translation happened)
  const isOriginalContent = article.sourceLanguage?.toLowerCase() === article.targetLanguage.toLowerCase();

  // If fetching with no content, show loading state
  if (article.status === "fetching" && !hasContent) {
    return (
      <div className="min-h-screen">
        {/* Header */}
        <header className="sticky top-16 z-40 border-b border-[#e8dfd3] bg-white/95 backdrop-blur-sm">
          <div className="mx-auto max-w-4xl px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <Link href="/dashboard">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <h1 className="text-lg font-semibold text-[#1a1a1a] truncate">
                {article.title || "Fetching article..."}
              </h1>
            </div>
          </div>
        </header>

        {/* Fetching State */}
        <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
          <Card className="p-8 text-center">
            <Loader2 className="h-12 w-12 animate-spin text-[#c45c3e] mx-auto mb-4" />
            <h2 className="font-serif text-xl font-semibold text-[#1a1a1a] mb-2">
              Fetching Article...
            </h2>
            <p className="text-[#6b6b6b] mb-4">
              Extracting content from the source URL
            </p>
            <p className="text-sm text-[#9a9a9a]">
              You can safely leave this page. Progress is saved automatically.
            </p>
          </Card>
        </div>
      </div>
    );
  }

  // If failed with no content, show error
  if (isTranslationFailed && !hasContent) {
    return (
      <div className="min-h-screen">
        {/* Header */}
        <header className="sticky top-16 z-40 border-b border-[#e8dfd3] bg-white/95 backdrop-blur-sm">
          <div className="mx-auto max-w-4xl px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <Link href="/dashboard">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <h1 className="text-lg font-semibold text-[#1a1a1a] truncate">
                {article.title || "Untitled"}
              </h1>
            </div>
          </div>
        </header>

        {/* Error State */}
        <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
          <Card className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-8 w-8 text-red-500" />
            </div>
            <h2 className="font-serif text-xl font-semibold text-[#1a1a1a] mb-2">
              Translation Failed
            </h2>
            <p className="text-[#6b6b6b] mb-6">
              {article.errorMessage || "Something went wrong. You can retry to continue from where it stopped."}
            </p>
            <Button onClick={handleRetryTranslation} disabled={isRetrying}>
              {isRetrying ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              {isRetrying ? "Retrying..." : "Retry Translation"}
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  // Calculate progress percentage for in-progress translations
  const progressPercent = article.totalParagraphs > 0
    ? Math.round((article.translationProgress / article.totalParagraphs) * 100)
    : 0;

  return (
    <div className="min-h-screen pb-24">
      {/* Progress Banner for in-progress or failed translations */}
      {(isTranslationInProgress || isTranslationFailed) && hasContent && (
        <div className={`sticky top-0 md:top-16 z-50 border-b ${isTranslationFailed ? 'bg-red-50 border-red-200' : 'bg-[#c45c3e]/5 border-[#c45c3e]/20'}`}>
          <div className="mx-auto max-w-4xl px-4 py-2 sm:px-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {isTranslationFailed ? (
                  <>
                    <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                    <span className="text-sm text-red-700 truncate">
                      Translation incomplete ({blocks.length}/{article.totalParagraphs || '?'} paragraphs)
                    </span>
                  </>
                ) : (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-[#c45c3e] flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-[#c45c3e] font-medium">
                          Translating... {progressPercent}%
                        </span>
                        <span className="text-xs text-[#9a9a9a]">
                          ({article.translationProgress}/{article.totalParagraphs} paragraphs)
                        </span>
                      </div>
                      <div className="w-full h-1 bg-[#e8dfd3] rounded-full overflow-hidden mt-1">
                        <div
                          className="h-full bg-[#c45c3e] rounded-full transition-all duration-500"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
              {isTranslationFailed && (
                <Button size="sm" onClick={handleRetryTranslation} disabled={isRetrying}>
                  {isRetrying ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3 mr-1" />
                  )}
                  {isRetrying ? "Retrying..." : "Continue"}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sticky Header - top-0 on mobile (main header hidden), top-16 on desktop */}
      <header className={`sticky ${(isTranslationInProgress || isTranslationFailed) && hasContent ? 'top-0 md:top-[104px]' : 'top-0 md:top-16'} z-40 border-b border-[#e8dfd3] bg-white/95 backdrop-blur-sm`}>
        <div className="mx-auto max-w-4xl px-3 py-2 sm:px-6 sm:py-3">
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <Link href="/dashboard">
                <Button variant="ghost" size="icon" className="flex-shrink-0 h-8 w-8 sm:h-10 sm:w-10">
                  <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
              </Link>
              <h1 className="text-base sm:text-lg font-semibold text-[#1a1a1a] truncate">
                {article.title || "Untitled"}
              </h1>
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleShare}
                className="h-8 w-8 sm:h-10 sm:w-10"
              >
                <Share2 className="h-4 w-4" />
              </Button>

              <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-10 sm:w-10">
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete Article</DialogTitle>
                    <DialogDescription>
                      Are you sure you want to delete this article? This action cannot be undone.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setShowDeleteDialog(false)}
                    >
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
          </div>
        </div>
      </header>

      {/* Article Content */}
      <article className="mx-auto max-w-3xl px-4 py-4 sm:py-8 sm:px-6">
        {/* Meta info */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4 sm:mb-8">
          <Badge>{article.targetLanguage} {article.cefrLevel}</Badge>
          {article.status === "completed" && (
            <span className="text-sm text-[#6b6b6b]">
              {article.wordCount || 0} words
            </span>
          )}
          <a
            href={article.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-[#6b6b6b] hover:text-[#c45c3e] transition-colors"
          >
            {extractDomain(article.sourceUrl)}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        {/* Instructions - hidden on mobile to save space */}
        <Card className="hidden md:block p-4 mb-8 bg-gradient-to-r from-[#c45c3e]/5 to-[#2d5a47]/5 border-[#c45c3e]/20">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-[#c45c3e]/10 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-[#c45c3e]" />
            </div>
            <p className="text-sm text-[#6b6b6b]">
              <strong className="text-[#1a1a1a]">Tip:</strong> Tap any word to see its meaning.
              {!isOriginalContent && (
                <>
                  {" "}Hold{" "}
                  <kbd className="px-1.5 py-0.5 text-xs bg-[#f3ede4] rounded border border-[#e8dfd3]">
                    Cmd
                  </kbd>{" "}
                  to see the original text.
                </>
              )}
            </p>
          </div>
        </Card>

        {/* Content */}
        {hasContent ? (
          <TranslatedText
            blocks={blocks}
            targetLanguage={article.targetLanguage}
            articleId={article.id}
            showOriginal={showOriginal}
            isOriginalContent={isOriginalContent}
          />
        ) : (
          <div className="text-center py-12">
            <p className="text-[#6b6b6b]">No content available yet.</p>
          </div>
        )}
      </article>

      {/* Mobile: Floating toggle for original text - hide when source = target */}
      {hasContent && !isOriginalContent && (
        <OriginalToggle
          showOriginal={showOriginal}
          onToggle={() => setShowOriginal(!showOriginal)}
          hasAudioPlayer={!!signedAudioUrl}
        />
      )}

      {/* Audio Player / Generate Button - only show when translation is complete */}
      {article.status === "completed" && (
        <div className="fixed bottom-0 left-0 right-0 md:bottom-4 md:left-1/2 md:-translate-x-1/2 md:max-w-2xl z-50">
          {signedAudioUrl ? (
            <AudioPlayer
              audioUrl={signedAudioUrl}
              hasTimestamps={!!audioTimestamps && audioTimestamps.length > 0}
              onReadingModeClick={handleOpenReadingMode}
            />
          ) : article.audioUrl ? (
            <div className="bg-white border-t md:border border-[#e8dfd3] md:rounded-2xl p-4 backdrop-blur-xl">
              <div className="flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-[#c45c3e]" />
                <span className="ml-2 text-sm text-[#6b6b6b]">Loading audio...</span>
              </div>
            </div>
          ) : (
            <div className="bg-white border-t md:border border-[#e8dfd3] md:rounded-2xl p-4 backdrop-blur-xl">
              <Button
                onClick={handleGenerateAudio}
                disabled={isGeneratingAudio}
                className="w-full"
                loading={isGeneratingAudio}
              >
                {isGeneratingAudio ? (
                  "Generating audio..."
                ) : (
                  <>
                    <Headphones className="h-4 w-4 mr-2" />
                    Generate Audio
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Reading Mode Overlay */}
      {showReadingMode && signedAudioUrl && audioTimestamps && audioTimestamps.length > 0 && (
        <ReadingMode
          audioUrl={signedAudioUrl}
          timestamps={audioTimestamps}
          targetLanguage={article.targetLanguage}
          articleId={article.id}
          onClose={() => setShowReadingMode(false)}
          initialWordIndex={initialReadingWordIndex}
        />
      )}
    </div>
  );
}
