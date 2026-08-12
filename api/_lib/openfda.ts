// openFDA client — food enforcement (recalls) and CAERS (adverse events).
// Free; an optional API key (OPENFDA_API_KEY) raises the daily quota.

import { fetchWithTimeout } from "./http";
import type { SourceStatus } from "../../src/types";
export type { SourceStatus };

const OPENFDA_TIMEOUT_MS = 6000;

// `data` keeps the same empty-on-failure value callers always got, so nothing
// that only reads `.data` needs to change. `status` is what's new: "ok" with
// an empty array now means "we searched and found nothing" — a fact — where
// before that was indistinguishable from "the search never ran". The
// deterministic scorer (src/utils/score.ts) and the prompt builder both read
// `status` to tell "clean" from "unknown" apart.
export interface SourceResult<T> {
  status: SourceStatus;
  data: T;
}

export interface FdaRecall {
  date: string;
  reason: string;
  classification: string;
  status: string;
}

export interface FdaAdverseEventSummary {
  /** True number of distinct adverse-event reports (from a plain, non-`count` query). */
  reportCount: number;
  /** Sum of the top reaction buckets — a report naming 3 reactions is counted 3 times here, which is why this is a separate, honestly-named field rather than folded into reportCount. */
  reactionMentions: number;
  topReactions: string[];
}

function apiKeyParam(): string {
  return process.env.OPENFDA_API_KEY ? `&api_key=${process.env.OPENFDA_API_KEY}` : "";
}

function formatDate(yyyymmdd: string | null | undefined): string {
  if (!yyyymmdd || yyyymmdd.length !== 8) return "";
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

// Single-token brands under 5 characters, or common marketing words used as a
// brand name, are indistinguishable from ordinary English once they hit
// `product_description` — an analyzed (tokenized) field, so a phrase match on
// "Now" matches any recall whose description happens to contain that word.
// For those, search only `recalling_firm`, an unanalyzed company-name field
// where a short/generic string can't accidentally match unrelated text.
const GENERIC_BRAND_STOPWORDS = new Set(["now", "pure", "life", "natural", "health", "vital", "one", "plus", "gold", "daily", "best", "true", "real", "max", "go"]);

function isGenericBrandToken(brand: string): boolean {
  const t = brand.trim().toLowerCase();
  return t.length > 0 && (t.length <= 4 || GENERIC_BRAND_STOPWORDS.has(t));
}

function fiveYearWindow(): string {
  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
  const start = new Date();
  start.setFullYear(start.getFullYear() - 5);
  return `report_date:[${fmt(start)} TO ${fmt(new Date())}]`;
}

// Builds the actual openFDA query for a brand and searches it.
// `recalling_firm` was never searched before this — brand-name recalls filed
// under the manufacturer's corporate name (not the consumer-facing brand
// string) were pure false negatives. Combined with an OR against
// `product_description` (the original field) and a 5-year window, since an
// unbounded search can surface an unrelated decades-old recall next to a
// current one with no way for the UI to tell them apart.
export async function searchFdaRecallsForBrand(brand: string): Promise<SourceResult<FdaRecall[]>> {
  const escaped = brand.replace(/["\\]/g, " ").trim();
  if (!escaped) return { status: "ok", data: [] };
  const dateFilter = fiveYearWindow();
  const query = isGenericBrandToken(escaped)
    ? `recalling_firm:"${escaped}" AND ${dateFilter}`
    : `(product_description:"${escaped}" OR recalling_firm:"${escaped}") AND ${dateFilter}`;
  return searchFdaRecalls(query);
}

export async function searchFdaRecalls(query: string, limit = 10): Promise<SourceResult<FdaRecall[]>> {
  const url = `https://api.fda.gov/food/enforcement.json?search=${encodeURIComponent(query)}&limit=${limit}${apiKeyParam()}`;
  let res: Response;
  try {
    res = await fetchWithTimeout(url, { timeoutMs: OPENFDA_TIMEOUT_MS });
  } catch {
    return { status: "unreachable", data: [] };
  }
  // openFDA returns 404 for "search matched nothing" — a normal, clean result,
  // not a failure — and 429 specifically for quota exhaustion.
  if (res.status === 404) return { status: "ok", data: [] };
  if (res.status === 429) return { status: "rate_limited", data: [] };
  if (!res.ok) return { status: "unreachable", data: [] };

  const data = await res.json().catch(() => null);
  if (!data || !Array.isArray(data.results)) return { status: "malformed", data: [] };

  const results: FdaRecall[] = data.results.map((r: any) => ({
    date: formatDate(r.report_date),
    reason: r.reason_for_recall ?? "Not specified",
    classification: r.classification ?? "Unclassified",
    status: r.status ?? "Unknown",
  }));
  return { status: "ok", data: results };
}

export async function getFdaAdverseEventSummary(brand: string): Promise<SourceResult<FdaAdverseEventSummary | null>> {
  const searchQuery = `products.name_brand:"${brand}"`;
  // `count=reactions.exact` gives the top reaction terms but buckets by
  // reaction, not report — a single report listing five reactions is counted
  // five times. A second, plain (non-`count`) request's `meta.results.total`
  // is the true report count; querying both in parallel costs one extra
  // round trip and turns "N reports filed" from a fabricated number into a
  // real one.
  const countUrl = `https://api.fda.gov/food/event.json?search=${encodeURIComponent(searchQuery)}&count=reactions.exact${apiKeyParam()}`;
  const totalUrl = `https://api.fda.gov/food/event.json?search=${encodeURIComponent(searchQuery)}&limit=1${apiKeyParam()}`;

  let countRes: Response;
  let totalRes: Response;
  try {
    [countRes, totalRes] = await Promise.all([
      fetchWithTimeout(countUrl, { timeoutMs: OPENFDA_TIMEOUT_MS }),
      fetchWithTimeout(totalUrl, { timeoutMs: OPENFDA_TIMEOUT_MS }),
    ]);
  } catch {
    return { status: "unreachable", data: null };
  }
  if (countRes.status === 404 || totalRes.status === 404) return { status: "ok", data: null }; // no matching reports — a clean result
  if (countRes.status === 429 || totalRes.status === 429) return { status: "rate_limited", data: null };
  if (!countRes.ok || !totalRes.ok) return { status: "unreachable", data: null };

  const countData = await countRes.json().catch(() => null);
  const totalData = await totalRes.json().catch(() => null);
  const results = countData?.results;
  const total = totalData?.meta?.results?.total;
  if (!Array.isArray(results) || typeof total !== "number") return { status: "malformed", data: null };
  if (results.length === 0 || total === 0) return { status: "ok", data: null };

  const reactionMentions = results.reduce((sum: number, r: any) => sum + (r.count ?? 0), 0);
  const topReactions = results.slice(0, 5).map((r: any) => String(r.term).toLowerCase());
  return { status: "ok", data: { reportCount: total, reactionMentions, topReactions } };
}
