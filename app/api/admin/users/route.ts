import { NextResponse } from "next/server";
import { db, users, articles, savedWords } from "@/lib/db";
import { desc, eq, count, sql } from "drizzle-orm";
import { checkAdminAccess } from "@/lib/auth/admin";

// GET - List all users with stats
export async function GET() {
  const error = await checkAdminAccess();
  if (error) return error;

  try {
    // Get all users with their article and word counts
    const usersWithStats = await db
      .select({
        id: users.id,
        clerkId: users.clerkId,
        email: users.email,
        targetLanguage: users.targetLanguage,
        cefrLevel: users.cefrLevel,
        createdAt: users.createdAt,
        articleCount: sql<number>`(
          SELECT COUNT(*)::int
          FROM articles
          WHERE articles.user_id = ${users.id}
        )`,
        completedArticles: sql<number>`(
          SELECT COUNT(*)::int
          FROM articles
          WHERE articles.user_id = ${users.id}
          AND articles.status = 'completed'
        )`,
        savedWordsCount: sql<number>`(
          SELECT COUNT(*)::int
          FROM saved_words
          WHERE saved_words.user_id = ${users.id}
        )`,
        lastActiveAt: sql<string | null>`(
          SELECT MAX(created_at)::text
          FROM articles
          WHERE articles.user_id = ${users.id}
        )`,
      })
      .from(users)
      .orderBy(desc(users.createdAt));

    // Get summary stats
    const totalUsers = usersWithStats.length;
    const totalArticles = usersWithStats.reduce((sum, u) => sum + (u.articleCount || 0), 0);
    const totalWords = usersWithStats.reduce((sum, u) => sum + (u.savedWordsCount || 0), 0);

    return NextResponse.json({
      users: usersWithStats,
      stats: {
        totalUsers,
        totalArticles,
        totalWords,
      },
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}
