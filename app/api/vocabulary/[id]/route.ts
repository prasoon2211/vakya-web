import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db, users, savedWords } from "@/lib/db";
import { eq, and } from "drizzle-orm";

// PATCH - Update a saved word
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    // Build updates object with explicit types
    const updates: {
      notes?: string;
      masteryLevel?: number;
      nextReviewAt?: Date;
      translation?: string;
      example?: string;
    } = {};

    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.masteryLevel !== undefined) updates.masteryLevel = body.masteryLevel;
    if (body.nextReviewAt !== undefined) updates.nextReviewAt = new Date(body.nextReviewAt);
    if (body.translation !== undefined) updates.translation = body.translation;
    if (body.example !== undefined) updates.example = body.example;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    // Get user ID
    const user = await db.query.users.findFirst({
      where: eq(users.clerkId, userId),
      columns: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Update word
    const [updatedWord] = await db
      .update(savedWords)
      .set(updates)
      .where(and(eq(savedWords.id, id), eq(savedWords.userId, user.id)))
      .returning();

    if (!updatedWord) {
      return NextResponse.json({ error: "Word not found" }, { status: 404 });
    }

    return NextResponse.json(updatedWord);
  } catch (error) {
    console.error("Error updating word:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE - Delete a saved word
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Get user ID
    const user = await db.query.users.findFirst({
      where: eq(users.clerkId, userId),
      columns: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Delete word
    await db
      .delete(savedWords)
      .where(and(eq(savedWords.id, id), eq(savedWords.userId, user.id)));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting word:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
