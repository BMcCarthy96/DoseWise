import { createHmac, timingSafeEqual } from "crypto";

// Why this exists
// ---------------
// api/report.ts is the only writer to the shared report_cache, and it used to
// take both the cache key and the product data straight from the request body.
// Anyone could POST a real product's UPC alongside invented ingredients and have
// the resulting report served — as `cached: true` — to every other user who
// scanned that barcode for the next 30 days. Attacker-controlled health claims
// in an app whose entire premise is that it does not make things up.
//
// Deriving the key server-side is not enough on its own: the attacker simply
// sends the real UPC and fabricates the label instead. The property we actually
// need is that *cacheable product data is unforgeable*. api/resolve.ts is the
// only place a product is ever identified (from DSLD, Open Food Facts, or vision
// extraction), so it signs what it resolved, and the downstream routes refuse to
// cache anything they can't verify came from there.
//
// The token binds the cache key to the exact product payload, so it can't be
// replayed against different data, and it carries an expiry so a captured token
// isn't a standing write capability.

const TOKEN_VERSION = "v1";

// Long enough to outlast a slow report (PubMed + openFDA + synthesis is tens of
// seconds, and the client may sit on a resolve result while the user reads),
// short enough that a leaked token stops being useful quickly.
const TOKEN_TTL_MS = 60 * 60 * 1000;

export interface ResolvePayload {
  productKey: string;
  product: unknown;
  label?: unknown;
}

export type VerifyResult =
  /** Signature checked out — this payload really came from /api/resolve. */
  | { status: "valid" }
  /** No key material configured, so signing is disabled (see signingKey). */
  | { status: "unconfigured" }
  /** Missing, malformed, expired, or forged. */
  | { status: "rejected"; reason: string };

let cachedKey: Uint8Array | null | undefined;
let warnedUnconfigured = false;

/**
 * The signing key is derived from a server-only secret so deploying this
 * required no new environment variable. `REPORT_SIGNING_SECRET` is preferred and
 * lets the key be rotated on its own; otherwise it falls back to the Supabase
 * service-role key, which is precisely the secret that already gates the cache
 * these tokens protect. If neither is set, the cache is disabled too
 * (api/_lib/cache.ts returns null without SUPABASE_SERVICE_ROLE_KEY), so there
 * is nothing left to poison and enforcement is skipped rather than locking out
 * local development.
 *
 * Note the HMAC-over-a-constant: it derives a key for *this* purpose instead of
 * using the service-role key directly, so a signature can never be repurposed
 * as, or leak, the underlying credential.
 */
function signingKey(): Uint8Array | null {
  if (cachedKey !== undefined) return cachedKey;
  const secret = process.env.REPORT_SIGNING_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      console.warn(
        "[signing] disabled — neither REPORT_SIGNING_SECRET nor SUPABASE_SERVICE_ROLE_KEY is set. " +
          "Report caching is disabled too, so nothing is cacheable and nothing can be poisoned.",
      );
    }
    cachedKey = null;
    return null;
  }
  cachedKey = new Uint8Array(createHmac("sha256", secret).update("dosewise/resolve-token/v1").digest());
  return cachedKey;
}

/**
 * Order-independent, whitespace-free serialization. The client round-trips the
 * resolved product as a parsed object and re-serializes it, so key order and
 * formatting are not stable across the trip — only the values are. Sorting keys
 * and dropping null/undefined makes the signature depend on the data alone.
 */
function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined && v !== null)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(key: Uint8Array, expiresAt: number, payload: ResolvePayload): string {
  return createHmac("sha256", key)
    .update(
      [
        TOKEN_VERSION,
        String(expiresAt),
        canonicalize(payload.productKey),
        canonicalize(payload.product),
        canonicalize(payload.label ?? null),
      ].join("\n"),
    )
    .digest("base64url");
}

/**
 * Mints a token for a payload /api/resolve just produced. Returns undefined when
 * signing is unconfigured, in which case the response simply carries no token.
 */
export function signResolvePayload(payload: ResolvePayload): string | undefined {
  const key = signingKey();
  if (!key) return undefined;
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  return `${TOKEN_VERSION}.${expiresAt}.${digest(key, expiresAt, payload)}`;
}

/**
 * Confirms a payload is byte-for-byte the one /api/resolve signed. Callers treat
 * anything other than "valid"/"unconfigured" as "serve the user, but do not
 * write this to the shared cache" — see api/report.ts. That keeps the security
 * property absolute (only server-resolved data is ever cached) without letting a
 * round-trip quirk turn into a user-visible outage.
 */
export function verifyResolveToken(token: unknown, payload: ResolvePayload): VerifyResult {
  const key = signingKey();
  if (!key) return { status: "unconfigured" };
  if (typeof token !== "string" || !token) return { status: "rejected", reason: "missing" };

  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) return { status: "rejected", reason: "malformed" };

  const expiresAt = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(expiresAt)) return { status: "rejected", reason: "malformed" };
  if (expiresAt < Date.now()) return { status: "rejected", reason: "expired" };

  const encoder = new TextEncoder();
  const expected = encoder.encode(digest(key, expiresAt, payload));
  const received = encoder.encode(parts[2]);
  // Length is checked first because timingSafeEqual throws on a mismatch; the
  // comparison itself stays constant-time so a forged token can't be refined
  // byte by byte against the response latency.
  if (expected.length !== received.length) return { status: "rejected", reason: "signature" };
  if (!timingSafeEqual(expected, received)) return { status: "rejected", reason: "signature" };

  return { status: "valid" };
}

/** Exposed for the security regression suite. */
export const __testing = { canonicalize, TOKEN_TTL_MS };
