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

# Client-side (safe to expose in the bundle)
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_API_BASE=      # leave empty for web (same-origin); set for native builds
```
See `.env.example`. Get an Anthropic key at [console.anthropic.com](https://console.anthropic.com).

**3. Start the dev server**
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
src/
  screens/         # ScanScreen, LabelPhotoScreen, ResultsScreen, HistoryScreen, SettingsScreen
  components/      # BarcodeScanner, VerdictHero, BreakdownChart, WarningList, ReviewsPanel, PhoneFrame
  services/        # api.ts (client for /api/*)
  navigation/       # Bottom tabs + FAB (Scan Barcode / Photo Label / Enter UPC)
  types/           # TrustReport schema and shared types
  theme.ts         # Color (C.*) and font (F.*) constants
supabase/migrations/ # report_cache + scan_history schema
shims/             # Node.js built-in stubs for Metro bundler
```

## How the Analysis Pipeline Works

1. **Resolve** — a scanned UPC is normalized and looked up in the NIH DSLD (which indexes UPCs in a spaced human-readable format, not raw digits); misses fall back to Open Food Facts, then to a "photo the label instead" prompt. A label photo instead goes straight to Claude's vision model to extract brand, ingredients, and doses.
2. **Report** — up to 6 active ingredients are queried against PubMed in parallel, alongside openFDA recall and adverse-event lookups and a deterministic pass for proprietary blends, doses that exceed established Upper Limits, and known-risky ingredients. One Claude call synthesizes all of it into the structured `TrustReport` (verdict, per-ingredient evidence grades with citations, label-trust flags, warnings).
3. **Reviews** — a separate Claude call with the web-search tool enabled looks up USP/NSF/Labdoor certification status and public review consensus, merged into the report once it resolves.

Reports are cached by product so scanning the same barcode twice is instant and free.

## Development Notes

- Run `npx tsc --noEmit` after every change. There is no lint or test script.
- Claude's JSON responses are parsed defensively (`extractJsonObject` in `api/_lib/trustReport.ts`) since enabling the web-search tool makes the model prone to wrapping JSON in narrative text despite instructions not to.
- The in-memory rate limiter and report cache (`api/_lib/ratelimit.ts`, `api/_lib/cache.ts`) are per-warm-instance, not shared across concurrent serverless instances — fine for a demo, and the cache is slated to move to the Supabase `report_cache` table.

## Disclaimer

DoseWise summarizes publicly available research and regulatory data. It is not medical advice — talk to a healthcare provider before starting or stopping any supplement.

## License

MIT.
