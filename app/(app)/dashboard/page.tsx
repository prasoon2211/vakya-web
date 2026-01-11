"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Globe, Headphones, Clock, Loader2, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { LANGUAGES, CEFR_LEVELS, type Article } from "@/lib/db/schema";
import { formatRelativeTime, extractDomain } from "@/lib/utils";

export default function DashboardPage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("German");
  const [cefrLevel, setCefrLevel] = useState("B1");
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationStep, setTranslationStep] = useState("");
  const [articles, setArticles] = useState<Article[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchArticles();
    fetchUserSettings();
  }, []);

  const fetchUserSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        if (data.targetLanguage) setTargetLanguage(data.targetLanguage);
        if (data.cefrLevel) setCefrLevel(data.cefrLevel);
      }
    } catch {
      // Use defaults
    }
  };

  const fetchArticles = async () => {
    try {
      const res = await fetch("/api/articles");
      if (res.ok) {
        const data = await res.json();
        setArticles(data.articles || []);
      }
    } catch (error) {
      console.error("Failed to fetch articles:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTranslate = async () => {
    if (!url.trim()) {
      toast({ title: "Please enter a URL", variant: "error" });
      return;
    }

    try {
      new URL(url);
    } catch {
      toast({ title: "Please enter a valid URL", variant: "error" });
      return;
    }

    setIsTranslating(true);
    setTranslationStep("Fetching article...");

    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          targetLanguage,
          cefrLevel,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Translation failed");
      }

      setTranslationStep("Processing translation...");
      const data = await res.json();

      toast({
        title: "Article translated!",
        description: "Redirecting to your article...",
        variant: "success",
      });

      router.push(`/article/${data.articleId}`);
    } catch (error) {
      toast({
        title: "Translation failed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "error",
      });
    } finally {
      setIsTranslating(false);
      setTranslationStep("");
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Quick Translate Section */}
      <section className="mb-12">
        <div className="relative rounded-2xl border border-white/10 bg-gradient-to-b from-[#12161d] to-[#0c0f14] p-8 overflow-hidden">
          {/* Decorative corner */}
          <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-amber-500/5 to-transparent rounded-bl-full pointer-events-none" />

          <div className="relative">
            <h2 className="font-serif text-2xl font-bold text-white mb-2 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <Globe className="w-5 h-5 text-amber-400" />
              </div>
              Translate an Article
            </h2>
            <p className="text-gray-400 mb-6">
              Paste any article URL and transform it into a personalized lesson
            </p>

            <div className="space-y-4">
              <Input
                placeholder="Paste an article URL..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={isTranslating}
                className="h-14 text-base"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Target Language
                  </label>
                  <Select value={targetLanguage} onValueChange={setTargetLanguage} disabled={isTranslating}>
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder="Select language" />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((lang) => (
                        <SelectItem key={lang} value={lang}>
                          {lang}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Proficiency Level
                  </label>
                  <Select value={cefrLevel} onValueChange={setCefrLevel} disabled={isTranslating}>
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder="Select level" />
                    </SelectTrigger>
                    <SelectContent>
                      {CEFR_LEVELS.map((level) => (
                        <SelectItem key={level.value} value={level.value}>
                          {level.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                onClick={handleTranslate}
                disabled={isTranslating || !url.trim()}
                className="w-full h-14 text-base"
                loading={isTranslating}
              >
                {isTranslating ? (
                  translationStep
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Translate Article
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Article History Section */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-serif text-2xl font-bold text-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-400" />
            </div>
            Your Articles
          </h2>
          {articles.length > 0 && (
            <span className="text-sm text-gray-500">
              {articles.length} article{articles.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
          </div>
        ) : articles.length === 0 ? (
          <Card className="p-12 text-center border-dashed">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
              <Globe className="w-8 h-8 text-amber-400" />
            </div>
            <h3 className="font-serif text-xl font-semibold text-white mb-2">No articles yet</h3>
            <p className="text-gray-500 mb-6 max-w-sm mx-auto">
              Translate your first article to start learning. Just paste a URL above.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {articles.map((article) => (
              <Link key={article.id} href={`/article/${article.id}`}>
                <Card className="p-5 h-full cursor-pointer group hover:border-amber-500/30">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <h3 className="font-medium text-white group-hover:text-amber-400 transition-colors line-clamp-2">
                      {article.title || "Untitled Article"}
                    </h3>
                    <ArrowRight className="w-4 h-4 flex-shrink-0 text-gray-500 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all" />
                  </div>

                  <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                    <span className="truncate">{extractDomain(article.sourceUrl)}</span>
                    <span className="flex-shrink-0">·</span>
                    <span className="flex-shrink-0">{article.wordCount || 0} words</span>
                    {article.audioUrl && (
                      <>
                        <span className="flex-shrink-0">·</span>
                        <Headphones className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
                      </>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <Badge>
                      {article.targetLanguage} {article.cefrLevel}
                    </Badge>
                    <span className="text-xs text-gray-500">
                      {formatRelativeTime(article.createdAt)}
                    </span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
