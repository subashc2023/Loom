import { PipelineError } from "./errors";

/**
 * Shared HTTP infrastructure for the network-bound stages (voice, align, slides,
 * commons, openverse). Every external call goes through `fetchResilient`, which
 * adds two things the bespoke `fetch` calls were missing:
 *
 *   - a per-attempt timeout, so a hung server can't wedge the whole pipeline; and
 *   - bounded exponential-backoff retries on transient failures (network errors,
 *     timeouts, 408/425/429, and 5xx), honouring a numeric `Retry-After` header.
 *
 * It deliberately does NOT throw on a non-retryable non-2xx response — it returns
 * the final `Response` so each caller keeps its own tailored error handling (e.g.
 * ElevenLabs' free-tier 402 hint, Gemini's empty-candidates message). It only
 * throws a `PipelineError` when the request never produced a response at all
 * (network/timeout) after exhausting retries.
 */

export type ResilientFetchOptions = {
  /** Human name of the service, used in timeout/network error messages. */
  service: string;
  /** Retries *after* the first attempt. Default 3 (so up to 4 attempts). */
  retries?: number;
  /** Per-attempt timeout in ms. Default 60_000. */
  timeoutMs?: number;
  /** Base backoff delay in ms; doubles each retry. Default 500. */
  baseDelayMs?: number;
};

/** Statuses worth retrying: request timeout, too-early, rate-limit, and 5xx. */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 599);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse a numeric (seconds) `Retry-After` header into ms, or null if absent/non-numeric. */
function retryAfterMs(res: Response): number | null {
  const header = res.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null;
}

/**
 * `fetch` with a per-attempt timeout and exponential-backoff retries on transient
 * failures. Returns the `Response` (even a non-ok one once retries are spent) so
 * callers handle status-specific errors themselves; throws `PipelineError` only
 * when no response could be obtained.
 */
export async function fetchResilient(
  url: string,
  init: RequestInit,
  opts: ResilientFetchOptions,
): Promise<Response> {
  const retries = opts.retries ?? 3;
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const baseDelayMs = opts.baseDelayMs ?? 500;

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      if (res.ok || !isRetryableStatus(res.status) || attempt === retries) return res;
      // Transient status with retries left: back off, preferring Retry-After.
      const delay = retryAfterMs(res) ?? backoff(baseDelayMs, attempt);
      await sleep(delay);
    } catch (e) {
      // AbortError (timeout) or a network failure. Retry unless we're out.
      lastError = normalizeError(e, opts.service, timeoutMs);
      if (attempt === retries) throw new PipelineError(lastError.message);
      await sleep(backoff(baseDelayMs, attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  // Unreachable: the loop returns or throws on the final attempt.
  throw new PipelineError(lastError?.message ?? `could not reach ${opts.service}.`);
}

/** Exponential backoff with full jitter, so retries from parallel calls spread out. */
function backoff(base: number, attempt: number): number {
  const ceiling = base * 2 ** attempt;
  return Math.round(Math.random() * ceiling);
}

function normalizeError(e: unknown, service: string, timeoutMs: number): Error {
  const err = e instanceof Error ? e : new Error(String(e));
  if (err.name === "AbortError" || err.name === "TimeoutError") {
    return new Error(`${service} request timed out after ${Math.round(timeoutMs / 1000)}s.`);
  }
  return new Error(`could not reach ${service}: ${err.message}`);
}

/**
 * Parse a JSON response body, turning a non-JSON payload (an HTML error page, a
 * truncated body) into a clean `PipelineError` instead of an opaque SyntaxError.
 */
export async function readJson<T>(res: Response, service: string): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new PipelineError(`${service} returned a non-JSON response: ${text.slice(0, 200)}`);
  }
}
