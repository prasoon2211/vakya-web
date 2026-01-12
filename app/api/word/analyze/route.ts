import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { db, users, wordCache } from "@/lib/db";
import { eq, and } from "drizzle-orm";

// Lazy-init Gemini client
let geminiClient: GoogleGenAI | null = null;
function getGemini() {
  if (!geminiClient && process.env.GOOGLE_AI_API_KEY) {
    geminiClient = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });
  }
  return geminiClient;
}

// POST - AI word analysis with caching
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

    // Get user's native language and CEFR level
    const user = await db.query.users.findFirst({
      where: eq(users.clerkId, userId),
      columns: { nativeLanguage: true, cefrLevel: true },
    });

    const nativeLanguage = user?.nativeLanguage || "English";
    const cefrLevel = user?.cefrLevel || "B1";
    const normalizedWord = word.toLowerCase().trim();

    // Check cache first
    const cached = await db.query.wordCache.findFirst({
      where: and(
        eq(wordCache.word, normalizedWord),
        eq(wordCache.targetLanguage, targetLanguage),
        eq(wordCache.cefrLevel, cefrLevel)
      ),
    });

    if (cached) {
      return NextResponse.json({
        word: normalizedWord,
        translation: cached.translation,
        pos: cached.partOfSpeech,
        article: cached.article,
        example: cached.example,
        cached: true,
      });
    }

    // Not in cache - call Gemini 2.5 Flash Lite (fast, cheap)
    const gemini = getGemini();
    if (!gemini) {
      return NextResponse.json(
        { error: "AI service not configured" },
        { status: 500 }
      );
    }

    const prompt = `Analyze the word "${word}" in ${targetLanguage}${contextSentence ? ` appearing in this context: "${contextSentence}"` : ""}.
The learner speaks ${nativeLanguage} and is learning ${targetLanguage} at ${cefrLevel} level.

Return ONLY a valid JSON object with these exact keys:
{
  "translation": "translation in ${nativeLanguage}",
  "pos": "part of speech (noun/verb/adjective/adverb/preposition/conjunction/article/pronoun)",
  "article": "grammatical article if applicable (e.g., der/die/das for German nouns) or null",
  "gender": "grammatical gender if applicable (masculine/feminine/neuter) or null",
  "example": "a simple example sentence in ${targetLanguage} using this word",
  "explanation": "brief explanation of usage, any irregularities, or helpful notes appropriate for a ${cefrLevel} learner (in ${nativeLanguage})"
}`;

    const response = await gemini.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        thinkingConfig: {
          thinkingBudget: 0, // Disable thinking for speed
        },
      },
    });

    const content = response.text;
    if (!content) {
      return NextResponse.json(
        { error: "No response from AI" },
        { status: 500 }
      );
    }

    let analysis;
    try {
      analysis = JSON.parse(content);
    } catch {
      console.error("Failed to parse AI response:", content);
      return NextResponse.json(
        { error: "Invalid response format from AI" },
        { status: 500 }
      );
    }

    // Save to cache (fire and forget - don't block response)
    db.insert(wordCache)
      .values({
        word: normalizedWord,
        targetLanguage,
        cefrLevel,
        translation: analysis.translation,
        partOfSpeech: analysis.pos,
        article: analysis.article || null,
        example: analysis.example,
      })
      .onConflictDoNothing()
      .catch((err) => {
        console.error("Failed to cache word:", err);
      });

    return NextResponse.json({
      word: normalizedWord,
      ...analysis,
      cached: false,
    });
  } catch (error) {
    console.error("Word analysis error:", error);
    return NextResponse.json(
      { error: "Analysis failed" },
      { status: 500 }
    );
  }
}
