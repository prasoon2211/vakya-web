import { NextResponse } from "next/server";
import { db, allowlist } from "@/lib/db";
import { eq } from "drizzle-orm";
import { checkAdminAccess } from "@/lib/auth/admin";

// DELETE - Remove allowlist entry
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const error = await checkAdminAccess();
  if (error) return error;

  try {
    const { id } = await params;

    // Check if entry exists
    const existing = await db.query.allowlist.findFirst({
      where: eq(allowlist.id, id),
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Entry not found" },
        { status: 404 }
      );
    }

    // Delete entry
    await db.delete(allowlist).where(eq(allowlist.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting allowlist entry:", error);
    return NextResponse.json(
      { error: "Failed to delete allowlist entry" },
      { status: 500 }
    );
  }
}
