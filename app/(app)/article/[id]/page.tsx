"use client";

import { useEffect, useState, use } from "react";
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
import { extractDomain } from "@/lib/utils";
import type { Article } from "@/lib/db/schema";

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

  useEffect(() => {
    fetchArticle();
  }, [resolvedParams.id]);

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

  const fetchArticle = async () => {
    try {
      const res = await fetch(`/api/articles/${resolvedParams.id}`);
      if (!res.ok) {
        throw new Error("Article not found");
      }
      const data = await res.json();
      setArticle(data);

      // Parse translated content
      try {
        const parsed = JSON.parse(data.translatedContent);
        setBlocks(Array.isArray(parsed) ? parsed : []);
      } catch {
        setBlocks([]);
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
  };

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
        prev ? { ...prev, audioUrl: "generated" } : null // Mark as having audio
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    );
  }

  if (!article) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-gray-500">Article not found</p>
        <Link href="/dashboard">
          <Button variant="outline">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      {/* Sticky Header */}
      <header className="sticky top-16 z-40 border-b border-white/10 bg-[#0c0f14]/95 backdrop-blur-sm">
        <div className="mx-auto max-w-4xl px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <Link href="/dashboard">
                <Button variant="ghost" size="icon" className="flex-shrink-0">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <h1 className="text-lg font-semibold text-white truncate">
                {article.title || "Untitled"}
              </h1>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleShare}
              >
                <Share2 className="h-4 w-4" />
              </Button>

              <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Trash2 className="h-4 w-4 text-red-400" />
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
      <article className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        {/* Meta info */}
        <div className="flex flex-wrap items-center gap-3 mb-8">
          <Badge>{article.targetLanguage} {article.cefrLevel}</Badge>
          <span className="text-sm text-gray-500">
            {article.wordCount || 0} words
          </span>
          <a
            href={article.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-amber-400 transition-colors"
          >
            {extractDomain(article.sourceUrl)}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        {/* Instructions */}
        <Card className="p-4 mb-8 bg-gradient-to-r from-amber-500/5 to-orange-500/5 border-amber-500/20">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-amber-400" />
            </div>
            <p className="text-sm text-gray-400">
              <strong className="text-white">Tip:</strong> Click any word to see its meaning. Hold{" "}
              <kbd className="px-1.5 py-0.5 text-xs bg-[#0c0f14] rounded border border-white/10">
                Cmd
              </kbd>{" "}
              (or long-press on mobile) to see the original text.
            </p>
          </div>
        </Card>

        {/* Content */}
        <TranslatedText
          blocks={blocks}
          targetLanguage={article.targetLanguage}
          articleId={article.id}
        />
      </article>

      {/* Audio Player / Generate Button */}
      <div className="fixed bottom-0 left-0 right-0 md:bottom-4 md:left-1/2 md:-translate-x-1/2 md:max-w-2xl z-50">
        {signedAudioUrl ? (
          <AudioPlayer audioUrl={signedAudioUrl} />
        ) : article.audioUrl ? (
          <div className="bg-[#12161d] border-t md:border border-white/10 md:rounded-2xl p-4 backdrop-blur-xl">
            <div className="flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
              <span className="ml-2 text-sm text-gray-500">Loading audio...</span>
            </div>
          </div>
        ) : (
          <div className="bg-[#12161d] border-t md:border border-white/10 md:rounded-2xl p-4 backdrop-blur-xl">
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
    </div>
  );
}
