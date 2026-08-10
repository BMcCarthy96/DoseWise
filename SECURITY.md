# Security

DoseWise has a public, unauthenticated API that spends money on every call (Claude, plus billed web searches on `/api/reviews`) and writes to a cache shared by every user. That combination is the whole threat model: **cost abuse** and **cache poisoning**. This document is what the defences are and why they're shaped that way.

## Trust boundaries

| Source | Trusted? | Why |
|---|---|---|
| NIH DSLD, Open Food Facts, PubMed, openFDA | Yes | Authoritative upstreams, fetched server-side. |
| Our own dose/UL tables (`api/_lib/trustReport.ts`) | Yes | Checked into the repo, pinned by `npm run test:doses`. |
| Anything in a request body | **No** | Bounded and re-validated on every route. |
| A scanned label photo | **No** | An attacker chooses the image, so the text extracted from it is attacker-influenced. |
| Anything Claude returns | **No** | Rebuilt from verified data where possible, bounded everywhere else. |

The rule that follows from the last three rows: **the model is never the source of a fact the user sees as a fact.**

## Secrets

`ANTHROPIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are server-only and are never prefixed `EXPO_PUBLIC_`, so they cannot reach the app bundle. The client only ever talks to `/api/*`; it has no path to Anthropic directly.

The Supabase **publishable/anon** key does ship in the bundle, by design — that's what it's for. What makes it safe is that it can't reach anything:

| Check with the shipped anon key | Result |
|---|---|
| `SELECT` from `report_cache` | 0 rows |
| `INSERT` into `report_cache` | `42501` RLS violation |
| `SELECT` other users' `scan_history` | 0 rows |
| `INSERT` into `scan_history` unauthenticated | `42501` RLS violation |
| Reach `auth.users` | `PGRST205` — not exposed |

`report_cache` and `api_rate_limit` have RLS enabled with **zero policies**, which means only the service role (which bypasses RLS) can touch them. `scan_history` has four `auth.uid() = user_id` policies, so a signed-in user reaches exactly their own rows and `ON DELETE CASCADE` removes them with the account.

## Cache poisoning

**The problem.** `/api/report` is the only writer to the shared `report_cache`, and it originally took both the cache key and the product data straight from the request body. An unauthenticated caller could POST a real product's UPC alongside invented ingredients; the generated report was cached under that key and served — flagged `cached: true` — to everyone who scanned that barcode for the next 30 days. In an app whose premise is "we don't make things up," a stranger could choose the health verdict other people saw.

Deriving the key server-side is not sufficient on its own: the attacker just sends the real UPC and fabricates the label instead. The property actually needed is that **cacheable product data is unforgeable**.

**The fix** (`api/_lib/signing.ts`). `/api/resolve` is the only place a product is ever identified from a trusted source, so it signs `{ productKey, product, label }` with an HMAC and returns an opaque `token`. `/api/report` and `/api/reviews` recompute the signature over what they received and refuse to write to the shared cache unless it matches.

- The signature covers the key *and* the payload, so a valid token can't be replayed against different data.
- Payloads are canonicalized (keys sorted, null/undefined dropped) before signing, because the client round-trips them through `JSON.parse`/`stringify` and only the values are stable.
- Tokens expire after an hour, so a captured one isn't a standing write capability.
- Comparison is constant-time, and the key is derived via HMAC-over-a-constant rather than used directly, so a signature can never leak or be repurposed as the underlying credential.
- A verification failure **still returns a real report to the user** — it just never reaches the cache. Security holds absolutely; a round-trip quirk degrades to "slower," not "broken."

`REPORT_SIGNING_SECRET` is optional. If unset, the key is derived from `SUPABASE_SERVICE_ROLE_KEY` — precisely the secret that already gates the cache being protected. If neither exists, caching is disabled anyway, so there is nothing to poison.

## Cost abuse

Every guarded route can trigger a Claude call, so an unmetered request is a charge on `ANTHROPIC_API_KEY`.

**Bounded input** (`api/_lib/validate.ts`). `label.ingredientsText`, the blend/other-ingredient arrays, and `/api/reviews`' `brand`/`name` were previously interpolated into prompts at whatever length the caller sent. Vercel accepts ~4.5 MB bodies; at Sonnet 4.6's $3/M input rate that is a couple of dollars of input *per request*, ten requests a minute. Every client-supplied field now has a documented cap applied before it reaches a prompt, an outbound query, or the cache. Output is bounded too — `max_tokens` per route, and `MAX_INGREDIENTS_RESEARCHED = 6` bounds the PubMed fan-out.

**Shared rate limiting** (`api/_lib/ratelimit.ts`, `supabase/migrations/002_rate_limit.sql`). The limiter was a module-level `Map`, so its "300 requests/day" ceiling was really 300 *per warm instance* — reset on every cold start and multiplied by however many instances Vercel was running. Counters now live in Postgres, incremented atomically in a single round trip:

| Rule | Limit | Window |
|---|---|---|
| Per IP, burst | 10 | 60s |
| Per IP, sustained | 100 | 24h |
| Global | 300 | 24h |

The per-IP daily rule is what stops one client from holding the burst limit open all day and consuming the entire global budget alone. If Supabase is unreachable the limiter falls back to per-instance counters and logs a warning — worse than the shared path, better than no limit.

**Client identity.** `clientIp()` prefers `x-vercel-forwarded-for` / `x-real-ip`, which the platform writes and a caller cannot spoof. Trusting the *first* entry of the client-supplied `x-forwarded-for` is only safe because Vercel normalizes that header; on a host that merely appends, an attacker sets the first entry and gets a fresh bucket per request. The generic fallback therefore takes the last hop.

> Tested live against the deployment: 25 requests each claiming a different `X-Forwarded-For` — exactly 10 got through, confirming the real client IP governs.

**Backstop.** Set a spend limit in the Anthropic console regardless. Application-level limits are the first line, not the last.

## Prompt injection

An attacker controls product names, ingredient text, and the contents of a scanned label photo — all of which reach a prompt.

- **Fencing.** Label-derived text is wrapped in `<untrusted-...>` blocks, and both system prompts instruct the model to treat their contents as data to analyze, never as instructions — and to report directions found there as a suspicious label claim.
- **Fence integrity.** Values are stripped of C0 control characters and of zero-width/bidi characters (which can hide or visually reorder injected text), and any literal `<untrusted-*>` marker is removed, so a value cannot close its own block.
- **Verified output.** The strongest defence isn't the prompt, it's that injection has little to win. Citations are discarded unless the PMID is in the whitelist of articles actually fetched, and the title/year/URL are rebuilt from our own metadata. Product identity and FDA recall/adverse-event records are overwritten server-side after the call. `sanitizeReviews` drops any certification or source lacking a real URL. `verdict.grade`, `confidence`, and `score` are range-checked. Every remaining free-text field is length-bounded.

## Personal data

- Anonymous scans stay in device `AsyncStorage` and are never transmitted.
- Signed-in history stores only `product_key`, brand, name, verdict, and score against a user id — no health profile, no free text.
- Label photos are sent to Anthropic for extraction and never stored.
- There are no `console.log` calls in `src/`, so no user data lands in client logs.
- `/api/delete-account` validates the caller's own bearer token and deletes only the user that token resolves to — never a client-supplied id (Apple guideline 5.1.1(v)).

## Regression tests

`npm run test:security` pins all of the above — signature forgery, replay against swapped data, expiry, JSON round-trip stability, input caps, fence integrity, invisible-character stripping, and type coercion. It is fully offline: no network, no database, no API key.

## Reporting

Found something? Open a GitHub issue or email the address in the App Store listing. Please don't file exploit details in a public issue.
