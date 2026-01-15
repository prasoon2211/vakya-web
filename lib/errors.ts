/**
 * Typed error system for consistent error handling across the app.
 * Each error type has:
 * - code: Machine-readable identifier
 * - message: Technical message for logs
 * - userMessage: Human-friendly message for UI
 * - isRetryable: Whether the operation can be retried
 * - httpStatus: Appropriate HTTP status code
 */

export class AppError extends Error {
  public readonly code: string;
  public readonly userMessage: string;
  public readonly isRetryable: boolean;
  public readonly httpStatus: number;

  constructor(opts: {
    code: string;
    message: string;
    userMessage: string;
    isRetryable?: boolean;
    httpStatus?: number;
  }) {
    super(opts.message);
    this.name = "AppError";
    this.code = opts.code;
    this.userMessage = opts.userMessage;
    this.isRetryable = opts.isRetryable ?? false;
    this.httpStatus = opts.httpStatus ?? 500;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      userMessage: this.userMessage,
      isRetryable: this.isRetryable,
    };
  }
}

// ============================================================================
// Fetch Errors
// ============================================================================

export class FetchError extends AppError {
  constructor(url: string, reason: string) {
    super({
      code: "FETCH_FAILED",
      message: `Failed to fetch ${url}: ${reason}`,
      userMessage:
        "Unable to fetch the article. The website may be blocking access or temporarily unavailable.",
      isRetryable: true,
      httpStatus: 502,
    });
  }
}

export class FetchTimeoutError extends AppError {
  constructor(url: string, timeoutMs: number) {
    super({
      code: "FETCH_TIMEOUT",
      message: `Fetch timed out after ${timeoutMs}ms for ${url}`,
      userMessage:
        "The website took too long to respond. Please try again.",
      isRetryable: true,
      httpStatus: 504,
    });
  }
}

// ============================================================================
// Content Extraction Errors
// ============================================================================

export class ExtractionError extends AppError {
  constructor(reason: string) {
    super({
      code: "EXTRACTION_FAILED",
      message: `Content extraction failed: ${reason}`,
      userMessage:
        "Could not extract readable content from this page. It may be behind a paywall or require login.",
      isRetryable: false,
      httpStatus: 422,
    });
  }
}

export class ContentTooShortError extends AppError {
  constructor(length: number, minLength: number) {
    super({
      code: "CONTENT_TOO_SHORT",
      message: `Content too short: ${length} chars (min: ${minLength})`,
      userMessage:
        "The extracted content is too short. This page may not contain enough readable text.",
      isRetryable: false,
      httpStatus: 422,
    });
  }
}

// ============================================================================
// Translation Errors
// ============================================================================

export class TranslationError extends AppError {
  constructor(reason: string, chunkIndex?: number) {
    super({
      code: "TRANSLATION_FAILED",
      message: chunkIndex !== undefined
        ? `Translation failed at chunk ${chunkIndex}: ${reason}`
        : `Translation failed: ${reason}`,
      userMessage:
        "Translation service encountered an error. Your progress has been saved - you can retry.",
      isRetryable: true,
      httpStatus: 502,
    });
  }
}

export class TranslationParseError extends AppError {
  constructor(response: string) {
    super({
      code: "TRANSLATION_PARSE_ERROR",
      message: `Failed to parse translation response: ${response.slice(0, 200)}`,
      userMessage:
        "Received an unexpected response from the translation service. Please try again.",
      isRetryable: true,
      httpStatus: 502,
    });
  }
}

// ============================================================================
// PDF Errors
// ============================================================================

export class PDFValidationError extends AppError {
  constructor(reason: string) {
    super({
      code: "PDF_INVALID",
      message: `PDF validation failed: ${reason}`,
      userMessage: reason, // Use specific message for PDF validation
      isRetryable: false,
      httpStatus: 400,
    });
  }
}

export class PDFExtractionError extends AppError {
  constructor(reason: string) {
    super({
      code: "PDF_EXTRACTION_FAILED",
      message: `PDF extraction failed: ${reason}`,
      userMessage:
        "Could not read this PDF. It may be scanned, corrupted, or password-protected.",
      isRetryable: false,
      httpStatus: 422,
    });
  }
}

export class PDFUploadError extends AppError {
  constructor(reason: string) {
    super({
      code: "PDF_UPLOAD_FAILED",
      message: `PDF upload failed: ${reason}`,
      userMessage:
        "Failed to upload the PDF. Please try again.",
      isRetryable: true,
      httpStatus: 502,
    });
  }
}

// ============================================================================
// Audio Errors
// ============================================================================

export class AudioGenerationError extends AppError {
  constructor(reason: string) {
    super({
      code: "AUDIO_GENERATION_FAILED",
      message: `Audio generation failed: ${reason}`,
      userMessage:
        "Could not generate audio. Please try again in a moment.",
      isRetryable: true,
      httpStatus: 502,
    });
  }
}

// ============================================================================
// Rate Limiting & Timeout
// ============================================================================

export class RateLimitError extends AppError {
  constructor(service: string) {
    super({
      code: "RATE_LIMITED",
      message: `Rate limited by ${service}`,
      userMessage:
        "Service is temporarily busy. Please wait a moment and try again.",
      isRetryable: true,
      httpStatus: 429,
    });
  }
}

export class TimeoutError extends AppError {
  constructor(operation: string, timeoutMs: number) {
    super({
      code: "TIMEOUT",
      message: `${operation} timed out after ${timeoutMs}ms`,
      userMessage: "The operation took too long. Please try again.",
      isRetryable: true,
      httpStatus: 504,
    });
  }
}

// ============================================================================
// Generic/Fallback
// ============================================================================

export class InternalError extends AppError {
  constructor(message: string) {
    super({
      code: "INTERNAL_ERROR",
      message,
      userMessage: "Something went wrong. Please try again.",
      isRetryable: true,
      httpStatus: 500,
    });
  }
}

// ============================================================================
// Helper: Convert unknown error to AppError
// ============================================================================

export function toAppError(error: unknown, fallbackMessage?: string): AppError {
  if (error instanceof AppError) {
    return error;
  }

  const message = error instanceof Error
    ? error.message
    : String(error);

  return new InternalError(fallbackMessage || message);
}

// ============================================================================
// Article Status Types
// ============================================================================

export type ArticleStatus =
  | "queued"      // Initial state - in queue, not started
  | "fetching"    // Downloading content from URL
  | "extracting"  // Parsing HTML/PDF content
  | "detecting"   // Language detection
  | "translating" // AI translation in progress
  | "completed"   // Done successfully
  | "failed";     // Error state

export const ARTICLE_STATUS_LABELS: Record<ArticleStatus, string> = {
  queued: "Queued",
  fetching: "Fetching article...",
  extracting: "Extracting content...",
  detecting: "Detecting language...",
  translating: "Translating...",
  completed: "Ready",
  failed: "Failed",
};

export const ARTICLE_STATUS_ORDER: ArticleStatus[] = [
  "queued",
  "fetching",
  "extracting",
  "detecting",
  "translating",
  "completed",
];
