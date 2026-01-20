import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { db, users, articles, savedWords, allowlist } from "@/lib/db";
import { desc, eq, count, sql, and } from "drizzle-orm";
import { checkAdminAccess } from "@/lib/auth/admin";

// GET - List all users with stats
export async function GET() {
  const error = await checkAdminAccess();
  if (error) return error;

  try {
    // Get all users
    const allUsers = await db
      .select()
      .from(users)
      .orderBy(desc(users.createdAt));

    // Get article counts per user
    const articleCounts = await db
      .select({
        userId: articles.userId,
        total: count(),
        completed: sql<number>`COUNT(*) FILTER (WHERE status = 'completed')`.as('completed'),
        lastActiveAt: sql<string | null>`MAX(created_at)::text`.as('last_active'),
      })
      .from(articles)
      .groupBy(articles.userId);

    // Get saved words counts per user
    const wordCounts = await db
      .select({
        userId: savedWords.userId,
        total: count(),
      })
      .from(savedWords)
      .groupBy(savedWords.userId);

    // Create lookup maps
    const articleMap = new Map(articleCounts.map(a => [a.userId, a]));
    const wordMap = new Map(wordCounts.map(w => [w.userId, w.total]));

    // Merge data
    const usersWithStats = allUsers.map(user => ({
      id: user.id,
      clerkId: user.clerkId,
      email: user.email,
      targetLanguage: user.targetLanguage,
      cefrLevel: user.cefrLevel,
      createdAt: user.createdAt,
      articleCount: articleMap.get(user.id)?.total ?? 0,
      completedArticles: articleMap.get(user.id)?.completed ?? 0,
      savedWordsCount: wordMap.get(user.id) ?? 0,
      lastActiveAt: articleMap.get(user.id)?.lastActiveAt ?? null,
    }));

    // Fetch Clerk user details for each user
    const clerk = await clerkClient();
    const usersWithClerkInfo = await Promise.all(
      usersWithStats.map(async (user) => {
        try {
          const clerkUser = await clerk.users.getUser(user.clerkId);
          return {
            ...user,
            clerkEmail: clerkUser.emailAddresses?.[0]?.emailAddress || null,
            clerkName: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null,
            clerkImageUrl: clerkUser.imageUrl || null,
          };
        } catch {
          // User might not exist in Clerk (old dev users)
          return {
            ...user,
            clerkEmail: null,
            clerkName: null,
            clerkImageUrl: null,
          };
        }
      })
    );

    // Get summary stats
    const totalUsers = usersWithStats.length;
    const totalArticles = usersWithStats.reduce((sum, u) => sum + (u.articleCount || 0), 0);
    const totalWords = usersWithStats.reduce((sum, u) => sum + (u.savedWordsCount || 0), 0);

    return NextResponse.json({
      users: usersWithClerkInfo,
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

// POST - Port account from old clerk_id to new clerk_id
export async function POST(request: Request) {
  const error = await checkAdminAccess();
  if (error) return error;

  try {
    const { oldClerkId, newClerkId } = await request.json();

    if (!oldClerkId || !newClerkId) {
      return NextResponse.json(
        { error: "Both oldClerkId and newClerkId are required" },
        { status: 400 }
      );
    }

    if (oldClerkId === newClerkId) {
      return NextResponse.json(
        { error: "Old and new Clerk IDs must be different" },
        { status: 400 }
      );
    }

    // Find both users
    const oldUser = await db.query.users.findFirst({
      where: eq(users.clerkId, oldClerkId),
    });

    const newUser = await db.query.users.findFirst({
      where: eq(users.clerkId, newClerkId),
    });

    if (!oldUser) {
      return NextResponse.json(
        { error: `No user found with clerk_id: ${oldClerkId}` },
        { status: 404 }
      );
    }

    // Get stats for old user
    const oldUserArticles = await db
      .select({ count: count() })
      .from(articles)
      .where(eq(articles.userId, oldUser.id));

    const oldUserWords = await db
      .select({ count: count() })
      .from(savedWords)
      .where(eq(savedWords.userId, oldUser.id));

    const oldStats = {
      articles: oldUserArticles[0]?.count ?? 0,
      words: oldUserWords[0]?.count ?? 0,
    };

    // Get stats for new user (if exists)
    let newStats = { articles: 0, words: 0 };
    if (newUser) {
      const newUserArticles = await db
        .select({ count: count() })
        .from(articles)
        .where(eq(articles.userId, newUser.id));

      const newUserWords = await db
        .select({ count: count() })
        .from(savedWords)
        .where(eq(savedWords.userId, newUser.id));

      newStats = {
        articles: newUserArticles[0]?.count ?? 0,
        words: newUserWords[0]?.count ?? 0,
      };
    }

    // Warn if new user has data that will be lost
    if (newStats.articles > 0 || newStats.words > 0) {
      return NextResponse.json({
        warning: true,
        message: `New user has ${newStats.articles} articles and ${newStats.words} saved words that will be DELETED. Send confirmDelete: true to proceed.`,
        oldUser: { id: oldUser.id, clerkId: oldClerkId, ...oldStats },
        newUser: { id: newUser?.id, clerkId: newClerkId, ...newStats },
      });
    }

    // Perform the port
    // 1. Delete new user if exists (cascade will delete their data)
    if (newUser) {
      await db.delete(users).where(eq(users.id, newUser.id));
    }

    // 2. Update old user's clerk_id to new clerk_id
    await db
      .update(users)
      .set({ clerkId: newClerkId, updatedAt: new Date() })
      .where(eq(users.id, oldUser.id));

    // 3. Update allowlist.added_by if it references old clerk_id
    await db
      .update(allowlist)
      .set({ addedBy: newClerkId })
      .where(eq(allowlist.addedBy, oldClerkId));

    return NextResponse.json({
      success: true,
      message: `Successfully ported account. ${oldStats.articles} articles and ${oldStats.words} saved words are now accessible with new Clerk ID.`,
      ported: {
        userId: oldUser.id,
        oldClerkId,
        newClerkId,
        articles: oldStats.articles,
        words: oldStats.words,
      },
    });
  } catch (error) {
    console.error("Error porting account:", error);
    return NextResponse.json(
      { error: "Failed to port account" },
      { status: 500 }
    );
  }
}
