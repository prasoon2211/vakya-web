import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { lookupWord, type DictionaryEntry } from "@/lib/dictionary/lookup";

// GET - Dictionary lookup (German-English only, uses local dictionary)
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

    // Only German is supported for now
    if (language !== "German") {
      return NextResponse.json({
        found: false,
        word,
        message: "Only German is supported at this time",
      });
    }

    // Use local TU Chemnitz dictionary for instant lookup
    const entry: DictionaryEntry | null = lookupWord(word);

    if (!entry) {
      return NextResponse.json({
        found: false,
        word,
        message: "Word not found in dictionary",
      });
    }

    return NextResponse.json({
      found: true,
      word: entry.de,
      translation: entry.en,
      partOfSpeech: entry.pos || null,
      article: entry.article || null,
      gender: entry.gender || null,
      // No phonetic/audio from this dictionary
      phonetic: null,
      audioUrl: null,
    });
  } catch (error) {
    console.error("Dictionary lookup error:", error);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
