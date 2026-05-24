const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 4;
const INITIAL_BACKOFF_MS = 600;

export type FetchRetryOptions = {
  logPrefix: string;
  rateLimitDelayMs?: number;
};

export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(url: string, init: RequestInit, options: FetchRetryOptions) {
  let backoffMs = INITIAL_BACKOFF_MS;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      if (options.rateLimitDelayMs && attempt === 1) {
        await delay(options.rateLimitDelayMs);
      }

      const response = await fetch(url, {
        ...init,
        cache: "no-store",
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        return response;
      }

      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === MAX_RETRIES) {
        return response;
      }
    } catch (error) {
      clearTimeout(timeout);
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === MAX_RETRIES) {
        break;
      }
    }

    console.warn(`${options.logPrefix} Retry ${attempt}/${MAX_RETRIES} for ${url}`);
    await delay(backoffMs);
    backoffMs *= 2;
  }

  throw lastError ?? new Error(`${options.logPrefix} Request failed: ${url}`);
}

export async function fetchJsonWithRetry<T>(url: string, init: RequestInit, options: FetchRetryOptions): Promise<T> {
  const response = await fetchWithRetry(url, init, options);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`${options.logPrefix} Request failed (${response.status}): ${text}`);
  }
  return (await response.json()) as T;
}

export async function fetchTextWithRetry(url: string, init: RequestInit, options: FetchRetryOptions): Promise<string> {
  const response = await fetchWithRetry(url, init, options);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`${options.logPrefix} Request failed (${response.status}): ${text}`);
  }
  return response.text();
}

export async function fetchArrayBufferWithRetry(url: string, init: RequestInit, options: FetchRetryOptions) {
  const response = await fetchWithRetry(url, init, options);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`${options.logPrefix} Request failed (${response.status}): ${text}`);
  }
  return response.arrayBuffer();
}
