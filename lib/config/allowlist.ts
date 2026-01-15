import { db, allowlist } from "@/lib/db";

// Legacy hardcoded allowlist - will be migrated to database
// These entries should be seeded to the DB, then this list can be removed
const LEGACY_ALLOWED_LIST: string[] = [
  "withpretzel.com",
  "prasoon2211@gmail.com",
  "c.scalisi22@gmail.com",
  "ramsey.wise@gmail.com",
  "fernandes.tanja@gmail.com",
];

/**
 * Check if an email is in the allowlist (database + legacy fallback).
 * Checks database first, falls back to legacy hardcoded list if DB is empty.
 */
export async function isEmailAllowed(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;

  const emailLower = email.toLowerCase();
  const emailDomain = emailLower.split("@")[1];

  try {
    // Fetch all allowlist entries from database
    const entries = await db.query.allowlist.findMany({
      columns: { entry: true, type: true },
    });

    // If database has entries, use those
    if (entries.length > 0) {
      return entries.some((row) => {
        if (row.type === "domain") {
          // Domain match
          return emailDomain === row.entry;
        }
        // Email match
        return emailLower === row.entry;
      });
    }

    // Fallback to legacy list if database is empty
    // This ensures the app works during migration
    if (LEGACY_ALLOWED_LIST.length === 0) return true;

    return LEGACY_ALLOWED_LIST.some((entry) => {
      const entryLower = entry.toLowerCase().replace(/^@/, "");

      if (!entryLower.includes("@")) {
        return emailDomain === entryLower;
      }
      return emailLower === entryLower;
    });
  } catch (error) {
    console.error("Error checking allowlist:", error);
    // On DB error, fall back to legacy list for safety
    return LEGACY_ALLOWED_LIST.some((entry) => {
      const entryLower = entry.toLowerCase().replace(/^@/, "");
      if (!entryLower.includes("@")) {
        return emailDomain === entryLower;
      }
      return emailLower === entryLower;
    });
  }
}

/**
 * Get the legacy allowlist entries for seeding the database.
 */
export function getLegacyAllowlist(): { entry: string; type: "email" | "domain" }[] {
  return LEGACY_ALLOWED_LIST.map((entry) => {
    const normalized = entry.toLowerCase().replace(/^@/, "");
    const isEmail = normalized.includes("@");
    return {
      entry: normalized,
      type: isEmail ? "email" as const : "domain" as const,
    };
  });
}
