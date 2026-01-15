import { TimeoutError, AppError } from "@/lib/errors";

/**
 * Wraps a promise with a timeout. Throws TimeoutError if the promise
 * doesn't resolve within the specified time.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(operation, timeoutMs));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

/**
 * Options for retry behavior
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts?: number;
  /** Base delay between retries in ms (default: 1000) */
  baseDelayMs?: number;
  /** Maximum delay between retries in ms (default: 10000) */
  maxDelayMs?: number;
  /** Function to determine if error is retryable */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Called before each retry with attempt number and error */
  onRetry?: (attempt: number, error: unknown) => void;
}

/**
 * Retries an async operation with exponential backoff.
 *
 * @param fn - The async function to retry
 * @param options - Retry configuration
 * @returns The result of the function
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 1000,
    maxDelayMs = 10000,
    shouldRetry = defaultShouldRetry,
    onRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (!shouldRetry(error, attempt)) {
        throw error;
      }

      // Check if we have attempts left
      if (attempt === maxAttempts) {
        throw error;
      }

      // Calculate delay with exponential backoff + jitter
      const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
      const jitter = Math.random() * 500;
      const delay = Math.min(exponentialDelay + jitter, maxDelayMs);

      // Notify about retry
      if (onRetry) {
        onRetry(attempt, error);
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Default retry decision: retry AppErrors that are marked retryable,
 * or non-AppErrors (assuming they might be transient)
 */
function defaultShouldRetry(error: unknown, _attempt: number): boolean {
  if (error instanceof AppError) {
    return error.isRetryable;
  }
  // For unknown errors, assume they might be transient
  return true;
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run multiple promises with a concurrency limit
 */
export async function withConcurrency<T, R>(
  items: T[],
  maxConcurrent: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];

  for (let i = 0; i < items.length; i += maxConcurrent) {
    const batch = items.slice(i, i + maxConcurrent);
    const batchResults = await Promise.allSettled(
      batch.map((item, batchIndex) => fn(item, i + batchIndex))
    );
    results.push(...batchResults);
  }

  return results;
}
