import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db, allowlist } from "@/lib/db";
import { desc } from "drizzle-orm";
import { checkAdminAccess } from "@/lib/auth/admin";

// GET - List all allowlist entries
export async function GET() {
  const error = await checkAdminAccess();
  if (error) return error;

  try {
    const entries = await db.query.allowlist.findMany({
      orderBy: [desc(allowlist.createdAt)],
    });

    return NextResponse.json({ entries });
  } catch (error) {
    console.error("Error fetching allowlist:", error);
    return NextResponse.json(
      { error: "Failed to fetch allowlist" },
      { status: 500 }
    );
  }
}

// POST - Add new allowlist entry
export async function POST(request: Request) {
  const error = await checkAdminAccess();
  if (error) return error;

  try {
    const user = await currentUser();
    const body = await request.json();
    const { entry, notes } = body;

    if (!entry || typeof entry !== "string") {
      return NextResponse.json(
        { error: "Entry is required" },
        { status: 400 }
      );
    }

    // Normalize entry and determine type
    const normalizedEntry = entry.toLowerCase().trim().replace(/^@/, "");

    // Detect if it's a domain or email
    const isEmail = normalizedEntry.includes("@");
    const type = isEmail ? "email" : "domain";

    // Check if entry already exists
    const existing = await db.query.allowlist.findFirst({
      where: (t, { eq }) => eq(t.entry, normalizedEntry),
    });

    if (existing) {
      return NextResponse.json(
        { error: "Entry already exists in allowlist" },
        { status: 409 }
      );
    }

    // Insert new entry
    const [newEntry] = await db
      .insert(allowlist)
      .values({
        entry: normalizedEntry,
        type,
        notes: notes || null,
        addedBy: user?.id || null,
      })
      .returning();

    return NextResponse.json({ entry: newEntry }, { status: 201 });
  } catch (error) {
    console.error("Error adding allowlist entry:", error);
    return NextResponse.json(
      { error: "Failed to add allowlist entry" },
      { status: 500 }
    );
  }
}
