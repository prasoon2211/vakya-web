import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isEmailAllowed } from "@/lib/config/allowlist";

/**
 * Check if the current user has access to the app.
 * Use at the start of API routes:
 *
 * const accessError = await checkAccess();
 * if (accessError) return accessError;
 */
export async function checkAccess(): Promise<NextResponse | null> {
  const user = await currentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const email = user.emailAddresses?.[0]?.emailAddress;

  if (!isEmailAllowed(email)) {
    return NextResponse.json(
      { error: "Access restricted. Please contact the site owner." },
      { status: 403 }
    );
  }

  return null; // Access granted
}
