import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db, users, articles } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { handleApiError, unauthorized, notFound } from "@/lib/api-error-handler";

// Human-readable status labels
const STATUS_LABELS: Record<string, string> = {
  queued: "Waiting to start...",
  fetching: "Fetching article...",
  extracting: "Extracting content...",
  detecting: "Detecting language...",
  translating: "Translating...",
  completed: "Ready",
  failed: "Failed",
};

// GET - Get article translation status (lightweight endpoint for polling)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return unauthorized();
    }

    const { id } = await params;

    // Get user ID
    const user = await db.query.users.findFirst({
      where: eq(users.clerkId, userId),
      columns: { id: true },
    });

    if (!user) {
      return notFound("User");
    }

    // Get article status with error details
    const article = await db.query.articles.findFirst({
      where: and(eq(articles.id, id), eq(articles.userId, user.id)),
      columns: {
        id: true,
        status: true,
        translationProgress: true,
        totalParagraphs: true,
        title: true,
        errorMessage: true,
        errorCode: true,
        retryCount: true,
        updatedAt: true,
        createdAt: true,
      },
    });

    if (!article) {
      return notFound("Article");
    }

    // Calculate progress percentage
    const progressPercentage =
      article.totalParagraphs > 0
        ? Math.round((article.translationProgress / article.totalParagraphs) * 100)
        : 0;

    // Build response
    const response: {
      id: string;
      status: string;
      statusLabel: string;
      title: string | null;
      progress: {
        current: number;
        total: number;
        percentage: number;
      } | null;
      error: {
        message: string;
        code: string;
        isRetryable: boolean;
      } | null;
      retryCount: number;
    } = {
      id: article.id,
      status: article.status,
      statusLabel: STATUS_LABELS[article.status] || article.status,
      title: article.title,
      progress:
        article.totalParagraphs > 0
          ? {
              current: article.translationProgress,
              total: article.totalParagraphs,
              percentage: progressPercentage,
            }
          : null,
      error:
        article.status === "failed" && article.errorMessage
          ? {
              message: article.errorMessage,
              code: article.errorCode || "UNKNOWN_ERROR",
              isRetryable: !["EXTRACTION_FAILED", "CONTENT_TOO_SHORT", "PDF_INVALID"].includes(
                article.errorCode || ""
              ),
            }
          : null,
      retryCount: article.retryCount,
    };

    return NextResponse.json(response);
  } catch (error) {
    return handleApiError(error, "Article status");
  }
}
