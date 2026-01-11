import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Language codes for Free Dictionary API
const LANGUAGE_CODES: Record<string, string> = {
  English: "en",
  German: "de",
  Spanish: "es",
  French: "fr",
  Italian: "it",
  Portuguese: "pt",
  Dutch: "nl",
  Russian: "ru",
  Arabic: "ar",
  Turkish: "tr",
  Hindi: "hi",
};

// GET - Dictionary lookup
export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const word = searchParams.get("word");
    const language = searchParams.get("language") || "English";

    if (!word) {
      return NextResponse.json({ error: "Word is required" }, { status: 400 });
    }

    const langCode = LANGUAGE_CODES[language] || "en";

    // Try Free Dictionary API
    const response = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/${langCode}/${encodeURIComponent(word.toLowerCase())}`
    );

    if (!response.ok) {
      return NextResponse.json({
        found: false,
        word,
        message: "Word not found in dictionary",
      });
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({
        found: false,
        word,
        message: "No definitions found",
      });
    }

    const entry = data[0];
    const meanings = entry.meanings || [];
    const firstMeaning = meanings[0] || {};
    const firstDefinition = firstMeaning.definitions?.[0] || {};

    return NextResponse.json({
      found: true,
      word: entry.word,
      phonetic: entry.phonetic || entry.phonetics?.[0]?.text || null,
      audioUrl: entry.phonetics?.find((p: { audio?: string }) => p.audio)?.audio || null,
      partOfSpeech: firstMeaning.partOfSpeech || null,
      definition: firstDefinition.definition || null,
      example: firstDefinition.example || null,
      synonyms: firstMeaning.synonyms?.slice(0, 5) || [],
    });
  } catch (error) {
    console.error("Dictionary lookup error:", error);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
