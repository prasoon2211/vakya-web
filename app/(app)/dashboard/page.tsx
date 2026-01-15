"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Globe, Headphones, Loader2, Sparkles, BookOpen, ExternalLink, RefreshCw, AlertCircle, Trash2, MoreVertical, FileText, Upload, Link2, Type } from "lucide-react";
import { DashboardOnboarding } from "@/components/onboarding/dashboard-onboarding";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/use-toast";
import { LANGUAGES, CEFR_LEVELS, type Article } from "@/lib/db/schema";
import { formatRelativeTime, extractDomain } from "@/lib/utils";
import { cn } from "@/lib/utils";

type InputTab = "url" | "text" | "pdf";
type ArticleStatus = "queued" | "fetching" | "extracting" | "detecting" | "translating" | "completed" | "failed";
type TranslationStatus = "idle" | ArticleStatus;

interface TranslationState {
  status: TranslationStatus;
  articleId?: string;
  progress?: number;
  total?: number;
  error?: string;
  errorCode?: string;
  isRetryable?: boolean;
  title?: string;
}

// Status configuration for display
const STATUS_CONFIG: Record<ArticleStatus, { icon: React.ReactNode; color: string; label: string; bgColor: string }> = {
  queued: { icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />, color: "text-gray-500", label: "Queued", bgColor: "bg-gray-100" },
  fetching: { icon: <Globe className="w-3.5 h-3.5 animate-pulse" />, color: "text-blue-500", label: "Fetching...", bgColor: "bg-blue-50" },
  extracting: { icon: <FileText className="w-3.5 h-3.5 animate-pulse" />, color: "text-blue-500", label: "Extracting...", bgColor: "bg-blue-50" },
  detecting: { icon: <Sparkles className="w-3.5 h-3.5 animate-pulse" />, color: "text-purple-500", label: "Detecting...", bgColor: "bg-purple-50" },
  translating: { icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />, color: "text-yellow-600", label: "Translating...", bgColor: "bg-yellow-50" },
  completed: { icon: <BookOpen className="w-3.5 h-3.5" />, color: "text-green-600", label: "Ready", bgColor: "bg-green-50" },
  failed: { icon: <AlertCircle className="w-3.5 h-3.5" />, color: "text-red-500", label: "Failed", bgColor: "bg-red-50" },
};

