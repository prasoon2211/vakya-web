import { NextResponse } from "next/server";
import { AppError, toAppError } from "./errors";

/**
 * Standard API error response format
 */
export interface ApiErrorResponse {
  error: string;
  code: string;
  isRetryable: boolean;
}

/**
 * Handles errors in API routes consistently.
 * Converts any error to a proper NextResponse with appropriate status code.
 *
 * @param error - The error that occurred
 * @param context - Optional context string for logging (e.g., "PDF upload")
 * @returns NextResponse with error details
 */
export function handleApiError(
  error: unknown,
  context?: string
): NextResponse<ApiErrorResponse> {
  // Log the error with context
  const logPrefix = context ? `[API Error] ${context}:` : "[API Error]";
  console.error(logPrefix, error);

  // Convert to AppError if needed
  const appError = toAppError(error);

  return NextResponse.json(
    {
      error: appError.userMessage,
      code: appError.code,
      isRetryable: appError.isRetryable,
    },
    { status: appError.httpStatus }
  );
}

/**
 * Creates an unauthorized response
 */
export function unauthorized(): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      error: "Please sign in to continue.",
      code: "UNAUTHORIZED",
      isRetryable: false,
    },
    { status: 401 }
  );
}

/**
 * Creates a not found response
 */
export function notFound(resource: string = "Resource"): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      error: `${resource} not found.`,
      code: "NOT_FOUND",
      isRetryable: false,
    },
    { status: 404 }
  );
}

/**
 * Creates a bad request response
 */
export function badRequest(message: string): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      error: message,
      code: "BAD_REQUEST",
      isRetryable: false,
    },
    { status: 400 }
  );
}
