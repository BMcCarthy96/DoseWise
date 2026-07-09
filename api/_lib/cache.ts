import type { TrustReport } from "../../src/types";

// In-memory report cache, scoped to a single warm serverless instance — same
// caveat as ratelimit.ts. Good enough to make "scan the same UPC twice" free
// within a warm instance; Phase 5 swaps this for a Supabase-backed
// report_cache table shared across instances and persisted across cold starts.

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface CacheEntry {
  report: TrustReport;
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();

export function getCachedReport(productKey: string): TrustReport | null {
  const entry = cache.get(productKey);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    cache.delete(productKey);
    return null;
  }
  return entry.report;
}

export function setCachedReport(productKey: string, report: TrustReport): void {
  cache.set(productKey, { report, cachedAt: Date.now() });
}
