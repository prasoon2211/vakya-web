import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db, users } from "@/lib/db";
import { eq } from "drizzle-orm";

// GET - Get user settings
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.clerkId, userId),
      columns: {
        nativeLanguage: true,
        targetLanguage: true,
        cefrLevel: true,
      },
    });

    if (!user) {
      // User might not exist yet, return defaults
      return NextResponse.json({
        nativeLanguage: "English",
        targetLanguage: "German",
        cefrLevel: "B1",
      });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error("Error fetching settings:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH - Update user settings
export async function PATCH(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { nativeLanguage, targetLanguage, cefrLevel } = body;

    // Upsert user settings
    const [updatedUser] = await db
      .insert(users)
      .values({
        clerkId: userId,
        nativeLanguage,
        targetLanguage,
        cefrLevel,
      })
      .onConflictDoUpdate({
        target: users.clerkId,
        set: {
          nativeLanguage,
          targetLanguage,
          cefrLevel,
          updatedAt: new Date(),
        },
      })
      .returning();

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error("Error updating settings:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
