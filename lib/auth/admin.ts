import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Check if the current user is an admin.
 * Admin status is determined by the "role" field in Clerk's private metadata.
 *
 * To make a user an admin:
 * 1. Go to Clerk Dashboard → Users → Select user
 * 2. In "Private metadata", add: { "role": "admin" }
 */
export async function isAdmin(): Promise<boolean> {
  const user = await currentUser();
  if (!user) return false;

  // Check private metadata for admin role
  const privateMetadata = user.privateMetadata as { role?: string } | undefined;
  return privateMetadata?.role === "admin";
}

/**
 * Get current user's admin status and info.
 * Returns null if not logged in.
 */
export async function getAdminInfo(): Promise<{
  isAdmin: boolean;
  userId: string;
  email: string | null;
} | null> {
  const user = await currentUser();
  if (!user) return null;

  const privateMetadata = user.privateMetadata as { role?: string } | undefined;
  const email = user.emailAddresses?.[0]?.emailAddress || null;

  return {
    isAdmin: privateMetadata?.role === "admin",
    userId: user.id,
    email,
  };
}

/**
 * Check admin access for API routes.
 * Returns an error response if not admin, null if access granted.
 *
 * Usage:
 * const error = await checkAdminAccess();
 * if (error) return error;
 */
export async function checkAdminAccess(): Promise<NextResponse | null> {
  const user = await currentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const privateMetadata = user.privateMetadata as { role?: string } | undefined;

  if (privateMetadata?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  return null; // Access granted
}
