import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db, users, articles } from "@/lib/db";
import { eq, and } from "drizzle-orm";

// GET - Get article translation status (lightweight endpoint for polling)
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

    // Get article status only
    const article = await db.query.articles.findFirst({
      where: and(eq(articles.id, id), eq(articles.userId, user.id)),
      columns: {
        id: true,
        status: true,
        translationProgress: true,
        totalParagraphs: true,
        errorMessage: true,
        title: true,
      },
    });

    if (!article) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }

    return NextResponse.json(article);
  } catch (error) {
    console.error("Error fetching article status:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
