/**
 * Utilities for sanitizing file names to be safe across:
 * - File systems (Windows, Mac, Linux)
 * - URLs
 * - Database storage
 * - Cloud storage keys (S3/R2)
 */

/**
 * Sanitizes a string to be safe for use as a file name or storage key.
 * Removes/replaces problematic characters while keeping it readable.
 */
export function sanitizeFileName(name: string): string {
  if (!name) return "untitled";

  // Step 1: Try to decode URL encoding
  let decoded = name;
  try {
    decoded = decodeURIComponent(name);
  } catch {
    // Already decoded or invalid encoding - use as is
  }

  // Step 2: Remove/replace problematic characters
  let safe = decoded
    // Remove null bytes and control characters
    .replace(/[\x00-\x1f\x7f]/g, "")
    // Replace path separators with dash
    .replace(/[/\\]/g, "-")
    // Replace reserved Windows characters with dash
    .replace(/[<>:"|?*]/g, "-")
    // Replace multiple spaces/dashes with single dash
    .replace(/[\s-]+/g, "-")
    // Remove leading/trailing dots and spaces (Windows issues)
    .replace(/^[\s.]+|[\s.]+$/g, "")
    // Keep only safe characters: alphanumeric, dash, underscore, dot
    // Plus common accented characters for internationalization
    .replace(/[^\w\-_.àáâãäåæçèéêëìíîïñòóôõöøùúûüýÿÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖØÙÚÛÜÝŸ]/gi, "");

  // Step 3: Ensure reasonable length (max 100 chars for safety)
  if (safe.length > 100) {
    safe = safe.substring(0, 100);
    // Don't end with a dash or dot
    safe = safe.replace(/[-._]+$/, "");
  }

  // Step 4: Ensure we have something
  if (!safe || safe === "-") {
    safe = "untitled";
  }

  return safe;
}

/**
 * Generates a unique, safe storage key for PDFs.
 * Format: pdfs/{uuid}_{safename}.pdf
 *
 * The UUID ensures uniqueness while the safe name aids debugging.
 */
export function generatePdfStorageKey(originalName: string): string {
  const uuid = crypto.randomUUID();
  const safeName = sanitizeFileName(originalName.replace(/\.pdf$/i, ""));

  // Keep safe name reasonably short for the key
  const truncatedName = safeName.substring(0, 50);

  return `pdfs/${uuid}_${truncatedName}.pdf`;
}

/**
 * Generates a safe, human-readable display title from a PDF filename.
 * Cleans up the name but keeps it readable.
 */
export function generatePdfTitle(originalName: string): string {
  // Remove extension
  const withoutExtension = originalName.replace(/\.pdf$/i, "");

  // Try to decode URL encoding
  let decoded = withoutExtension;
  try {
    decoded = decodeURIComponent(withoutExtension);
  } catch {
    // Use as-is
  }

  // Clean up common filename patterns
  const cleaned = decoded
    // Replace underscores and dashes with spaces
    .replace(/[-_]+/g, " ")
    // Replace multiple spaces with single space
    .replace(/\s+/g, " ")
    // Remove leading/trailing whitespace
    .trim();

  return cleaned || "Untitled PDF";
}

/**
 * Extracts a safe key name from a storage URL or path.
 */
export function extractStorageKey(urlOrPath: string): string {
  // Handle full URLs
  try {
    const url = new URL(urlOrPath);
    return url.pathname.replace(/^\//, "");
  } catch {
    // Not a URL, treat as path
  }

  // Remove leading slashes
  return urlOrPath.replace(/^\/+/, "");
}
