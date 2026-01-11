"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useUser } from "@clerk/nextjs";
import { Settings, Globe, BookOpen, Save, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { LANGUAGES, CEFR_LEVELS } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { user } = useUser();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Settings state
  const [nativeLanguage, setNativeLanguage] = useState("English");
  const [targetLanguage, setTargetLanguage] = useState("German");
  const [cefrLevel, setCefrLevel] = useState("B1");

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        setNativeLanguage(data.nativeLanguage || "English");
        setTargetLanguage(data.targetLanguage || "German");
        setCefrLevel(data.cefrLevel || "B1");
      }
    } catch (error) {
      console.error("Failed to fetch settings:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nativeLanguage,
          targetLanguage,
          cefrLevel,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save");
      }

      toast({
        title: "Settings saved",
        variant: "success",
      });
    } catch {
      toast({
        title: "Failed to save settings",
        variant: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportVocabulary = async () => {
    setIsExporting(true);
    try {
      const res = await fetch("/api/vocabulary?limit=1000");
      if (!res.ok) throw new Error("Failed to fetch vocabulary");

      const data = await res.json();
      const words = data.words || [];

      if (words.length === 0) {
        toast({
          title: "No words to export",
          description: "Save some words first!",
        });
        return;
      }

      // Create CSV content
      const headers = ["Word", "Article", "Translation", "Part of Speech", "Example", "Context", "Language", "Mastery Level"];
      const rows = words.map((w: any) => [
        w.word,
        w.article || "",
        w.translation || "",
        w.partOfSpeech || "",
        w.example || "",
        w.contextSentence || "",
        w.targetLanguage,
        w.masteryLevel,
      ]);

      const csv = [
        headers.join(","),
        ...rows.map((row: string[]) =>
          row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
        ),
      ].join("\n");

      // Download file
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vakya-vocabulary-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Vocabulary exported",
        description: `${words.length} words exported to CSV`,
        variant: "success",
      });
    } catch {
      toast({
        title: "Export failed",
        variant: "error",
      });
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-[#c45c3e]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="font-serif text-2xl font-bold text-[#1a1a1a] mb-8 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#c45c3e]/10 flex items-center justify-center">
          <Settings className="h-5 w-5 text-[#c45c3e]" />
        </div>
        Settings
      </h1>

      <div className="space-y-6">
        {/* Profile Section */}
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Your account information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {user && (
              <div className="flex items-center gap-4">
                {user.imageUrl && (
                  <Image
                    src={user.imageUrl}
                    alt="Profile"
                    width={64}
                    height={64}
                    className="h-16 w-16 rounded-full ring-2 ring-[#e8dfd3]"
                  />
                )}
                <div>
                  <p className="font-medium text-[#1a1a1a]">{user.fullName || "User"}</p>
                  <p className="text-sm text-[#6b6b6b]">
                    {user.primaryEmailAddress?.emailAddress}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Language Preferences */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-[#c45c3e]" />
              Language Preferences
            </CardTitle>
            <CardDescription>
              Set your native and target languages for translations
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-[#6b6b6b] mb-2">
                Native Language
              </label>
              <Select value={nativeLanguage} onValueChange={setNativeLanguage}>
                <SelectTrigger>
                  <SelectValue placeholder="Select your native language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="English">English</SelectItem>
                  {LANGUAGES.map((lang) => (
                    <SelectItem key={lang} value={lang}>
                      {lang}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#6b6b6b] mb-2">
                Target Language
              </label>
              <Select value={targetLanguage} onValueChange={setTargetLanguage}>
                <SelectTrigger>
                  <SelectValue placeholder="Select your target language" />
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
          </CardContent>
        </Card>

        {/* CEFR Level */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-[#c45c3e]" />
              Proficiency Level
            </CardTitle>
            <CardDescription>
              Choose your current proficiency level for appropriate translations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {CEFR_LEVELS.map((level) => (
                <button
                  key={level.value}
                  onClick={() => setCefrLevel(level.value)}
                  className={cn(
                    "flex items-start gap-4 p-4 rounded-xl border text-left transition-all",
                    cefrLevel === level.value
                      ? "border-[#c45c3e] bg-[#c45c3e]/5"
                      : "border-[#e8dfd3] hover:border-[#d4c5b5] hover:bg-[#faf7f2]"
                  )}
                >
                  <div
                    className={cn(
                      "h-5 w-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5",
                      cefrLevel === level.value
                        ? "border-[#c45c3e]"
                        : "border-[#d4c5b5]"
                    )}
                  >
                    {cefrLevel === level.value && (
                      <div className="h-2.5 w-2.5 rounded-full bg-[#c45c3e]" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-[#1a1a1a]">{level.label}</p>
                    <p className="text-sm text-[#6b6b6b]">
                      {level.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Data Management */}
        <Card>
          <CardHeader>
            <CardTitle>Data</CardTitle>
            <CardDescription>Export and manage your data</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              variant="outline"
              onClick={handleExportVocabulary}
              disabled={isExporting}
              className="w-full justify-start"
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Export Vocabulary to CSV
            </Button>
          </CardContent>
        </Card>

        {/* Save Button */}
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full"
          loading={isSaving}
        >
          <Save className="h-4 w-4 mr-2" />
          Save Settings
        </Button>
      </div>
    </div>
  );
}
