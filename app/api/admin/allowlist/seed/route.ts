import { NextResponse } from "next/server";
import { db, allowlist } from "@/lib/db";
import { checkAdminAccess } from "@/lib/auth/admin";
import { getLegacyAllowlist } from "@/lib/config/allowlist";
import { currentUser } from "@clerk/nextjs/server";

// POST - Seed legacy allowlist entries to database
export async function POST() {
  const error = await checkAdminAccess();
  if (error) return error;

  try {
    const user = await currentUser();
    const legacyEntries = getLegacyAllowlist();

    // Check existing entries
    const existing = await db.query.allowlist.findMany({
      columns: { entry: true },
    });
    const existingSet = new Set(existing.map((e) => e.entry));

    // Filter out entries that already exist
    const newEntries = legacyEntries.filter((e) => !existingSet.has(e.entry));

    if (newEntries.length === 0) {
      return NextResponse.json({
        message: "All legacy entries already exist in database",
        added: 0,
        skipped: legacyEntries.length,
      });
    }

    // Insert new entries
    const inserted = await db
      .insert(allowlist)
      .values(
        newEntries.map((e) => ({
          entry: e.entry,
          type: e.type,
          notes: "Migrated from legacy hardcoded list",
          addedBy: user?.id || null,
        }))
      )
      .returning();

    return NextResponse.json({
      message: "Legacy entries seeded successfully",
      added: inserted.length,
      skipped: legacyEntries.length - newEntries.length,
      entries: inserted,
    });
  } catch (error) {
    console.error("Error seeding allowlist:", error);
    return NextResponse.json(
      { error: "Failed to seed allowlist" },
      { status: 500 }
    );
  }
}
