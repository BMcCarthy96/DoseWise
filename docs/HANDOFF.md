# Handoff — factual accuracy hardening + UI discoverability

Covers everything new on `main` since `72cffa9` (the security hardening commit):

| Commit | What |
|---|---|
| `47a6009` | Factual accuracy hardening — 6 phases, 25 files, the bulk of this handoff |
| `a82c7ee` | Make photo upload and the disclaimer reachable |
| `56e7e05` | Keep photo actions in the FAB menu only |

Everything typechecks clean (`npx tsc --noEmit`) and all 7 test suites pass (`npm test`).

---

## 1. The one rule that explains most of the diff

**The server owns every fact; the model owns only prose.**

Before this work, `/api/report` asked Claude to *copy* the server's dose math into its
JSON response and nothing verified that it did. The headline score was never computed
at all — `api/report.ts` clamped whatever the model invented to 0–100 and defaulted to
50. Meanwhile the client built a *deterministic* justification from data that number
had never seen, so the UI could render "All 3 ingredients at effective doses / No FDA
recalls" underneath a red 41/100.

Now: the server computes, the model narrates, and the server overwrites the model's
copy afterward regardless.

| Field | Owner |
|---|---|
| `name`, `amount`, `unit`, `dvPercent` | server |
| `doseAssessment`, `doseAssessmentReason` | server |
| `verdict.{score,grade,confidence,scoreBreakdown}` | server |
| `warnings` / safety flags | server |
| `product`, `recalls`, `adverseEventSummary` | server |
| `headline`, `summary`, `note`, `evidenceGrade`, `category`, `researchConsensus` | model |

**If you add a field, decide which column it belongs in before writing the prompt.**
Anything that asserts a fact about the product belongs to the server.

---

## 2. Deterministic scoring — `src/utils/score.ts` (new)

`computeVerdict(input: VerdictInput): VerdictResult` is a pure function, no I/O. It is
the single source of the score, grade, confidence, and the breakdown that explains them.

Two non-obvious properties, both load-bearing:

