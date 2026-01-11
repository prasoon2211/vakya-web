import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db, users, savedWords } from "@/lib/db";
import { eq, desc, sql, and, or, lt, gte, ilike, lte } from "drizzle-orm";

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
      columns: { id: true },
    });

    if (!user) {
      const [newUser] = await db
        .insert(users)
        .values({ clerkId: userId })
        .returning({ id: users.id });
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

    return NextResponse.json(savedWord);
  } catch (error) {
    console.error("Error saving word:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
