# App Store screenshots

Ready-to-upload iPhone screenshots for App Store Connect.

## `iphone-6.7/` — 1290 × 2796 px (6.7" iPhone)

This is the required iPhone size in App Store Connect; Apple auto-scales it to
smaller iPhones, so this one set covers every iPhone. Upload in this order:

| File | Caption (eyebrow / headline) |
|---|---|
| `01-scan.png` | SCAN ANYTHING · "Scan any supplement in seconds" |
| `02-verdict.png` | INSTANT VERDICT · "An honest, color-coded verdict" |
| `03-breakdown.png` | FULL BREAKDOWN · "Every ingredient, every dose — explained" |
| `04-warnings.png` | STAY SAFE · "Recalls & red flags, before you buy" |
| `05-trust.png` | HONEST BY DESIGN · "Backed by research. Never invented." |

The phone screens are **real captures of the live app** (dose-wise-beta.vercel.app)
driven through an actual UPC lookup — the report shown (a hair multivitamin,
62/100, "Low Confidence") is genuine output, including real PubMed citations and
the openFDA adverse-event summary. Only the scan-tab viewfinder uses a
brand-neutral bottle illustration in place of a live camera frame.

## Regenerating

The generator scripts live in `.shots/` (git-ignored). They use `puppeteer-core`
(pointed at installed Chrome) to capture the live app at 430×932 @3x = 1290×2796,
and `@resvg/resvg-js` to composite the branded frames with the app's Manrope font.

```bash
npm install --no-save puppeteer-core@23 @resvg/resvg-js
node .shots/capture2.mjs   # capture live app screens -> .shots/raw
node .shots/hero.mjs       # scan-tab hero with bottle illustration
node .shots/gen-shots.mjs  # composite -> .shots/out, then copy into iphone-6.7/
```

## Notes
- If you later add a 6.5" set, App Store Connect wants exactly 1242 × 2688 px.
- iPad screenshots are only required if the app is offered on iPad.
