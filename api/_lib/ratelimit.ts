import type { VercelRequest } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

// Rate limiting exists here for one reason: every route it guards can trigger a
// Claude call, so an unmetered request is a charge on ANTHROPIC_API_KEY. The
// budget therefore has to hold across the whole deployment, not per process.
//
// The original implementation was a module-level Map, which meant its "300
// requests/day" ceiling was really 300 *per warm instance* — reset on every cold
// start and multiplied by however many instances Vercel happened to be running.
// The counters now live in Postgres (supabase/migrations/002_rate_limit.sql), so
// all instances share them. The in-memory path is kept as a fallback for local
// development and for the case where Supabase is unreachable, where it is
// strictly better than no limit at all.

const RULES = [
  /** Burst control: what a human scanning bottles could plausibly do. */
  { scope: "ip", limit: 10, windowSeconds: 60 },
  /**
   * Sustained per-client budget. Without this one client could hold the burst
   * limit open all day and consume the entire global allowance alone.
   */
  { scope: "ip", limit: 100, windowSeconds: 86_400 },
  /** Absolute daily ceiling across every client — the backstop on total spend. */
  { scope: "global", limit: 300, windowSeconds: 86_400 },
] as const;

export interface RateLimitResult {
  ok: boolean;
  retryAfter?: number;
}

// ── Shared (Postgres-backed) limiter ──────────────────────────────────────────

// Just enough schema for supabase-js to type this one RPC; the project has no
// generated Database types, and an untyped client infers `never` for rpc args.
type RateLimitSchema = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: {
      consume_rate_limits: {
        Args: { p_buckets: string[]; p_limits: number[]; p_windows: number[] };
        Returns: { allowed: boolean; retry_after: number }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

let adminClient: ReturnType<typeof createClient<RateLimitSchema>> | null | undefined;

function getAdminClient() {
  if (adminClient !== undefined) return adminClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  adminClient = url && key ? createClient<RateLimitSchema>(url, key, { auth: { persistSession: false } }) : null;
  return adminClient;
}

let warnedFallback = false;

function warnFallback(detail: string) {
  if (warnedFallback) return;
  warnedFallback = true;
  console.warn(`[ratelimit] falling back to per-instance in-memory limits — ${detail}`);
}

// ── Fallback (per-instance) limiter ───────────────────────────────────────────

const hitsByBucket = new Map<string, number[]>();

function checkInMemory(buckets: string[]): RateLimitResult {
  const now = Date.now();
  let retryAfter = 0;

  // Evaluated in two passes so a request that will be rejected doesn't consume
  // budget from the rules it did satisfy.
  for (let i = 0; i < RULES.length; i++) {
    const windowMs = RULES[i].windowSeconds * 1000;
    const recent = (hitsByBucket.get(buckets[i]) ?? []).filter((t) => now - t < windowMs);
    hitsByBucket.set(buckets[i], recent);
    if (recent.length >= RULES[i].limit) {
      retryAfter = Math.max(retryAfter, Math.ceil((recent[0] + windowMs - now) / 1000));
    }
  }
  if (retryAfter > 0) return { ok: false, retryAfter: Math.max(retryAfter, 1) };

  for (let i = 0; i < RULES.length; i++) hitsByBucket.get(buckets[i])!.push(now);
  return { ok: true };
}

/**
 * Consumes one unit of budget for `ip` against every rule, and reports whether
 * the caller is within all of them. Awaiting a database round trip is cheap
 * relative to what it is protecting: the routes it guards spend tens of seconds
 * in PubMed, openFDA, and Claude.
 */
export async function checkRateLimit(ip: string): Promise<RateLimitResult> {
  const buckets = RULES.map((r) => `${r.scope === "global" ? "global" : `ip:${ip}`}|${r.windowSeconds}`);
  const client = getAdminClient();

  if (client) {
    try {
      const { data, error } = await client.rpc("consume_rate_limits", {
        p_buckets: buckets,
        p_limits: RULES.map((r) => r.limit),
        p_windows: RULES.map((r) => r.windowSeconds),
      });
      const row = Array.isArray(data) ? (data[0] as { allowed: boolean; retry_after: number } | undefined) : undefined;
      if (!error && row) {
        return row.allowed ? { ok: true } : { ok: false, retryAfter: row.retry_after };
      }
      warnFallback(error?.message ?? "consume_rate_limits returned no row (is migration 002 applied?)");
    } catch (e) {
      warnFallback(e instanceof Error ? e.message : String(e));
    }
  } else {
    warnFallback("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
  }

  return checkInMemory(buckets);
}

/**
 * The client address to meter against.
 *
 * Order matters. `x-forwarded-for` is a client-supplied header that Vercel
 * happens to normalize, so trusting its first entry is only safe *because* of
 * where this runs — on a host that merely appends, an attacker sets the first
 * entry and gets a fresh bucket per request. The Vercel-specific headers are
 * written by the platform and cannot be spoofed by the caller, so they are
 * preferred, and the generic fallback takes the last entry (the one appended by
 * the nearest proxy) rather than the first.
 */
export function clientIp(req: VercelRequest): string {
  const first = (name: string): string | undefined => {
    const raw = req.headers[name];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return value?.split(",")[0]?.trim() || undefined;
  };

  const platform = first("x-vercel-forwarded-for") ?? first("x-real-ip");
  if (platform) return platform;

  const raw = req.headers["x-forwarded-for"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const hops = value?.split(",").map((h) => h.trim()).filter(Boolean) ?? [];
  return hops[hops.length - 1] ?? req.socket?.remoteAddress ?? "unknown";
}
