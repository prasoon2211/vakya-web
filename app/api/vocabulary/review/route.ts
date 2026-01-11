import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db, users, savedWords } from "@/lib/db";
import { eq, and } from "drizzle-orm";

// SM-2 algorithm intervals (in days)
const SM2_INTERVALS = [1, 3, 7, 14, 30, 60];

// POST - Submit review result
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { wordId, rating } = body; // rating: 0=again, 1=hard, 2=good, 3=easy

    if (!wordId || rating === undefined) {
      return NextResponse.json(
        { error: "Word ID and rating are required" },
        { status: 400 }
      );
    }

    // Get user ID
    const user = await db.query.users.findFirst({
      where: eq(users.clerkId, userId),
      columns: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get current word
    const word = await db.query.savedWords.findFirst({
      where: and(eq(savedWords.id, wordId), eq(savedWords.userId, user.id)),
      columns: { masteryLevel: true },
    });

    if (!word) {
      return NextResponse.json({ error: "Word not found" }, { status: 404 });
    }

    // Calculate new mastery level and next review date
    let newMasteryLevel = word.masteryLevel;

    if (rating === 0) {
      // Again - reset to 0
      newMasteryLevel = 0;
    } else if (rating === 1) {
      // Hard - stay at current level
      newMasteryLevel = Math.max(0, word.masteryLevel);
    } else if (rating === 2) {
      // Good - increase by 1
      newMasteryLevel = Math.min(5, word.masteryLevel + 1);
    } else if (rating === 3) {
      // Easy - increase by 2
      newMasteryLevel = Math.min(5, word.masteryLevel + 2);
    }

    // Calculate next review date
    const intervalDays = SM2_INTERVALS[Math.min(newMasteryLevel, SM2_INTERVALS.length - 1)];
    const nextReviewAt = new Date();
    nextReviewAt.setDate(nextReviewAt.getDate() + intervalDays);

    // Update word
    const [updatedWord] = await db
      .update(savedWords)
      .set({
        masteryLevel: newMasteryLevel,
        nextReviewAt,
      })
      .where(and(eq(savedWords.id, wordId), eq(savedWords.userId, user.id)))
      .returning();

    return NextResponse.json({
      word: updatedWord,
      nextReviewIn: `${intervalDays} day${intervalDays > 1 ? "s" : ""}`,
    });
  } catch (error) {
    console.error("Error submitting review:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