**It runs *before* the Claude call.** All inputs are available pre-call, so the verdict
goes *into* the prompt as an already-decided fact ("write prose consistent with it, do
not restate or contest it"), then is re-asserted onto the response afterward. A
post-hoc overwrite would leave the model's headline arguing with the grade.

**The explanation is the arithmetic.** `scoreBreakdown` lists the applied deltas and
sums to the score by construction. The number and its justification cannot contradict
each other — which is exactly what failed before.

Shape: base 70, credits up to +34, deductions with per-category caps, then hard caps,
then one floor. Details live in the code with comments; `tests/score-rubric.mts` pins
exact scores *and* full deduction lists so a silent constant change fails loudly.

Three deliberate zero-weight inputs, each with a code comment explaining why:

- **`not_assessable`** — our limitation, not the product's. Caps confidence, deducts nothing.
- **Any source unreachable** — our infrastructure, never the product's fault.
- **Adverse-event reports** — openFDA brand matching over-captures and CAERS is
  unverified self-report. It must never be why a product renders red. Revisit later.

One floor worth knowing: **45 when there is no safety finding.** A `bad` grade requires
a serious `above_UL`, a risky ingredient, or a recall. Transparency problems (opaque
blends, undisclosed doses) can push a product to the bottom of `caution` but never into
`bad` — an opaque blend is *unverifiable*, not *unsafe*, and grading it bad is its own
fabrication.

`evidenceGrade` is deliberately **not** an input — it's model-assigned over a weak
retrieval pipeline, so letting it move a number that claims to be deterministic would
reintroduce the fabrication being removed. The server-owned proxy is how many PubMed
articles were actually retrieved.

### Cache invalidation

`reportVersion` is now `2`, and `getCachedReport` treats `report_version < 2` as a miss
(`api/_lib/cache.ts:64`). This clears every previously-invented score on deploy. **If
you change the rubric in a way that alters existing scores, bump both.**

`deriveScoreFactors` (`src/utils/scoreFactors.ts`) survives *only* as the legacy
fallback for cached reports without `scoreBreakdown`. Don't extend it.

---

## 3. "We couldn't check" is now a distinct state

Every source client used to return `[]` / `null` / `""` on failure, which the prompt
turned into "No openFDA enforcement records found for this brand." **An outage was
being presented to the user as a clean safety finding.**

All source clients now return an envelope:

```ts
type SourceStatus = "ok" | "unreachable" | "rate_limited" | "malformed";
interface SourceResult<T> { status: SourceStatus; data: T; checkedAt: string; }
```

`data` keeps today's empty value on failure so call sites that ignore `.status` still
work. `status: "ok"` with empty data is the "searched, found nothing" case that
previously had no representation.

This flows all the way through: `api/report.ts` assembles `sourceHealth` → prompt uses
**three-way** wording (records found / searched-and-clean / *"could not be reached —
recall status is UNKNOWN, not clean. Do not state that there are no recalls."*) →
`computeVerdict` withholds the clean-recall credit and forces `confidence: "low"` →
`meta.sources` reaches the UI → `SourcesFooter` says "unreachable for this report"
instead of implying a clean check.

**If you add a source, give it an envelope and wire it into `sourceHealth`.** Returning
a bare empty array reintroduces the exact bug this phase existed to kill.

Related: reports generated with any non-`ok` source get a **6-hour** TTL
(`DEGRADED_CACHE_TTL_MS`) instead of 7 days, so an outage isn't frozen into the shared
cache. Normal TTL dropped 30d → 7d.

### Timeouts — `api/_lib/http.ts` (new)

There was previously **no fetch timeout anywhere in `api/`**. `fetchWithTimeout` wraps
`AbortSignal.timeout()` with one retry (250ms jitter) on network-abort and 5xx only,
never 4xx. Budgets: DSLD 6s, PubMed 6s (efetch 8s), openFDA 6s, OFF 5s. All 10 call
sites migrated. The route has a 300s Vercel budget but a human is waiting.

---

## 4. Product identity — you could previously get a report for a different product

`findDsldIdByName` took `hits[0]` from a full-text search with **zero verification**,
and `api/resolve.ts` then discarded the vision-extracted ingredients and substituted
that label wholesale. Scan a 1000 IU bottle, get a confident, fully-detailed report for
the 5000 IU version.

Replaced with `findDsldLabelByName(brand, name, visionIngredients)`, which returns a
verified label or `null`, mirroring how `findDsldLabelByUpc` already worked. Four gates:

1. **Brand** — Dice bigram ≥ 0.80, or token-subset sharing ≥1 non-stopword token.
2. **Name** — Dice ≥ 0.70 AND ≥60% of significant tokens present.
3. **Strength** — *the gate that fixes the bug.* Both sides have strength tokens → sets
   must be **equal**. One side has them and the other doesn't → **fail**. A label saying
   "1000 IU" can never match an entry that doesn't.
4. **Ingredient corroboration** (soft) — only when vision produced ≥2 ingredients with
   amounts.

Fallback ladder: gates 1–3 fail → return `null`, keep the vision payload untouched.
Gates 1–3 pass but 4 skipped/failed → adopt the DSLD label but **keep the vision
`productKey`**, so a name-only match can never write into a barcode-keyed cache entry.
Gate 4 also passes → re-key to the DSLD UPC.

`matchedBy: "upc" | "name" | "photo"` now rides along on `NormalizedProduct` and
`TrustReport["product"]`, and is rendered as a provenance line so a vision-derived
breakdown stops being pixel-identical to a DSLD-derived one.

---

## 5. The nutrient table — real wrong answers, now fixed

These were verified against the live code before the fix, not hypothesized:

| Input | Was | Now |
|---|---|---|
| `Vitamin A (as Beta-Carotene) 5000 mcg` | `above_UL` — *while printing the sentence saying that limit doesn't apply to beta-carotene* | resolves to beta-carotene, never `above_UL` |
| `Calcium Ascorbate 500 mg` | resolved as **calcium** | vitamin C |
| `Buffered Vitamin C`, `Chelated Zinc` | silently resolved to nothing | resolve correctly |
| `Folate 1360 mcg DFE` | `above_UL` (false positive) | `effective` — 1360 DFE ÷ 1.7 = 800 mcg folic acid, under the 1000 UL |
| `Vitamin D3 5000 IU`, no %DV | "Dose not disclosed" | `above_UL` — genuinely 125 mcg vs a 100 mcg limit |

Three structural changes underneath:

**Basis split.** DV and UL are expressed in *different units* but shared one `unit`
field. `NutrientLimit` now carries `dv?: {amount, unit, basis}` and
`ul?: {amount, unit, basis, note?, severity}` across all 33 entries. Folate DV is mcg
DFE but its UL is mcg folic acid; niacin DV is mg NE but its UL is mg supplemental;
vitamin A DV is mcg RAE but its UL is preformed retinol only; magnesium's UL is
supplemental-only. A basis parser handles DSLD passing `"mcg DFE"` through raw.

**`severity: "serious" | "tolerable"`** is new and load-bearing for scoring. Magnesium's
own note concedes that exceeding its UL "typically causes diarrhea rather than serious
harm, and many magnesium supplements are dosed above it" — it must not deduct like a
vitamin A overdose. Magnesium and niacin are `tolerable`; the rest `serious`.

**A refusal rule.** If the label's basis can't be established as the UL's basis, we do
**not** assert `above_UL`. Vitamin A with no stated form → `not_assessable`, not a
guess. This is the governing principle for the whole area: *fail toward silence, never
toward a false alarm.* A wrong "ABOVE SAFE UPPER LIMIT" on an ordinary magnesium
product costs more trust than a missed flag.

IU conversion is now targeted rather than blanket-refused: **vitamin D** converts
unconditionally (0.025 mcg/IU, no form ambiguity exists); **vitamin E** only with a
stated form, defaulting to the lower mg figure that cannot manufacture a false positive;
**vitamin A** uses a two-bound rule and flags only if the *lower* bound exceeds the UL.

`doseAssessmentReason` was added as an optional sibling to `doseAssessment` rather than
migrating the enum, so cached reports keep rendering. `"unknown"` used to always render
as "Dose not disclosed" — false when the label plainly *does* print an amount and we
merely can't place it.

---

## 6. UI changes

**Presentation honesty (`47a6009`)** — `VerdictHero` desaturates on low confidence
(neutral surface, coloured left border, smaller score, "ESTIMATED" label). A
`good` + `low confidence` report rendering as a full-bleed green card was the single
most misleading thing in the app. `WarningList` gained causation copy for adverse
events ("unverified, self-reported… do not establish that the product caused the
reaction"). `BreakdownChart` always renders the citations block — absence of evidence
communicated by absence of interface was itself a failure mode. `ResultsScreen` gained
a staleness banner + Re-check button, and `SourcesFooter` now derives its claims from
`meta.sources` instead of unconditionally listing PubMed/openFDA.

**Discoverability (`a82c7ee`, `56e7e05`)** — both were *discoverability* fixes, not
missing features:

- Gallery upload already existed inside `LabelPhotoScreen` but was reachable only via a
  button labelled "Photo the label" with a camera icon. Now in the FAB menu as "Upload
  Photo", with a `pick: "camera" | "library"` route param so both entries jump straight
  into the picker. `56e7e05` then removed the duplicate buttons from the scan screen —
  the FAB menu is the single entry point.
- The disclaimer gate shows once and stores acceptance in AsyncStorage
  (`dosewise.disclaimer_accepted.v1`), after which the text was **permanently
  unreachable**. Extracted `DisclaimerBody` so the gate and a new read-only
  `DisclaimerScreen` share one source of text; reachable via Settings → "Review
  disclaimer". This also revived the "Data sources" row, which had no `onPress` and did
  nothing when tapped.

---

## 7. Tests

`npm test` chains 7 suites. Plain `tsx` scripts, no framework — intentional, don't add
vitest.

| Suite | Covers |
|---|---|
| `test:doses` | dose thresholds (+ live DSLD section) |
| `test:nutrients` | name→nutrient resolution, unit basis, IU conversion |
| `test:dsld-match` | the similarity gates (offline + live) |
| `test:score` | the rubric as a pure function |
| `test:sources` | client failure envelopes (stubs `globalThis.fetch`) |
| `test:cache` | cache hit/miss/expiry/version behaviour |
| `test:security` | signed payloads, bounded inputs, prompt-injection hygiene |

Two suites make **live network calls** (DSLD, Supabase) and will fail offline rather
than skip — that's existing behaviour, not new.

`tests/score-rubric.mts` asserts exact scores *and* full deduction lists. If you change
a constant, it will fail — that is the point, not a flaky test.

---

## 8. Environment note (cost me time, may cost you time)

The project lives in WSL (`~/Projects/DoseWise`) but there is **no `node` on `PATH` in
non-interactive shells** — `npm`/`npx` resolve to Windows nvm4w wrappers via PATH
interop, whose `.cmd` files spawn `cmd.exe`, which rejects a UNC working directory.

Interactive terminals are fine (`.bashrc` sources nvm). For scripted/non-interactive
runs:

```bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use v22.23.2
```

Do **not** run a full `npm install` from the Windows side against the WSL
`node_modules` — Linux symlinks read as directories to Windows npm and it throws
`EISDIR`/`EPERM` mid-run.

---

## 9. Known gaps / deliberately not done

- **UI not visually verified on device by me** — the Expo dev server couldn't be started
  from my environment, so every UI change in `47a6009` is typecheck-verified only. The
  `a82c7ee`/`56e7e05` changes are likewise unverified visually. Worth an eyeball pass on
  the low-confidence hero, the staleness banner, and the empty-citations state.
- **Adverse events carry zero scoring weight** (see §2). Revisit once openFDA brand
  matching has held up in practice.
- **No salt→elemental-fraction table.** DSLD rows named for a salt (`Magnesium
  Gluconate 100 mg`) downgrade to `not_assessable` when the assessment would be
  `above_UL` by less than 2×. Conservative on purpose — a new numeric table nobody will
  re-derive carries its own correctness risk.
- **No full semantic PubMed relevance scoring.** Took the cheap wins only (`&sort=relevance`,
  `pubtype` capture, per-PMID abstract attribution, fixed an `ids.map`/`summaryData`
  mismatch that produced "Untitled" citations).
- **`searchDsldProducts` in `alternatives.ts` is still unverified by the identity gates**
  — alternatives are *supposed* to be different products, each is verified by fetching
  its real label, and the UI never claims one is what you scanned.

## 10. Don't regress these

They were already careful before this work and remain load-bearing:

- UPC verification in `dsld.ts`
- blend / undisclosed-quantity normalization in `dsld.ts`
- the PMID whitelist scrub in `api/report.ts`
- the deliberate refusal to invent a UL where none exists
- `sanitizeReviews` dropping uncited certifications
- the signed-resolve-token flow (`api/_lib/signing.ts`) — `tests/security.mts` pins the
  same `productKey` derivation the identity work touches
