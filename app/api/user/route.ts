import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db, users } from "@/lib/db";
import { eq } from "drizzle-orm";

// GET - Get or create user
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user exists
    const existingUser = await db.query.users.findFirst({
      where: eq(users.clerkId, userId),
    });

    if (existingUser) {
      return NextResponse.json(existingUser);
    }

    // Create new user
    const clerkUser = await currentUser();
    const [newUser] = await db
      .insert(users)
      .values({
        clerkId: userId,
        email: clerkUser?.emailAddresses[0]?.emailAddress || null,
      })
      .returning();

    return NextResponse.json(newUser);
  } catch (error) {
    console.error("Error in user API:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