export default function DashboardPage() {
  const router = useRouter();
  // Tab state
  const [activeTab, setActiveTab] = useState<InputTab>("url");
  // URL input
  const [url, setUrl] = useState("");
  // Text input
  const [textTitle, setTextTitle] = useState("");
  const [textContent, setTextContent] = useState("");
  // PDF input
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfTitle, setPdfTitle] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Common settings
  const [targetLanguage, setTargetLanguage] = useState("German");
  const [cefrLevel, setCefrLevel] = useState("B1");
  const [translationState, setTranslationState] = useState<TranslationState>({ status: "idle" });
  const [articles, setArticles] = useState<Article[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const articlesPollingRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (articlesPollingRef.current) {
        clearInterval(articlesPollingRef.current);
      }
    };
  }, []);

  useEffect(() => {
    fetchArticles();
    fetchUserSettings();
    checkOnboardingStatus();
  }, []);

  const checkOnboardingStatus = async () => {
    try {
      const res = await fetch("/api/onboarding");
      if (res.ok) {
        const data = await res.json();
        if (!data.dashboardCompleted) {
          setShowOnboarding(true);
        }
      }
    } catch {
      // Ignore errors, just don't show onboarding
    }
  };

  const handleOnboardingComplete = async () => {
    setShowOnboarding(false);
    try {
      await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "dashboard" }),
      });
    } catch {
      // Ignore errors
    }
  };

  // Poll for status updates on all processing articles
  useEffect(() => {
    const processingArticles = articles.filter(
      (a) => !["completed", "failed"].includes(a.status)
    );

    if (processingArticles.length === 0) {
      if (articlesPollingRef.current) {
        clearInterval(articlesPollingRef.current);
        articlesPollingRef.current = null;
      }
      return;
    }

    // Start polling if we have processing articles
    const pollProcessingArticles = async () => {
      const updates = await Promise.all(
        processingArticles.map(async (article) => {
          try {
            const res = await fetch(`/api/articles/${article.id}/status`);
            if (!res.ok) return null;
            const data = await res.json();
            return { id: article.id, ...data };
          } catch {
            return null;
          }
        })
      );

      // Update articles with new status
      setArticles((prev) =>
        prev.map((article) => {
          const update = updates.find((u) => u?.id === article.id);
          if (!update) return article;
          return {
            ...article,
            status: update.status,
            title: update.title || article.title,
            translationProgress: update.progress?.current ?? article.translationProgress,
            totalParagraphs: update.progress?.total ?? article.totalParagraphs,
            errorMessage: update.error?.message,
            errorCode: update.error?.code,
          };
        })
      );
    };

    // Poll immediately, then every 1.5 seconds
    pollProcessingArticles();
    articlesPollingRef.current = setInterval(pollProcessingArticles, 1500);

    return () => {
      if (articlesPollingRef.current) {
        clearInterval(articlesPollingRef.current);
        articlesPollingRef.current = null;
      }
    };
  }, [articles.map(a => `${a.id}-${a.status}`).join(",")]);

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

  // Reset error state when switching tabs
  const handleTabChange = (tab: InputTab) => {
    if (tab !== activeTab) {
      // Clear any error state when switching tabs
      if (translationState.status === "failed") {
        setTranslationState({ status: "idle" });
      }
      setActiveTab(tab);
    }
  };

  const handleTranslate = async () => {
    // Validate based on active tab
    if (activeTab === "url") {
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
    } else if (activeTab === "text") {
      if (!textTitle.trim()) {
        toast({ title: "Please enter a title", variant: "error" });
        return;
      }
      if (!textContent.trim() || textContent.trim().length < 50) {
        toast({ title: "Please enter at least 50 characters of text", variant: "error" });
        return;
      }
    } else if (activeTab === "pdf") {
      if (!pdfFile) {
        toast({ title: "Please select a PDF file", variant: "error" });
        return;
      }
    }

    // Show brief loading state while submitting
    setTranslationState({ status: "queued" });

    try {
      let res: Response;

      if (activeTab === "url") {
        res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "url",
            url: url.trim(),
            targetLanguage,
            cefrLevel,
          }),
        });
      } else if (activeTab === "text") {
        res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "text",
            text: textContent.trim(),
            title: textTitle.trim(),
            targetLanguage,
            cefrLevel,
          }),
        });
      } else {
        // PDF upload
        const formData = new FormData();
        formData.append("file", pdfFile!);
        formData.append("targetLanguage", targetLanguage);
        formData.append("cefrLevel", cefrLevel);
        if (pdfTitle.trim()) {
          formData.append("title", pdfTitle.trim());
        }

        res = await fetch("/api/translate/pdf", {
          method: "POST",
          body: formData,
        });
      }

      const data = await res.json();

      if (!res.ok) {
        setTranslationState({
          status: "failed",
          articleId: data.articleId,
          error: data.error || "Translation failed",
        });
        return;
      }

      if (data.status === "completed") {
        toast({
          title: "Article translated!",
          description: "Redirecting to your article...",
          variant: "success",
        });
        router.push(`/article/${data.articleId}`);
        return;
      }

      // Article queued successfully - clear form and reset state
      // The article card will show the status via polling
      toast({
        title: "Article queued!",
        description: "Processing will continue in the background.",
        variant: "success",
      });

      // Clear form based on active tab
      if (activeTab === "url") {
        setUrl("");
      } else if (activeTab === "text") {
        setTextTitle("");
        setTextContent("");
      } else if (activeTab === "pdf") {
        setPdfFile(null);
        setPdfTitle("");
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }

      // Reset to idle - status is now shown in article card
      setTranslationState({ status: "idle" });

      // Refresh article list to show the new article immediately
      fetchArticles();

    } catch (error) {
      setTranslationState({
        status: "failed",
        error: error instanceof Error ? error.message : "Translation failed",
      });
    }
  };

  // PDF drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file && file.type === "application/pdf") {
      setPdfFile(file);
    } else {
      toast({ title: "Please drop a PDF file", variant: "error" });
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPdfFile(file);
    }
  };

  const clearPdfFile = () => {
    setPdfFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRetry = () => {
    setTranslationState({ status: "idle" });
    handleTranslate();
  };

  const handleCancel = () => {
    setTranslationState({ status: "idle" });
  };

  const handleDeleteArticle = async (articleId: string, e: React.MouseEvent) => {
    e.preventDefault(); // Prevent navigation
    e.stopPropagation();

    try {
      const res = await fetch(`/api/articles/${articleId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setArticles(prev => prev.filter(a => a.id !== articleId));
        toast({
          title: "Article deleted",
          variant: "success",
        });
      } else {
        toast({
          title: "Failed to delete article",
          variant: "error",
        });
      }
    } catch (error) {
      console.error("Delete error:", error);
      toast({
        title: "Failed to delete article",
        variant: "error",
      });
    }
  };

  const getStatusMessage = () => {
    switch (translationState.status) {
      case "queued":
        if (activeTab === "pdf") return "Uploading PDF...";
        if (activeTab === "text") return "Submitting...";
        return "Submitting...";
      case "failed":
        return translationState.error || "Submission failed";
      default:
        return "";
    }
  };

  const getStatusSubMessage = () => {
    if (translationState.status === "queued") {
      return "Your article will appear below shortly";
    }
    return null;
  };

  // Check if current tab input is valid
  const isInputValid = () => {
    if (activeTab === "url") return url.trim().length > 0;
    if (activeTab === "text") return textTitle.trim().length > 0 && textContent.trim().length >= 50;
    if (activeTab === "pdf") return pdfFile !== null;
    return false;
  };

  const isSubmitting = translationState.status === "queued";

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      {/* Quick Translate Section - Mobile: Clean and flat, Desktop: Card with decorations */}
      <section className="mb-10 sm:mb-16 opacity-0 animate-fade-up" style={{ animationDelay: '0.1s', animationFillMode: 'forwards' }}>
        {/* Desktop: Card wrapper with tabs */}
        <div className="hidden sm:block relative rounded-2xl border border-[#e8dfd3] bg-white shadow-sm overflow-hidden">
          {/* Decorative corner accent */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-[#c45c3e]/5 to-transparent pointer-events-none" />
          <div className="absolute -top-8 -right-8 w-24 h-24 border border-[#c45c3e]/10 rounded-full pointer-events-none" />
          <div className="absolute -top-4 -right-4 w-12 h-12 border border-[#c45c3e]/10 rounded-full pointer-events-none" />

          <div className="relative">
            {/* Header */}
            <div className="flex items-center gap-4 p-8 pb-4">
              <div className="w-12 h-12 rounded-xl bg-[#c45c3e]/10 flex items-center justify-center">
                <Globe className="w-6 h-6 text-[#c45c3e]" />
              </div>
              <div>
                <h2 className="font-serif text-2xl font-bold text-[#1a1a1a]">
                  Start Learning
                </h2>
                <p className="text-[#6b6b6b] text-sm">
                  Transform any content into a personalized lesson
                </p>
              </div>
            </div>

            {/* Tabs */}
            <div className="px-8">
              <div className="flex gap-1 p-1 bg-[#f3ede4] rounded-xl">
                <button
                  onClick={() => handleTabChange("url")}
                  disabled={isSubmitting}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all",
                    activeTab === "url"
                      ? "bg-white text-[#1a1a1a] shadow-sm"
                      : "text-[#6b6b6b] hover:text-[#3d3d3d]",
                    isSubmitting && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <Link2 className="w-4 h-4" />
                  URL
                </button>
                <button
                  onClick={() => handleTabChange("text")}
                  disabled={isSubmitting}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all",
                    activeTab === "text"
                      ? "bg-white text-[#1a1a1a] shadow-sm"
                      : "text-[#6b6b6b] hover:text-[#3d3d3d]",
                    isSubmitting && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <Type className="w-4 h-4" />
                  Text
                </button>
                <button
                  onClick={() => handleTabChange("pdf")}
                  disabled={isSubmitting}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all",
                    activeTab === "pdf"
                      ? "bg-white text-[#1a1a1a] shadow-sm"
                      : "text-[#6b6b6b] hover:text-[#3d3d3d]",
                    isSubmitting && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <FileText className="w-4 h-4" />
                  PDF
                </button>
              </div>
            </div>

            {/* Tab Content */}
            <div className="p-8 pt-6 space-y-4">
              {/* URL Tab */}
              {activeTab === "url" && (
                <Input
                  placeholder="Paste an article URL..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={isSubmitting}
                  className="h-14 text-base"
                />
              )}

              {/* Text Tab */}
              {activeTab === "text" && (
                <div className="space-y-3">
                  <Input
                    placeholder="Title for your text..."
                    value={textTitle}
                    onChange={(e) => setTextTitle(e.target.value)}
                    disabled={isSubmitting}
                    className="h-12"
                  />
                  <textarea
                    placeholder="Paste or type your text here (at least 50 characters)..."
                    value={textContent}
                    onChange={(e) => setTextContent(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full h-40 px-4 py-3 text-base rounded-xl border border-[#e8dfd3] bg-white placeholder:text-[#9a9a9a] focus:outline-none focus:ring-2 focus:ring-[#c45c3e]/20 focus:border-[#c45c3e] disabled:opacity-50 resize-none"
                  />
                  <p className="text-xs text-[#9a9a9a]">
                    {textContent.length} characters {textContent.length < 50 && textContent.length > 0 && `(${50 - textContent.length} more needed)`}
                  </p>
                </div>
              )}

              {/* PDF Tab */}
              {activeTab === "pdf" && (
                <div className="space-y-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  {!pdfFile ? (
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => !isSubmitting && fileInputRef.current?.click()}
                      className={cn(
                        "relative h-40 rounded-xl border-2 border-dashed transition-all cursor-pointer",
                        "flex flex-col items-center justify-center gap-3",
                        isDragging
                          ? "border-[#c45c3e] bg-[#c45c3e]/5"
                          : "border-[#e8dfd3] hover:border-[#c45c3e]/50 hover:bg-[#faf8f5]",
                        isSubmitting && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <div className="w-12 h-12 rounded-full bg-[#f3ede4] flex items-center justify-center">
                        <Upload className="w-5 h-5 text-[#6b6b6b]" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-medium text-[#3d3d3d]">
                          Drop your PDF here or click to browse
                        </p>
                        <p className="text-xs text-[#9a9a9a] mt-1">
                          Maximum file size: 10MB
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="h-40 rounded-xl border border-[#e8dfd3] bg-[#faf8f5] flex items-center justify-center">
                      <div className="text-center">
                        <div className="w-12 h-12 rounded-full bg-[#c45c3e]/10 flex items-center justify-center mx-auto mb-3">
                          <FileText className="w-5 h-5 text-[#c45c3e]" />
                        </div>
                        <p className="text-sm font-medium text-[#1a1a1a] mb-1">{pdfFile.name}</p>
                        <p className="text-xs text-[#9a9a9a] mb-3">
                          {(pdfFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                        <button
                          onClick={(e) => { e.stopPropagation(); clearPdfFile(); }}
                          disabled={isSubmitting}
                          className="text-xs text-[#c45c3e] hover:underline disabled:opacity-50"
                        >
                          Remove file
                        </button>
                      </div>
                    </div>
                  )}
                  <Input
                    placeholder="Custom title (optional)"
                    value={pdfTitle}
                    onChange={(e) => setPdfTitle(e.target.value)}
                    disabled={isSubmitting}
                    className="h-12"
                  />
                </div>
              )}

              {/* Language & Level Selectors */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#3d3d3d] mb-2">
                    Target Language
                  </label>
                  <Select value={targetLanguage} onValueChange={setTargetLanguage} disabled={isSubmitting}>
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
                  <label className="block text-sm font-medium text-[#3d3d3d] mb-2">
                    Proficiency Level
                  </label>
                  <Select value={cefrLevel} onValueChange={setCefrLevel} disabled={isSubmitting}>
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

              {/* Status / Actions */}
              {translationState.status === "failed" ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span className="text-sm">{getStatusMessage()}</span>
                  </div>
                  <div className="flex gap-3">
                    <Button
                      onClick={handleCancel}
                      variant="outline"
                      className="flex-1 h-12"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleRetry}
                      className="flex-1 h-12"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Retry
                    </Button>
                  </div>
                </div>
              ) : isSubmitting ? (
                <Button disabled className="w-full h-14 text-base">
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {getStatusMessage()}
                </Button>
              ) : (
                <Button
                  onClick={handleTranslate}
                  disabled={!isInputValid()}
                  className="w-full h-14 text-base"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  {activeTab === "url" && "Translate Article"}
                  {activeTab === "text" && "Translate Text"}
                  {activeTab === "pdf" && "Translate PDF"}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Mobile: Clean, flat design with tabs */}
        <div className="sm:hidden">
          <div className="bg-white rounded-2xl p-4 border border-[#e8dfd3] space-y-3">
            {/* Mobile Tabs */}
            <div className="flex gap-1 p-1 bg-[#f3ede4] rounded-xl">
              <button
                onClick={() => handleTabChange("url")}
                disabled={isSubmitting}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-medium transition-all",
                  activeTab === "url"
                    ? "bg-white text-[#1a1a1a] shadow-sm"
                    : "text-[#6b6b6b]",
                  isSubmitting && "opacity-50"
                )}
              >
                <Link2 className="w-3.5 h-3.5" />
                URL
              </button>
              <button
                onClick={() => handleTabChange("text")}
                disabled={isSubmitting}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-medium transition-all",
                  activeTab === "text"
                    ? "bg-white text-[#1a1a1a] shadow-sm"
                    : "text-[#6b6b6b]",
                  isSubmitting && "opacity-50"
                )}
              >
                <Type className="w-3.5 h-3.5" />
                Text
              </button>
              <button
                onClick={() => handleTabChange("pdf")}
                disabled={isSubmitting}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-medium transition-all",
                  activeTab === "pdf"
                    ? "bg-white text-[#1a1a1a] shadow-sm"
                    : "text-[#6b6b6b]",
                  isSubmitting && "opacity-50"
                )}
              >
                <FileText className="w-3.5 h-3.5" />
                PDF
              </button>
            </div>

            {/* Mobile Tab Content */}
            {activeTab === "url" && (
              <Input
                placeholder="Paste a URL..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={isSubmitting}
                className="h-12 text-base border-[#e8dfd3]"
              />
            )}

            {activeTab === "text" && (
              <div className="space-y-2">
                <Input
                  placeholder="Title..."
                  value={textTitle}
                  onChange={(e) => setTextTitle(e.target.value)}
                  disabled={isSubmitting}
                  className="h-11 border-[#e8dfd3]"
                />
                <textarea
                  placeholder="Paste or type text here..."
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full h-32 px-3 py-2.5 text-sm rounded-xl border border-[#e8dfd3] bg-white placeholder:text-[#9a9a9a] focus:outline-none focus:ring-2 focus:ring-[#c45c3e]/20 focus:border-[#c45c3e] disabled:opacity-50 resize-none"
                />
              </div>
            )}

            {activeTab === "pdf" && (
              <div className="space-y-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                {!pdfFile ? (
                  <button
                    onClick={() => !isSubmitting && fileInputRef.current?.click()}
                    disabled={isSubmitting}
                    className={cn(
                      "w-full h-28 rounded-xl border-2 border-dashed border-[#e8dfd3]",
                      "flex flex-col items-center justify-center gap-2",
                      "text-[#6b6b6b] active:bg-[#faf8f5]",
                      isSubmitting && "opacity-50"
                    )}
                  >
                    <Upload className="w-5 h-5" />
                    <span className="text-sm">Tap to select PDF</span>
                  </button>
                ) : (
                  <div className="h-28 rounded-xl border border-[#e8dfd3] bg-[#faf8f5] flex items-center justify-center">
                    <div className="text-center">
                      <FileText className="w-6 h-6 text-[#c45c3e] mx-auto mb-1" />
                      <p className="text-sm font-medium text-[#1a1a1a] truncate max-w-[200px]">{pdfFile.name}</p>
                      <button
                        onClick={clearPdfFile}
                        disabled={isSubmitting}
                        className="text-xs text-[#c45c3e] mt-1"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <Select value={targetLanguage} onValueChange={setTargetLanguage} disabled={isSubmitting}>
                <SelectTrigger className="h-11 flex-1">
                  <SelectValue placeholder="Language" />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((lang) => (
                    <SelectItem key={lang} value={lang}>
                      {lang}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={cefrLevel} onValueChange={setCefrLevel} disabled={isSubmitting}>
                <SelectTrigger className="h-11 w-24">
                  <SelectValue placeholder="Level" />
                </SelectTrigger>
                <SelectContent>
                  {CEFR_LEVELS.map((level) => (
                    <SelectItem key={level.value} value={level.value}>
                      {level.value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {translationState.status === "failed" ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm">{getStatusMessage()}</span>
                </div>
                <div className="flex gap-3">
                  <Button
                    onClick={handleCancel}
                    variant="outline"
                    className="flex-1 h-12"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleRetry}
                    className="flex-1 h-12"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Retry
                  </Button>
                </div>
              </div>
            ) : isSubmitting ? (
              <Button disabled className="w-full h-12">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {getStatusMessage()}
              </Button>
            ) : (
              <Button
                onClick={handleTranslate}
                disabled={!isInputValid()}
                className="w-full h-12"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                {activeTab === "url" && "Translate"}
                {activeTab === "text" && "Translate Text"}
                {activeTab === "pdf" && "Translate PDF"}
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Article History Section */}
      <section className="opacity-0 animate-fade-up" style={{ animationDelay: '0.2s', animationFillMode: 'forwards' }}>
        {/* Desktop header */}
        <div className="hidden sm:flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-[#2d5a47]/10 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-[#2d5a47]" />
            </div>
            <div>
              <h2 className="font-serif text-xl font-bold text-[#1a1a1a]">
                Your Articles
              </h2>
              {articles.length > 0 && (
                <p className="text-sm text-[#9a9a9a]">
                  {articles.length} article{articles.length !== 1 ? "s" : ""} translated
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Mobile header */}
        <div className="sm:hidden flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-[#2d5a47]/10 flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-[#2d5a47]" />
          </div>
          <div>
            <h2 className="font-semibold text-[#1a1a1a]">Your Articles</h2>
            {articles.length > 0 && (
              <p className="text-xs text-[#9a9a9a]">{articles.length} translated</p>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 sm:py-20">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-[#c45c3e]" />
              <p className="text-sm text-[#9a9a9a]">Loading your articles...</p>
            </div>
          </div>
        ) : articles.length === 0 ? (
          <>
            {/* Desktop empty state */}
            <Card className="hidden sm:block p-12 text-center border-dashed border-2 bg-[#faf7f2]">
              <div className="w-16 h-16 rounded-2xl bg-[#f3ede4] flex items-center justify-center mx-auto mb-4">
                <Globe className="w-8 h-8 text-[#9a9a9a]" />
              </div>
              <h3 className="font-serif text-xl font-semibold text-[#1a1a1a] mb-2">No articles yet</h3>
              <p className="text-[#6b6b6b] mb-6 max-w-sm mx-auto">
                Translate your first article to start learning. Just paste a URL above.
              </p>
            </Card>
            {/* Mobile empty state - simpler */}
            <div className="sm:hidden text-center py-8 text-[#9a9a9a]">
              <p className="text-sm">No articles yet. Paste a URL above to get started.</p>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {articles.map((article, index) => {
              const status = article.status as ArticleStatus;
              const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.queued;
              const isProcessing = !["completed", "failed"].includes(status);
              const isCompleted = status === "completed";
              const isFailed = status === "failed";

              const cardContent = (
                <Card className={cn(
                  "p-5 h-full",
                  isCompleted && "cursor-pointer group",
                  isFailed && "border-red-200 bg-red-50/30"
                )}>
                  <div className="flex items-start gap-4 mb-3 pr-8">
                    <h3 className={cn(
                      "font-medium line-clamp-2 flex-1",
                      isCompleted ? "text-[#1a1a1a] group-hover:text-[#c45c3e] transition-colors" : "text-[#6b6b6b]"
                    )}>
                      {article.title || (isProcessing ? "Processing..." : "Untitled Article")}
                    </h3>
                  </div>

                  {/* Source info */}
                  <div className="flex items-center gap-2 text-sm text-[#9a9a9a] mb-3">
                    {article.sourceUrl ? (
                      <>
                        <ExternalLink className="w-3 h-3" />
                        <span className="truncate">{extractDomain(article.sourceUrl)}</span>
                      </>
                    ) : article.pdfUrl ? (
                      <>
                        <FileText className="w-3 h-3" />
                        <span>PDF</span>
                      </>
                    ) : (
                      <>
                        <Type className="w-3 h-3" />
                        <span>Text</span>
                      </>
                    )}
                    {isCompleted && (
                      <>
                        <span className="flex-shrink-0">·</span>
                        <span className="flex-shrink-0">{article.wordCount || 0} words</span>
                        {article.audioUrl && (
                          <>
                            <span className="flex-shrink-0">·</span>
                            <Headphones className="w-3.5 h-3.5 flex-shrink-0 text-[#2d5a47]" />
                          </>
                        )}
                      </>
                    )}
                  </div>

                  {/* Status indicator for processing articles */}
                  {isProcessing && (
                    <div className="mb-3">
                      <div className={cn(
                        "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium",
                        statusConfig.bgColor,
                        statusConfig.color
                      )}>
                        {statusConfig.icon}
                        <span>{statusConfig.label}</span>
                        {status === "translating" && article.totalParagraphs > 0 && (
                          <span className="ml-1">
                            ({Math.round((article.translationProgress / article.totalParagraphs) * 100)}%)
                          </span>
                        )}
                      </div>
                      {status === "translating" && article.totalParagraphs > 0 && (
                        <div className="mt-2 w-full h-1.5 bg-[#e8dfd3] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#c45c3e] rounded-full transition-all duration-500"
                            style={{ width: `${Math.round((article.translationProgress / article.totalParagraphs) * 100)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Error message for failed articles */}
                  {isFailed && article.errorMessage && (
                    <div className="mb-3 p-2 rounded-lg bg-red-100 border border-red-200">
                      <p className="text-xs text-red-700 line-clamp-2">{article.errorMessage}</p>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <Badge>
                      {article.targetLanguage} {article.cefrLevel}
                    </Badge>
                    <span className="text-xs text-[#9a9a9a]">
                      {formatRelativeTime(article.createdAt)}
                    </span>
                  </div>
                </Card>
              );

              return (
                <div
                  key={article.id}
                  className="opacity-0 animate-fade-up relative"
                  style={{ animationDelay: `${0.1 * (index + 3)}s`, animationFillMode: 'forwards' }}
                >
                  {isCompleted ? (
                    <Link href={`/article/${article.id}`}>{cardContent}</Link>
                  ) : (
                    cardContent
                  )}
                  {/* Delete button - absolute positioned */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="absolute top-3 right-3 p-1.5 rounded-md hover:bg-[#f3ede4] text-[#9a9a9a] hover:text-[#6b6b6b] transition-colors z-10"
                        onClick={(e) => e.preventDefault()}
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {isFailed && (
                        <DropdownMenuItem
                          className="text-[#c45c3e] focus:text-[#c45c3e] focus:bg-[#faf8f5]"
                          onClick={(e) => {
                            e.preventDefault();
                            // Retry the article - re-submit with same parameters
                            if (article.sourceUrl) {
                              setUrl(article.sourceUrl);
                              setActiveTab("url");
                              handleTranslate();
                            }
                          }}
                        >
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Retry
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        className="text-red-600 focus:text-red-600 focus:bg-red-50"
                        onClick={(e) => handleDeleteArticle(article.id, e)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete article
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Onboarding Modal */}
      <DashboardOnboarding
        open={showOnboarding}
        onComplete={handleOnboardingComplete}
        targetLanguage={targetLanguage}
      />
    </div>
  );
}
