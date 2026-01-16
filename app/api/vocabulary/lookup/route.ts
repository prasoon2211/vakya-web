import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db, users, wordCache, savedWords } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { GoogleGenAI } from "@google/genai";

// Lazy-init Gemini client
let geminiClient: GoogleGenAI | null = null;
function getGemini() {
  if (!geminiClient && process.env.GOOGLE_AI_API_KEY) {
    geminiClient = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });
  }
  return geminiClient;
}

export interface WordLookupResult {
  word: string;
  translation: string | null;
  partOfSpeech: string | null;
  article: string | null;
  example: string | null;
  alreadySaved: boolean;
}

// POST - Lookup a word (without saving)
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { word, contextSentence, targetLanguage } = body;

    if (!word || !targetLanguage) {
      return NextResponse.json(
        { error: "Word and target language are required" },
        { status: 400 }
      );
    }

    const normalizedWord = word.toLowerCase().trim();

    // Get user settings
    const user = await db.query.users.findFirst({
      where: eq(users.clerkId, userId),
      columns: { id: true, nativeLanguage: true, cefrLevel: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if word is already saved
    const existingSaved = await db.query.savedWords.findFirst({
      where: and(
        eq(savedWords.userId, user.id),
        eq(savedWords.word, normalizedWord),
        eq(savedWords.targetLanguage, targetLanguage)
      ),
      columns: { id: true },
    });

    // Check cache first
    const cached = await db.query.wordCache.findFirst({
      where: and(
        eq(wordCache.word, normalizedWord),
        eq(wordCache.targetLanguage, targetLanguage)
      ),
    });

    if (cached) {
      return NextResponse.json({
        word: normalizedWord,
        translation: cached.translation,
        partOfSpeech: cached.partOfSpeech,
        article: cached.article,
        example: cached.example,
        alreadySaved: !!existingSaved,
      } satisfies WordLookupResult);
    }

    // Fetch from AI
    const gemini = getGemini();
    if (!gemini) {
      return NextResponse.json(
        { error: "AI service unavailable" },
        { status: 503 }
      );
    }

    const nativeLanguage = user.nativeLanguage || "English";
    const cefrLevel = user.cefrLevel || "B1";

    const prompt = `Analyze the word "${word}" in ${targetLanguage}${contextSentence ? ` appearing in this context: "${contextSentence}"` : ""}.
The learner speaks ${nativeLanguage} and is learning ${targetLanguage} at ${cefrLevel} level.

Return ONLY a valid JSON object with these exact keys:
{
  "translation": "translation in ${nativeLanguage}",
  "pos": "part of speech (noun/verb/adjective/adverb/preposition/conjunction/article/pronoun)",
  "article": "grammatical article if applicable (e.g., der/die/das for German nouns) or null",
  "example": "a simple example sentence in ${targetLanguage} using this word"
}`;

    const response = await gemini.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        thinkingConfig: {
          thinkingBudget: 0,
        },
      },
    });

    const content = response.text;
    if (!content) {
      return NextResponse.json(
        { error: "Failed to get AI response" },
        { status: 500 }
      );
    }

    const analysis = JSON.parse(content);

    // Cache the result for future lookups
    await db
      .insert(wordCache)
      .values({
        word: normalizedWord,
        targetLanguage,
        cefrLevel,
        translation: analysis.translation,
        partOfSpeech: analysis.pos,
        article: analysis.article || null,
        example: analysis.example,
      })
      .onConflictDoNothing();

    return NextResponse.json({
      word: normalizedWord,
      translation: analysis.translation,
      partOfSpeech: analysis.pos,
      article: analysis.article || null,
      example: analysis.example,
      alreadySaved: !!existingSaved,
    } satisfies WordLookupResult);
  } catch (error) {
    console.error("Error in vocabulary lookup:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
