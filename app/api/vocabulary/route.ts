import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db, users, savedWords, wordCache } from "@/lib/db";
import { eq, desc, sql, and, or, lt, gte, ilike, lte } from "drizzle-orm";
import { GoogleGenAI } from "@google/genai";

// Lazy-init Gemini client
let geminiClient: GoogleGenAI | null = null;
function getGemini() {
  if (!geminiClient && process.env.GOOGLE_AI_API_KEY) {
    geminiClient = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });
  }
  return geminiClient;
}

// Background AI analysis - doesn't block response
async function fetchAIDetailsInBackground(
  wordId: string,
  word: string,
  contextSentence: string | null,
  targetLanguage: string,
  nativeLanguage: string,
  cefrLevel: string
) {
  try {
    const gemini = getGemini();
    if (!gemini) {
      console.error("Gemini client not available - missing GOOGLE_AI_API_KEY");
      return;
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
    if (!content) return;

    const analysis = JSON.parse(content);

    // Update the saved word with AI details
    await db.update(savedWords)
      .set({
        translation: analysis.translation,
        partOfSpeech: analysis.pos,
        article: analysis.article || null,
        example: analysis.example,
        notes: analysis.explanation,
      })
      .where(eq(savedWords.id, wordId));

    // Also cache it for future lookups
    await db.insert(wordCache)
      .values({
        word: word.toLowerCase(),
        targetLanguage,
        cefrLevel,
        translation: analysis.translation,
        partOfSpeech: analysis.pos,
        article: analysis.article || null,
        example: analysis.example,
      })
      .onConflictDoNothing();

    console.log(`[Background AI] Updated word "${word}" with AI analysis`);
  } catch (err) {
    console.error(`[Background AI] Failed to analyze word "${word}":`, err);
  }
}

// GET - List saved words
export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const filter = searchParams.get("filter") || "all"; // all, review, mastered
    const search = searchParams.get("search") || "";
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    // Get user ID
    const user = await db.query.users.findFirst({
      where: eq(users.clerkId, userId),
      columns: { id: true },
    });

    if (!user) {
      return NextResponse.json({ words: [], total: 0 });
    }

    // Build where conditions
    const conditions = [eq(savedWords.userId, user.id)];

    if (filter === "review") {
      const now = new Date().toISOString();
      conditions.push(
        and(
          or(
            sql`${savedWords.nextReviewAt} IS NULL`,
            lte(savedWords.nextReviewAt, new Date(now))
          ),
          lt(savedWords.masteryLevel, 5)
        )!
      );
    } else if (filter === "mastered") {
      conditions.push(gte(savedWords.masteryLevel, 5));
    }

    if (search) {
      conditions.push(ilike(savedWords.word, `%${search}%`));
    }

    const whereClause = and(...conditions);

    // Get words with count
    const [wordsList, countResult] = await Promise.all([
      db.query.savedWords.findMany({
        where: whereClause,
        orderBy: desc(savedWords.createdAt),
        limit,
        offset,
      }),
      db
        .select({ count: sql<number>`count(*)` })
        .from(savedWords)
        .where(whereClause),
    ]);

    return NextResponse.json({
      words: wordsList,
      total: Number(countResult[0]?.count || 0),
    });
  } catch (error) {
    console.error("Error in vocabulary API:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST - Save a word
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      word,
      contextSentence,
      translation,
      partOfSpeech,
      article,
      example,
      targetLanguage,
      sourceArticleId,
      fetchAIDetails, // If true, fetch AI analysis in background
    } = body;

    if (!word || !targetLanguage) {
      return NextResponse.json(
        { error: "Word and target language are required" },
        { status: 400 }
      );
    }

    // Get or create user
    let user = await db.query.users.findFirst({
      where: eq(users.clerkId, userId),
      columns: { id: true, nativeLanguage: true, cefrLevel: true },
    });

    if (!user) {
      const [newUser] = await db
        .insert(users)
        .values({ clerkId: userId })
        .returning({ id: users.id, nativeLanguage: users.nativeLanguage, cefrLevel: users.cefrLevel });
      user = newUser;
    }

    // Check for duplicate
    const existing = await db.query.savedWords.findFirst({
      where: and(
        eq(savedWords.userId, user.id),
        eq(savedWords.word, word.toLowerCase()),
        eq(savedWords.targetLanguage, targetLanguage)
      ),
      columns: { id: true },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Word already saved (duplicate)" },
        { status: 409 }
      );
    }

    // Save word
    const [savedWord] = await db
      .insert(savedWords)
      .values({
        userId: user.id,
        word: word.toLowerCase(),
        contextSentence,
        translation,
        partOfSpeech,
        article,
        example,
        targetLanguage,
        sourceArticleId,
        masteryLevel: 0,
        nextReviewAt: new Date(),
      })
      .returning();

    // If requested, fetch AI details in background (fire and forget)
    if (fetchAIDetails && !translation) {
      fetchAIDetailsInBackground(
        savedWord.id,
        word,
        contextSentence || null,
        targetLanguage,
        user.nativeLanguage || "English",
        user.cefrLevel || "B1"
      ).catch(err => console.error("[Background AI] Error:", err));
    }

    return NextResponse.json(savedWord);
  } catch (error) {
    console.error("Error saving word:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
