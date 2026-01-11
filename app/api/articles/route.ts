import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db, users, articles } from "@/lib/db";
import { eq, desc, sql } from "drizzle-orm";

// GET - List user's articles
export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = parseInt(searchParams.get("offset") || "0");

    // First get the user's internal ID
    const user = await db.query.users.findFirst({
      where: eq(users.clerkId, userId),
      columns: { id: true },
    });

    if (!user) {
      return NextResponse.json({ articles: [], total: 0 });
    }

    // Get articles with count
    const [articlesList, countResult] = await Promise.all([
      db.query.articles.findMany({
        where: eq(articles.userId, user.id),
        orderBy: desc(articles.createdAt),
        limit,
        offset,
      }),
      db
        .select({ count: sql<number>`count(*)` })
        .from(articles)
        .where(eq(articles.userId, user.id)),
    ]);

    return NextResponse.json({
      articles: articlesList,
      total: Number(countResult[0]?.count || 0),
    });
  } catch (error) {
    console.error("Error in articles API:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
