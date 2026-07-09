import type { VercelRequest } from "@vercel/node";

// In-memory, per-warm-instance rate limiting. This bounds casual abuse, not a
// determined attacker — state resets on cold start and isn't shared across
// concurrent instances. The real backstops are the daily cap below, capped
// web-search/token usage per report, and a spend limit set in the Anthropic
// console. If this ever needs to be robust across instances, swap in
// @upstash/ratelimit.
const WINDOW_MS = 60_000;
const PER_IP_LIMIT = 10;
const DAILY_CAP = 300;

const hitsByIp = new Map<string, number[]>();
let dailyCount = 0;
let dailyResetAt = Date.now();

export interface RateLimitResult {
  ok: boolean;
  retryAfter?: number;
}

export function checkRateLimit(ip: string): RateLimitResult {
  const now = Date.now();

  if (now - dailyResetAt > 86_400_000) {
    dailyCount = 0;
    dailyResetAt = now;
  }
  if (dailyCount + 1 > DAILY_CAP) {
    return { ok: false, retryAfter: 3600 };
  }

  const recent = (hitsByIp.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= PER_IP_LIMIT) {
    return { ok: false, retryAfter: 60 };
  }

  recent.push(now);
  hitsByIp.set(ip, recent);
  dailyCount += 1;
  return { ok: true };
}

export function clientIp(req: VercelRequest): string {
  const forwarded = req.headers["x-forwarded-for"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return value?.split(",")[0]?.trim() ?? "unknown";
}
