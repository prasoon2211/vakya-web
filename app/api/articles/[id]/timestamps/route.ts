import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db, users, articles } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import type { WordTimestamp } from "@/lib/audio/align-timestamps";
import { computeBridgeSentenceMap } from "@/lib/audio/bridge-mapping";

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

    // Get article with timestamps and bridge mapping
    const article = await db.query.articles.findFirst({
      where: and(eq(articles.id, id), eq(articles.userId, user.id)),
      columns: {
        audioTimestamps: true,
        audioUrl: true,
        bridgeSentenceMap: true,
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

    // Parse bridge sentence map if available
    let bridgeSentenceMap: number[] | null = null;
    if (article.bridgeSentenceMap) {
      try {
        bridgeSentenceMap = JSON.parse(article.bridgeSentenceMap);
      } catch {
        // Ignore parsing errors for bridge map
      }
    }

    return NextResponse.json({ timestamps, bridgeSentenceMap });
  } catch (error) {
    console.error("Error getting timestamps:", error);
    return NextResponse.json(
      { error: "Failed to get timestamps" },
      { status: 500 }
    );
  }
}

// POST - Regenerate bridge sentence mapping
export async function POST(
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

    // Get article with timestamps and content
    const article = await db.query.articles.findFirst({
      where: and(eq(articles.id, id), eq(articles.userId, user.id)),
      columns: {
        audioTimestamps: true,
        audioUrl: true,
        translatedContent: true,
        targetLanguage: true,
      },
    });

    if (!article) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }

    if (!article.audioUrl || !article.audioTimestamps) {
      return NextResponse.json(
        { error: "No audio or timestamps available for this article" },
        { status: 400 }
      );
    }

    // Parse timestamps
    let timestamps: WordTimestamp[];
    try {
      timestamps = JSON.parse(article.audioTimestamps);
    } catch {
      return NextResponse.json(
        { error: "Invalid timestamp data" },
        { status: 500 }
      );
    }

    // Parse translated content to get bridge text
    let bridgeText = "";
    if (article.translatedContent) {
      try {
        const blocks = JSON.parse(article.translatedContent);
        bridgeText = blocks
          .map((block: { bridge?: string }) => block.bridge || "")
          .filter(Boolean)
          .join(" ");
      } catch {
        // Ignore parsing errors
      }
    }

    if (!bridgeText) {
      return NextResponse.json(
        { error: "No bridge text available for mapping" },
        { status: 400 }
      );
    }

    // Regenerate bridge mapping
    console.log(`[Timestamps] Regenerating bridge mapping for article ${id}`);
    const mapping = await computeBridgeSentenceMap(timestamps, bridgeText, article.targetLanguage);

    // Save to database
    const bridgeSentenceMap = mapping.length > 0 ? JSON.stringify(mapping) : null;
    await db
      .update(articles)
      .set({ bridgeSentenceMap })
      .where(eq(articles.id, id));

    console.log(`[Timestamps] Regenerated bridge mapping with ${mapping.length} entries`);

    return NextResponse.json({ bridgeSentenceMap: mapping });
  } catch (error) {
    console.error("Error regenerating bridge mapping:", error);
    return NextResponse.json(
      { error: "Failed to regenerate bridge mapping" },
      { status: 500 }
    );
  }
}
