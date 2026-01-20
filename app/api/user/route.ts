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

    // Get Clerk user info
    const clerkUser = await currentUser();
    const clerkEmail = clerkUser?.emailAddresses?.find(e => e.id === clerkUser.primaryEmailAddressId)?.emailAddress
      || clerkUser?.emailAddresses?.[0]?.emailAddress
      || null;

    // Check if user exists
    const existingUser = await db.query.users.findFirst({
      where: eq(users.clerkId, userId),
    });

    if (existingUser) {
      // Sync email if missing or changed
      if (clerkEmail && existingUser.email !== clerkEmail) {
        const [updatedUser] = await db
          .update(users)
          .set({ email: clerkEmail, updatedAt: new Date() })
          .where(eq(users.id, existingUser.id))
          .returning();
        return NextResponse.json(updatedUser);
      }
      return NextResponse.json(existingUser);
    }

    // Create new user
    const [newUser] = await db
      .insert(users)
      .values({
        clerkId: userId,
        email: clerkEmail,
      })
      .returning();

    return NextResponse.json(newUser);
  } catch (error) {
    console.error("Error in user API:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
