import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db, users } from "@/lib/db";
import { eq } from "drizzle-orm";

// GET - Get onboarding status
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.clerkId, userId),
      columns: {
        dashboardOnboardingAt: true,
        articleOnboardingAt: true,
      },
    });

    return NextResponse.json({
      dashboardCompleted: !!user?.dashboardOnboardingAt,
      articleCompleted: !!user?.articleOnboardingAt,
    });
  } catch (error) {
    console.error("Error fetching onboarding status:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST - Mark onboarding as complete
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { type } = body;

    if (!type || !["dashboard", "article"].includes(type)) {
      return NextResponse.json({ error: "Invalid onboarding type" }, { status: 400 });
    }

    const updateField = type === "dashboard"
      ? { dashboardOnboardingAt: new Date() }
      : { articleOnboardingAt: new Date() };

    // Upsert user with onboarding timestamp
    await db
      .insert(users)
      .values({
        clerkId: userId,
        ...updateField,
      })
      .onConflictDoUpdate({
        target: users.clerkId,
        set: {
          ...updateField,
          updatedAt: new Date(),
        },
      });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating onboarding status:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
