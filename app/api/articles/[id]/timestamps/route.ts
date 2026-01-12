import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db, users, articles } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import type { WordTimestamp } from "@/lib/audio/align-timestamps";

// GET - Get word timestamps for article audio
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Get user ID
    const user = await db.query.users.findFirst({
      where: eq(users.clerkId, userId),
      columns: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get article with timestamps
    const article = await db.query.articles.findFirst({
      where: and(eq(articles.id, id), eq(articles.userId, user.id)),
      columns: {
        audioTimestamps: true,
        audioUrl: true,
      },
    });

    if (!article) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }

    if (!article.audioUrl) {
      return NextResponse.json(
        { error: "No audio available for this article" },
        { status: 404 }
      );
    }

    if (!article.audioTimestamps) {
      return NextResponse.json(
        { error: "No timestamps available for this article" },
        { status: 404 }
      );
    }

    // Parse and return timestamps
    let timestamps: WordTimestamp[];
    try {
      timestamps = JSON.parse(article.audioTimestamps);
    } catch {
      return NextResponse.json(
        { error: "Invalid timestamp data" },
        { status: 500 }
      );
    }

    return NextResponse.json({ timestamps });
  } catch (error) {
    console.error("Error getting timestamps:", error);
    return NextResponse.json(
      { error: "Failed to get timestamps" },
      { status: 500 }
    );
  }
}
