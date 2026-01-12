// Email/domain allowlist - only these users can access the app
// Can be:
//   - Full email: "user@example.com"
//   - Domain (allows all emails on that domain): "example.com" or "@example.com"
export const ALLOWED_LIST: string[] = [
  // Add allowed emails or domains here
  "withpretzel.com",
  "prasoon2211@gmail.com",
  "c.scalisi22@gmail.com",
];

export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;

  // If allowlist is empty, allow everyone (for development)
  if (ALLOWED_LIST.length === 0) return true;

  const emailLower = email.toLowerCase();
  const emailDomain = emailLower.split("@")[1];

  return ALLOWED_LIST.some((entry) => {
    const entryLower = entry.toLowerCase().replace(/^@/, ""); // Remove leading @ if present

    // Check if it's a domain (no @ in the entry after removing leading @)
    if (!entryLower.includes("@")) {
      // It's a domain - check if email's domain matches
      return emailDomain === entryLower;
    }

    // It's a full email - exact match
    return emailLower === entryLower;
  });
}
