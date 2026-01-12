import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { lookupWord, isSupportedLanguage, type DictionaryEntry, type SupportedLanguage } from "@/lib/dictionary/lookup";

// Map our language names to Free Dictionary API language codes
const LANGUAGE_CODES: Record<string, string> = {
  German: "de",
  Spanish: "es",
  French: "fr",
  English: "en",
};

// Fallback to Free Dictionary API for words not in local dictionary
async function freeDictionaryLookup(word: string, language: string): Promise<{
  found: boolean;
  partOfSpeech?: string;
  phonetic?: string;
  audioUrl?: string;
  definition?: string;
  example?: string;
} | null> {
  const langCode = LANGUAGE_CODES[language];
  if (!langCode) return null;

  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/${langCode}/${encodeURIComponent(word)}`,
      { signal: AbortSignal.timeout(3000) } // 3s timeout
    );

    if (!res.ok) return null;

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const entry = data[0];
    const meaning = entry.meanings?.[0];
    const definition = meaning?.definitions?.[0];

    // Find audio URL
    let audioUrl: string | undefined;
    for (const phonetic of entry.phonetics || []) {
      if (phonetic.audio) {
        audioUrl = phonetic.audio;
        break;
      }
    }

    return {
      found: true,
      partOfSpeech: meaning?.partOfSpeech || undefined,
      phonetic: entry.phonetic || undefined,
      audioUrl: audioUrl,
      definition: definition?.definition || undefined,
      example: definition?.example || undefined,
    };
  } catch (err) {
    console.error("Free Dictionary API error:", err);
    return null;
  }
}

// GET - Dictionary lookup (supports German, Spanish, French)
export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const word = searchParams.get("word");
    const language = searchParams.get("language") || "German";

    if (!word) {
      return NextResponse.json({ error: "Word is required" }, { status: 400 });
    }

    // Check if language is supported
    if (!isSupportedLanguage(language)) {
      return NextResponse.json({
        found: false,
        word,
        message: `Language "${language}" is not supported. Supported: German, Spanish, French`,
      });
    }

    // Try local MUSE dictionary first (instant, ~100k words)
    const entry: DictionaryEntry | null = lookupWord(word, language as SupportedLanguage);

    if (entry) {
      return NextResponse.json({
        found: true,
        word: entry.word,
        translation: entry.en,
        // MUSE dictionaries don't include grammar info
        partOfSpeech: null,
        article: null,
        gender: null,
        phonetic: null,
        audioUrl: null,
      });
    }

    // Fallback to Free Dictionary API for inflected forms, rare words, etc.
    const freeDictResult = await freeDictionaryLookup(word, language);

    if (freeDictResult?.found) {
      return NextResponse.json({
        found: true,
        word,
        translation: null, // Free Dictionary doesn't translate, only defines
        partOfSpeech: freeDictResult.partOfSpeech || null,
        article: null,
        gender: null,
        phonetic: freeDictResult.phonetic || null,
        audioUrl: freeDictResult.audioUrl || null,
        definition: freeDictResult.definition || null,
        example: freeDictResult.example || null,
      });
    }

    // Neither dictionary found the word
    return NextResponse.json({
      found: false,
      word,
      message: "Word not found in dictionary",
    });
  } catch (error) {
    console.error("Dictionary lookup error:", error);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
