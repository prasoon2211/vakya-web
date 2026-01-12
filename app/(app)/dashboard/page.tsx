"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Globe, Headphones, Loader2, Sparkles, BookOpen, ExternalLink, RefreshCw, AlertCircle, Trash2, MoreVertical, FileText, Upload, Link2, Type } from "lucide-react";
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
type TranslationStatus = "idle" | "fetching" | "translating" | "completed" | "failed";

interface TranslationState {
  status: TranslationStatus;
  articleId?: string;
  progress?: number;
  total?: number;
  error?: string;
  title?: string;
}

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
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

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

  const pollStatus = useCallback(async (articleId: string) => {
    try {
      const res = await fetch(`/api/articles/${articleId}/status`);
      if (!res.ok) return;

      const data = await res.json();

      if (data.status === "completed") {
        // Stop polling
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }

        setTranslationState({ status: "completed", articleId, title: data.title });
        toast({
          title: "Article translated!",
          description: data.title || "Redirecting to your article...",
          variant: "success",
        });

        router.push(`/article/${articleId}`);
      } else if (data.status === "failed") {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }

        setTranslationState({
          status: "failed",
          articleId,
          error: data.errorMessage || "Translation failed",
          title: data.title,
        });
      } else {
        setTranslationState({
          status: data.status,
          articleId,
          progress: data.translationProgress,
          total: data.totalParagraphs,
          title: data.title,
        });
      }
    } catch (error) {
      console.error("Polling error:", error);
    }
  }, [router]);

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

    // Show immediate feedback
    setTranslationState({ status: "fetching" });

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

      // Translation started - update state and start polling immediately
      setTranslationState({
        status: data.status || "translating",
        articleId: data.articleId,
        progress: data.progress || 0,
        total: data.total || 0,
        title: data.title,
      });

      // Start polling for status immediately
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
      pollingRef.current = setInterval(() => pollStatus(data.articleId), 1000);

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
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
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
      case "fetching":
        if (activeTab === "pdf") return "Processing PDF...";
        if (activeTab === "text") return "Preparing text...";
        return "Fetching article content...";
      case "translating":
        if (translationState.total && translationState.total > 0) {
          const progress = translationState.progress || 0;
          const percent = Math.round((progress / translationState.total) * 100);
          return `Translating... ${percent}% (${progress}/${translationState.total} chunks)`;
        }
        return "Preparing translation...";
      case "failed":
        return translationState.error || "Translation failed";
      default:
        return "";
    }
  };

  const getStatusSubMessage = () => {
    if (translationState.title) {
      return translationState.title;
    }
    if (translationState.status === "fetching") {
      if (activeTab === "pdf") return "Extracting text from PDF...";
      if (activeTab === "text") return "Processing your text...";
      return "Extracting main content from the page...";
    }
    if (translationState.status === "translating") {
      return "This usually takes just a few seconds";
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

  const isTranslating = translationState.status === "fetching" || translationState.status === "translating";

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
                  onClick={() => setActiveTab("url")}
                  disabled={isTranslating}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all",
                    activeTab === "url"
                      ? "bg-white text-[#1a1a1a] shadow-sm"
                      : "text-[#6b6b6b] hover:text-[#3d3d3d]",
                    isTranslating && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <Link2 className="w-4 h-4" />
                  URL
                </button>
                <button
                  onClick={() => setActiveTab("text")}
                  disabled={isTranslating}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all",
                    activeTab === "text"
                      ? "bg-white text-[#1a1a1a] shadow-sm"
                      : "text-[#6b6b6b] hover:text-[#3d3d3d]",
                    isTranslating && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <Type className="w-4 h-4" />
                  Text
                </button>
                <button
                  onClick={() => setActiveTab("pdf")}
                  disabled={isTranslating}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all",
                    activeTab === "pdf"
                      ? "bg-white text-[#1a1a1a] shadow-sm"
                      : "text-[#6b6b6b] hover:text-[#3d3d3d]",
                    isTranslating && "opacity-50 cursor-not-allowed"
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
                  disabled={isTranslating}
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
                    disabled={isTranslating}
                    className="h-12"
                  />
                  <textarea
                    placeholder="Paste or type your text here (at least 50 characters)..."
                    value={textContent}
                    onChange={(e) => setTextContent(e.target.value)}
                    disabled={isTranslating}
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
                      onClick={() => !isTranslating && fileInputRef.current?.click()}
                      className={cn(
                        "relative h-40 rounded-xl border-2 border-dashed transition-all cursor-pointer",
                        "flex flex-col items-center justify-center gap-3",
                        isDragging
                          ? "border-[#c45c3e] bg-[#c45c3e]/5"
                          : "border-[#e8dfd3] hover:border-[#c45c3e]/50 hover:bg-[#faf8f5]",
                        isTranslating && "opacity-50 cursor-not-allowed"
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
                          disabled={isTranslating}
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
                    disabled={isTranslating}
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
                  <label className="block text-sm font-medium text-[#3d3d3d] mb-2">
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
              ) : isTranslating ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-5 h-5 animate-spin text-[#c45c3e]" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-[#1a1a1a]">{getStatusMessage()}</span>
                      {getStatusSubMessage() && (
                        <p className="text-xs text-[#6b6b6b] truncate mt-0.5">{getStatusSubMessage()}</p>
                      )}
                    </div>
                  </div>
                  {translationState.status === "translating" && translationState.total && translationState.total > 0 ? (
                    <div className="w-full h-2 bg-[#e8dfd3] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#c45c3e] rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${Math.round(((translationState.progress || 0) / translationState.total) * 100)}%` }}
                      />
                    </div>
                  ) : (
                    <div className="w-full h-2 bg-[#e8dfd3] rounded-full overflow-hidden">
                      <div className="h-full bg-[#c45c3e]/50 rounded-full animate-pulse w-1/3" />
                    </div>
                  )}
                  <p className="text-xs text-[#9a9a9a]">
                    You can safely refresh - progress is saved automatically.
                  </p>
                </div>
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
                onClick={() => setActiveTab("url")}
                disabled={isTranslating}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-medium transition-all",
                  activeTab === "url"
                    ? "bg-white text-[#1a1a1a] shadow-sm"
                    : "text-[#6b6b6b]",
                  isTranslating && "opacity-50"
                )}
              >
                <Link2 className="w-3.5 h-3.5" />
                URL
              </button>
              <button
                onClick={() => setActiveTab("text")}
                disabled={isTranslating}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-medium transition-all",
                  activeTab === "text"
                    ? "bg-white text-[#1a1a1a] shadow-sm"
                    : "text-[#6b6b6b]",
                  isTranslating && "opacity-50"
                )}
              >
                <Type className="w-3.5 h-3.5" />
                Text
              </button>
              <button
                onClick={() => setActiveTab("pdf")}
                disabled={isTranslating}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-medium transition-all",
                  activeTab === "pdf"
                    ? "bg-white text-[#1a1a1a] shadow-sm"
                    : "text-[#6b6b6b]",
                  isTranslating && "opacity-50"
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
                disabled={isTranslating}
                className="h-12 text-base border-[#e8dfd3]"
              />
            )}

            {activeTab === "text" && (
              <div className="space-y-2">
                <Input
                  placeholder="Title..."
                  value={textTitle}
                  onChange={(e) => setTextTitle(e.target.value)}
                  disabled={isTranslating}
                  className="h-11 border-[#e8dfd3]"
                />
                <textarea
                  placeholder="Paste or type text here..."
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  disabled={isTranslating}
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
                    onClick={() => !isTranslating && fileInputRef.current?.click()}
                    disabled={isTranslating}
                    className={cn(
                      "w-full h-28 rounded-xl border-2 border-dashed border-[#e8dfd3]",
                      "flex flex-col items-center justify-center gap-2",
                      "text-[#6b6b6b] active:bg-[#faf8f5]",
                      isTranslating && "opacity-50"
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
                        disabled={isTranslating}
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
              <Select value={targetLanguage} onValueChange={setTargetLanguage} disabled={isTranslating}>
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

              <Select value={cefrLevel} onValueChange={setCefrLevel} disabled={isTranslating}>
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
            ) : isTranslating ? (
              <div className="space-y-3 p-4 bg-[#faf8f5] rounded-xl">
                <div className="flex items-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-[#c45c3e]" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-[#1a1a1a]">{getStatusMessage()}</span>
                    {getStatusSubMessage() && (
                      <p className="text-xs text-[#6b6b6b] truncate mt-0.5">{getStatusSubMessage()}</p>
                    )}
                  </div>
                </div>
                {translationState.status === "translating" && translationState.total && translationState.total > 0 ? (
                  <div className="w-full h-2 bg-[#e8dfd3] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#c45c3e] rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${Math.round(((translationState.progress || 0) / translationState.total) * 100)}%` }}
                    />
                  </div>
                ) : (
                  <div className="w-full h-2 bg-[#e8dfd3] rounded-full overflow-hidden">
                    <div className="h-full bg-[#c45c3e]/50 rounded-full animate-pulse w-1/3" />
                  </div>
                )}
              </div>
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
            {articles.map((article, index) => (
              <div
                key={article.id}
                className="opacity-0 animate-fade-up relative"
                style={{ animationDelay: `${0.1 * (index + 3)}s`, animationFillMode: 'forwards' }}
              >
                <Link href={`/article/${article.id}`}>
                  <Card className="p-5 h-full cursor-pointer group">
                    <div className="flex items-start gap-4 mb-3 pr-8">
                      <h3 className="font-medium text-[#1a1a1a] group-hover:text-[#c45c3e] transition-colors line-clamp-2 flex-1">
                        {article.title || "Untitled Article"}
                      </h3>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-[#9a9a9a] mb-4">
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
                      <span className="flex-shrink-0">·</span>
                      <span className="flex-shrink-0">{article.wordCount || 0} words</span>
                      {article.audioUrl && (
                        <>
                          <span className="flex-shrink-0">·</span>
                          <Headphones className="w-3.5 h-3.5 flex-shrink-0 text-[#2d5a47]" />
                        </>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <Badge>
                        {article.targetLanguage} {article.cefrLevel}
                      </Badge>
                      <span className="text-xs text-[#9a9a9a]">
                        {formatRelativeTime(article.createdAt)}
                      </span>
                    </div>
                  </Card>
                </Link>
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
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
