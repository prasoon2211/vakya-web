import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db, users, savedWords, wordCache, wordContexts } from "@/lib/db";
import { eq, desc, sql, and, or, lt, gte, ilike, lte } from "drizzle-orm";
import { GoogleGenAI } from "@google/genai";
import { lemmatizeWord, formatFormType, cleanWord } from "@/lib/dictionary/lemmatizer";

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
  "lemma": "the dictionary/base form of the word (e.g., infinitive for verbs, singular for nouns)",
  "formType": "how this word relates to its base form (e.g., 'plural', 'past_participle', 'conjugated_form') or null if this IS the base form",
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
    console.log(`[Background AI] Response for "${word}":`, JSON.stringify(analysis));

    // Build update object with AI details
    const updateData: {
      translation?: string;
      partOfSpeech?: string;
      article?: string | null;
      example?: string;
      notes?: string;
      word?: string;
      lemma?: string;
      formType?: string | null;
    } = {
      translation: analysis.translation,
      partOfSpeech: analysis.pos,
      article: analysis.article || null,
      example: analysis.example,
      notes: analysis.explanation,
    };

    // If AI provided a different lemma, update it
    // (AI may know better for words not in our dictionary)
    console.log(`[Background AI] Checking lemma: AI returned "${analysis.lemma}", we have "${word}"`);
    if (analysis.lemma && analysis.lemma.toLowerCase() !== word.toLowerCase()) {
      const aiLemma = analysis.lemma.toLowerCase();
      console.log(`[Background AI] Lemma differs! Will update to "${aiLemma}"`);

      // Check if user already has a word with this lemma (to avoid duplicates)
      const existingWithLemma = await db.query.savedWords.findFirst({
        where: and(
          eq(savedWords.lemma, aiLemma),
          sql`${savedWords.id} != ${wordId}`
        ),
      });

      if (!existingWithLemma) {
        // Safe to update - no duplicate exists
        updateData.word = aiLemma;
        updateData.lemma = aiLemma;
        updateData.formType = analysis.formType || null;
        console.log(`[Background AI] No duplicate, updating word and lemma to "${aiLemma}"`);
      } else {
        console.log(`[Background AI] Duplicate exists, skipping lemma update`);
      }
    } else {
      console.log(`[Background AI] Lemma same or not provided, not updating`);
    }

    // Update the saved word with AI details
    await db.update(savedWords)
      .set(updateData)
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

// POST - Save a word (with lemmatization)
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
      addContextOnly, // If true, just add context to existing word (don't save new)
    } = body;

    if (!word || !targetLanguage) {
      return NextResponse.json(
        { error: "Word and target language are required" },
        { status: 400 }
      );
    }

    // Clean the word - strip punctuation
    const cleanedWord = cleanWord(word.trim());
    if (!cleanedWord) {
      return NextResponse.json(
        { error: "Word is empty after cleaning punctuation" },
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

    // Lemmatize the word to find its base form
    const lemmaResult = lemmatizeWord(cleanedWord, targetLanguage);
    const lemma = lemmaResult.lemma;
    const originalForm = cleanedWord.toLowerCase();
    const formType = lemmaResult.formType;

    // Check for existing word by lemma (preferred) or word (fallback for old data)
    const existing = await db.query.savedWords.findFirst({
      where: and(
        eq(savedWords.userId, user.id),
        eq(savedWords.targetLanguage, targetLanguage),
        or(
          eq(savedWords.lemma, lemma),
          // Fallback: check word field for old entries without lemma
          and(
            sql`${savedWords.lemma} IS NULL`,
            eq(savedWords.word, lemma)
          ),
          // Also check if exact word matches (even if lemma differs)
          eq(savedWords.word, originalForm)
        )
      ),
    });

    if (existing) {
      // Word (or its lemma) already saved
      // Update forms_seen and add new context if provided
      const formsSeen: string[] = existing.formsSeen
        ? JSON.parse(existing.formsSeen)
        : [existing.originalForm || existing.word];

      // Add the new form if not already seen
      if (!formsSeen.includes(originalForm)) {
        formsSeen.push(originalForm);
      }

      // Update the saved word
      await db.update(savedWords)
        .set({
          formsSeen: JSON.stringify(formsSeen),
          encounterCount: existing.encounterCount + 1,
          // Update lemma if not set (for old entries)
          lemma: existing.lemma || lemma,
          // Update form type if this is a more specific form
          formType: existing.formType || formType,
        })
        .where(eq(savedWords.id, existing.id));

      // Add new context if provided
      if (contextSentence) {
        await db.insert(wordContexts).values({
          savedWordId: existing.id,
          contextSentence,
          encounteredForm: originalForm,
          sourceArticleId: sourceArticleId || null,
        });
      }

      // If only adding context, return success with special flag
      if (addContextOnly) {
        return NextResponse.json({
          ...existing,
          contextAdded: true,
          formsSeen,
        });
      }

      // Return conflict for regular save attempts
      return NextResponse.json(
        {
          error: "Word already saved",
          existingWord: {
            id: existing.id,
            word: existing.word,
            lemma: existing.lemma || lemma,
            formsSeen,
          },
          contextAdded: !!contextSentence,
        },
        { status: 409 }
      );
    }

    // Save new word with lemma info
    const [savedWord] = await db
      .insert(savedWords)
      .values({
        userId: user.id,
        word: lemma, // Store lemma as the primary word
        lemma,
        originalForm,
        formType,
        formsSeen: JSON.stringify([originalForm]),
        encounterCount: 1,
        contextSentence,
        translation,
        partOfSpeech: partOfSpeech || (lemmaResult.entry?.partOfSpeech ?? null),
        article: article || (lemmaResult.entry?.article ?? null),
        example,
        targetLanguage,
        sourceArticleId,
        masteryLevel: 0,
        nextReviewAt: new Date(),
      })
      .returning();

    // Also add context to word_contexts table if provided
    if (contextSentence) {
      await db.insert(wordContexts).values({
        savedWordId: savedWord.id,
        contextSentence,
        encounteredForm: originalForm,
        sourceArticleId: sourceArticleId || null,
      });
    }

    // Fetch AI details in background if:
    // 1. Explicitly requested AND no translation provided, OR
    // 2. Dictionary couldn't lemmatize (lemma === original word) - AI might know the base form
    const dictionaryCouldntLemmatize = lemma === originalForm;
    if ((fetchAIDetails && !translation) || dictionaryCouldntLemmatize) {
      console.log(`[Background AI] Triggering for "${lemma}" (dictionaryCouldntLemmatize=${dictionaryCouldntLemmatize})`);
      fetchAIDetailsInBackground(
        savedWord.id,
        lemma, // Use lemma for AI lookup
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
