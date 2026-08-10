# DoseWise

A React Native / Expo app that scans a supplement's barcode or label and builds a research-backed **trust report**: what's actually in the bottle, how the doses stack up against Daily Values, whether the FDA has recalled it or logged adverse events, and what independent testing and public reviews say — versus what the label claims.

Supplements are barely regulated compared to drugs, and the DSLD/PubMed/openFDA data confirms it: labels routinely hide doses inside "proprietary blends," report ingredients whose independent lab testing disagrees with the printed amount, or list mega-doses with no supporting research. DoseWise pulls the primary sources and lets Claude synthesize them into one plain-language verdict instead of asking you to trust the marketing.

## Features

- **Scan two ways**: live barcode scanning (native camera / web via `@zxing/browser`) or a photo of the Supplement Facts panel, read by Claude's vision model
- **Instant verdict**: a color-coded good / caution / bad card with a plain-language headline and confidence level
- **Breakdown**: every active ingredient's dose, %DV, and evidence grade, with proprietary blends and hidden doses flagged explicitly
- **Warnings**: openFDA recall history, CAERS adverse-event report counts, and a research-consensus summary grounded in real PubMed citations
- **Reviews**: third-party certification status (USP Verified, NSF, Labdoor) and public review sentiment, gathered live via Claude's web search
- **Quick scan, no account needed** — sign in only if you want scan history saved and synced

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Expo SDK 54 / React Native 0.81 (+ react-native-web) |
| Language | TypeScript (strict) |
| Navigation | `@react-navigation` (stack + bottom tabs) |
| AI | `@anthropic-ai/sdk`, `claude-sonnet-4-6` (vision + synthesis + web search) |
| Supplement data | NIH ODS [DSLD](https://dsld.od.nih.gov/) v9, [Open Food Facts](https://openfoodfacts.org/) (fallback) |
| Research | [PubMed E-utilities](https://www.ncbi.nlm.nih.gov/books/NBK25497/) |
| Regulatory | [openFDA](https://open.fda.gov/) food enforcement + CAERS |
| Accounts / history | Supabase (auth + Postgres) |
| Camera | `expo-camera`, `expo-image-picker`, `expo-image-manipulator` |
| Fonts | Manrope via `expo-font` |

## Setup

**1. Install dependencies**
```bash
npm install
```

**2. Create `.env` at the project root**
```
# Server-side only — never prefix these with EXPO_PUBLIC_
ANTHROPIC_API_KEY=your_anthropic_api_key_here
NCBI_API_KEY=              # optional, raises PubMed rate limit from 3rps to 10rps
OPENFDA_API_KEY=           # optional, raises openFDA daily quota
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
REPORT_SIGNING_SECRET=     # optional, any long random string; see SECURITY.md

# Client-side (safe to expose in the bundle)
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_API_BASE=      # leave empty for web (same-origin); set for native builds
```
See `.env.example`. Get an Anthropic key at [console.anthropic.com](https://console.anthropic.com).

**3. Apply the database migrations**

Run each file in `supabase/migrations/` in order from the Supabase SQL editor. `002_rate_limit.sql` is what makes the API rate limit hold across serverless instances — without it the limiter falls back to per-instance counters and logs a warning on every cold start.

**4. Start the dev server**
```bash
npx expo start
```
Scan the QR code with Expo Go, or press `w` for web.

## Project Structure

```
api/
  resolve.ts       # UPC/photo → product identity (DSLD → Open Food Facts → vision fallback)
  report.ts        # evidence gathering (PubMed, openFDA, label heuristics) + Claude synthesis → TrustReport
  reviews.ts       # Claude + web search → certifications and public review consensus
  _lib/            # DSLD/OFF/PubMed/openFDA clients, rate limiting, report cache, UL/risk tables
                   # signing.ts (resolve-payload HMAC) + validate.ts (input caps) — see SECURITY.md
src/
  screens/         # ScanScreen, LabelPhotoScreen, ResultsScreen, HistoryScreen, SettingsScreen
  components/      # BarcodeScanner, VerdictHero, BreakdownChart, WarningList, ReviewsPanel, PhoneFrame
  services/        # api.ts (client for /api/*)
  navigation/       # Bottom tabs + FAB (Scan Barcode / Photo Label / Enter UPC)
  types/           # TrustReport schema and shared types
  theme.ts         # Color (C.*) and font (F.*) constants
supabase/migrations/ # report_cache + scan_history schema, shared rate-limit counters
shims/             # Node.js built-in stubs for Metro bundler
```

## How the Analysis Pipeline Works

1. **Resolve** — a scanned UPC is normalized and looked up in the NIH DSLD (which indexes UPCs in a spaced human-readable format, not raw digits); misses fall back to Open Food Facts, then to a "photo the label instead" prompt. A label photo instead goes straight to Claude's vision model to extract brand, ingredients, and doses.
2. **Report** — up to 6 active ingredients are queried against PubMed in parallel, alongside openFDA recall and adverse-event lookups and a deterministic pass for proprietary blends, doses that exceed established Upper Limits, and known-risky ingredients. One Claude call synthesizes all of it into the structured `TrustReport` (verdict, per-ingredient evidence grades with citations, label-trust flags, warnings).
3. **Reviews** — a separate Claude call with the web-search tool enabled looks up USP/NSF/Labdoor certification status and public review consensus, merged into the report once it resolves.

Reports are cached by product so scanning the same barcode twice is instant and free. Because that cache is shared between every user, `/api/resolve` signs what it resolved and the later stages refuse to cache anything they can't verify came from it — see [SECURITY.md](SECURITY.md).

## Development Notes

- Run `npm run typecheck` after every change. There is no lint script.
- `npm test` runs three regression suites. `test:doses` pins the nutrient-aware dose-safety thresholds (a failure means the app is either inventing a safety limit or missing a real one); `test:cache` pins the cache's best-effort contract — failures degrade to "regenerate" but are never unlogged; `test:security` pins the abuse defences described in [SECURITY.md](SECURITY.md). The dose and cache suites have live sections that hit DSLD / the real `report_cache` table and skip themselves when the network or `.env` credentials are unavailable; the cache suite writes one throwaway row and deletes it. The security suite is entirely offline.
- Claude's JSON responses are parsed defensively (`extractJsonObject` in `api/_lib/trustReport.ts`) since enabling the web-search tool makes the model prone to wrapping JSON in narrative text despite instructions not to.
- Nothing the model returns is trusted on its own. Citations are rebuilt from the PubMed metadata actually fetched, product identity and FDA records are overwritten server-side with the verified data, and every remaining free-text field is length-bounded before it is cached or rendered.
- Both the report cache and the API rate limiter are backed by Supabase, so they hold across serverless instances and survive cold starts. The limiter falls back to per-instance counters (with a loud warning) if `002_rate_limit.sql` hasn't been applied.

## Disclaimer

DoseWise summarizes publicly available research and regulatory data. It is not medical advice — talk to a healthcare provider before starting or stopping any supplement.

## License

MIT.
