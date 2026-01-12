import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  lookupWord,
  isSupportedLanguage,
  type DictionaryEntry,
  type SupportedLanguage,
} from "@/lib/dictionary/lookup-sqlite";

// GET - Dictionary lookup (supports German, Spanish, French)
// Uses Wiktionary data with 1.4M+ entries
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

    // Look up in Wiktionary SQLite database (1.4M+ entries, instant)
    const entry: DictionaryEntry | null = lookupWord(word, language as SupportedLanguage);

    if (entry) {
      return NextResponse.json({
        found: true,
        word: entry.word,
        // Wiktionary provides English definitions/translations
        translation: entry.definition,
        definitions: entry.definitions,
        partOfSpeech: entry.partOfSpeech || null,
        forms: entry.forms || null,
        phonetic: entry.ipa || null,
        audioUrl: entry.audioUrl || null,
        // These aren't in Wiktionary data
        article: null,
        gender: null,
      });
    }

    // Word not found
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
