# Tests

Two regression suites covering the parts of the pipeline where a silent
behaviour change would directly break DoseWise's core promise: report only what
can be verified, and never invent information.

There's no test framework here on purpose — these are plain scripts run with
`tsx` that import the real modules, assert, and exit non-zero on failure.

```bash
npm test            # both suites
npm run test:doses  # dose thresholds only
npm run test:cache  # cache behaviour only
```

## `dose-thresholds.mts`

Pins down `assessDose()` in [`api/_lib/trustReport.ts`](../api/_lib/trustReport.ts).

DoseWise used to call anything at `>= 300% DV` "above the safe upper limit".
That was wrong both ways: nutrients like biotin, B12, thiamin, riboflavin and
pantothenic acid have **no established Tolerable Upper Intake Level**, so the app
was asserting a limit that does not exist — while niacin (UL 35 mg = 219% DV),
folate, iron, zinc and supplemental magnesium all cross their real limits below
300% DV and were never flagged at all.

Covers the no-UL nutrients, limits that sit below 300% DV, safe doses the old
rule wrongly flagged, the %DV-only fallback for labels with no absolute amount,
unrecognized ingredients (which must never be called over a limit), and the IU
case (never converted, since the conversion is form-dependent). Also checks
nutrient name resolution — `Sodium Selenite` must resolve to selenium, not
sodium.

Needs network for the live-DSLD section at the end, which skips itself if the
API is unreachable. The unit cases still run and assert.

## `cache-behavior.mts`

Pins down [`api/_lib/cache.ts`](../api/_lib/cache.ts).

The cache is best-effort by design: a failure must degrade to "regenerate from
scratch" rather than break a scan. It used to do that *silently*, which is how a
paused Supabase project went unnoticed for weeks — reads returned null, writes
did nothing, and nothing was logged.

Asserts both halves of the contract across six states — unconfigured,
unreachable, miss, write, hit, expired — checking that failures never throw into
the caller, that failures are always logged with something actionable, and that
ordinary misses and expiries stay quiet so the signal isn't buried.

The unconfigured and unreachable sections need nothing. The live sections need a
`.env` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; without it they skip
rather than fail. They write **one throwaway row** to the real `report_cache`
table (keyed `__cache_behavior_test__*`), delete it, and verify none remain.
