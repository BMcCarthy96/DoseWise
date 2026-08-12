// Shared fetch wrapper for the outbound API clients (DSLD, PubMed, openFDA,
// Open Food Facts). None of these calls previously had a timeout — a slow or
// hanging upstream would hold the request open for the full Vercel function
// budget (up to 300s) while a human waited on the other end. This bounds each
// call to a budget appropriate to that source and retries exactly once, only
// on the failures a retry can plausibly fix (a network abort or a 5xx) — never
// on a 4xx, which a retry cannot turn into success.

export interface FetchWithTimeoutOptions extends RequestInit {
  timeoutMs: number;
  /** Set false to disable the single retry-on-transient-failure (default true). */
  retry?: boolean;
}

function jitterMs(): number {
  return 200 + Math.floor(Math.random() * 100); // ~250ms +/- 50ms
}

async function attempt(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

export async function fetchWithTimeout(url: string, options: FetchWithTimeoutOptions): Promise<Response> {
  const { timeoutMs, retry = true, ...init } = options;
  try {
    const res = await attempt(url, init, timeoutMs);
    if (res.status >= 500 && retry) {
      await new Promise((r) => setTimeout(r, jitterMs()));
      return attempt(url, init, timeoutMs);
    }
    return res;
  } catch (e) {
    // AbortError (timeout) and network-level throws are the only cases this
    // retries — a 4xx never throws here, it returns a Response, so it never
    // reaches this branch.
    if (!retry) throw e;
    await new Promise((r) => setTimeout(r, jitterMs()));
    return attempt(url, init, timeoutMs);
  }
}
