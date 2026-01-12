import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { lookupWord, isSupportedLanguage, type DictionaryEntry, type SupportedLanguage } from "@/lib/dictionary/lookup";

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

    // Use local dictionary for instant lookup
    const entry: DictionaryEntry | null = lookupWord(word, language as SupportedLanguage);

    if (!entry) {
      return NextResponse.json({
        found: false,
        word,
        message: "Word not found in dictionary",
      });
    }

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
  } catch (error) {
    console.error("Dictionary lookup error:", error);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
