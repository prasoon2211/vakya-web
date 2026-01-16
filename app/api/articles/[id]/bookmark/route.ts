import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db, users, articles } from "@/lib/db";
import { eq, and } from "drizzle-orm";

// GET - Get bookmark for article
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

    // Get article bookmark
    const article = await db.query.articles.findFirst({
      where: and(eq(articles.id, id), eq(articles.userId, user.id)),
      columns: { bookmarkWordIndex: true },
    });

    if (!article) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }

    return NextResponse.json({ bookmarkWordIndex: article.bookmarkWordIndex });
  } catch (error) {
    console.error("Error fetching bookmark:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST - Set bookmark
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
    const body = await request.json();
    const { wordIndex } = body;

    if (typeof wordIndex !== "number" || wordIndex < 0) {
      return NextResponse.json({ error: "Invalid word index" }, { status: 400 });
    }

    // Get user ID
    const user = await db.query.users.findFirst({
      where: eq(users.clerkId, userId),
      columns: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Update article bookmark
    const result = await db
      .update(articles)
      .set({
        bookmarkWordIndex: wordIndex,
        updatedAt: new Date(),
      })
      .where(and(eq(articles.id, id), eq(articles.userId, user.id)))
      .returning({ bookmarkWordIndex: articles.bookmarkWordIndex });

    if (result.length === 0) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }

    return NextResponse.json({ bookmarkWordIndex: result[0].bookmarkWordIndex });
  } catch (error) {
    console.error("Error setting bookmark:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE - Clear bookmark
export async function DELETE(
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

    // Clear bookmark
    const result = await db
      .update(articles)
      .set({
        bookmarkWordIndex: null,
        updatedAt: new Date(),
      })
      .where(and(eq(articles.id, id), eq(articles.userId, user.id)))
      .returning({ id: articles.id });

    if (result.length === 0) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error clearing bookmark:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
