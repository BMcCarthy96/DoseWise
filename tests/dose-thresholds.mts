// Regression tests for the nutrient-aware dose-safety threshold.
//
// Why this exists: DoseWise used to call any ingredient at >=300% DV "above the
// safe upper limit". That was wrong in both directions — several nutrients have
// NO established Tolerable Upper Intake Level (so the app was asserting a limit
// that does not exist), while niacin, folate, iron, zinc and supplemental
// magnesium all cross their real limits well below 300% DV and were never
// flagged. assessDose() now compares against each nutrient's own published UL.
//
// The cases below pin that behaviour down. A regression here means the app is
// either inventing a safety limit or missing a real one, both of which directly
// break the promise that DoseWise never makes up information.
//
//   npm run test:doses
//
// Needs network access for the live-DSLD section at the end; that section skips
// itself if the API is unreachable, and the unit cases still run and assert.
import { assessDose, lookupNutrientLimit } from "../api/_lib/trustReport";
import { getDsldLabel } from "../api/_lib/dsld";
import type { DoseAssessment } from "../src/types";

interface Case {
  name: string;
  amount?: number;
  unit?: string;
  dvPercent?: number;
  expect: DoseAssessment;
  why: string;
}

const CASES: Case[] = [
  // No UL has been established for these, so a huge %DV must never be reported
  // as a safety breach no matter how large it looks.
  { name: "Biotin", amount: 5000, unit: "mcg", dvPercent: 16667, expect: "effective", why: "biotin has NO established UL" },
  { name: "Vitamin B12 (as cyanocobalamin)", amount: 200, unit: "mcg", dvPercent: 8333, expect: "effective", why: "B12 has NO established UL" },
  { name: "Pantothenic Acid (as d-calcium pantothenate)", amount: 50, unit: "mg", dvPercent: 1000, expect: "effective", why: "B5 has NO established UL" },
  { name: "Thiamin (as thiamine HCl)", amount: 100, unit: "mg", dvPercent: 8333, expect: "effective", why: "thiamin has NO established UL" },
  { name: "Riboflavin", amount: 50, unit: "mg", dvPercent: 3846, expect: "effective", why: "riboflavin has NO established UL" },

  // Real limits that sit below 300% DV — the old flat rule missed every one.
  { name: "Niacin (as niacinamide)", amount: 50, unit: "mg", dvPercent: 313, expect: "above_UL", why: "UL 35 mg" },
  { name: "Niacin", amount: 40, unit: "mg", dvPercent: 250, expect: "above_UL", why: "UL 35 mg — below the old 300% cutoff" },
  { name: "Folate (as folic acid)", amount: 1360, unit: "mcg", dvPercent: 340, expect: "above_UL", why: "UL 1000 mcg" },
  { name: "Iron (as ferrous fumarate)", amount: 65, unit: "mg", dvPercent: 361, expect: "above_UL", why: "UL 45 mg" },
  { name: "Zinc (as zinc picolinate)", amount: 50, unit: "mg", dvPercent: 455, expect: "above_UL", why: "UL 40 mg" },
  { name: "Magnesium (as magnesium oxide)", amount: 400, unit: "mg", dvPercent: 95, expect: "above_UL", why: "supplemental UL 350 mg sits below 100% DV" },

  // Safe doses that the old rule wrongly flagged.
  { name: "Vitamin C (as ascorbic acid)", amount: 1000, unit: "mg", dvPercent: 1111, expect: "effective", why: "UL 2000 mg" },
  { name: "Vitamin B6 (as pyridoxine HCl)", amount: 10, unit: "mg", dvPercent: 588, expect: "effective", why: "UL 100 mg" },
  { name: "Selenium (as sodium selenite)", amount: 200, unit: "mcg", dvPercent: 364, expect: "effective", why: "UL 400 mcg" },
  { name: "Vitamin D3 (as cholecalciferol)", amount: 50, unit: "mcg", dvPercent: 250, expect: "effective", why: "UL 100 mcg" },
  { name: "Niacin", amount: 20, unit: "mg", dvPercent: 125, expect: "effective", why: "under the 35 mg UL" },
  { name: "Zinc", amount: 15, unit: "mg", dvPercent: 136, expect: "effective", why: "under the 40 mg UL" },
  { name: "Vitamin B6", amount: 150, unit: "mg", dvPercent: 8824, expect: "above_UL", why: "UL 100 mg" },

  // %DV-only fallback, for labels that disclose no absolute amount.
  { name: "Niacin", dvPercent: 400, expect: "above_UL", why: "400% DV exceeds the 219% DV UL ratio" },
  { name: "Vitamin C", dvPercent: 400, expect: "effective", why: "400% DV is under the 2222% DV UL ratio" },
  { name: "Biotin", dvPercent: 40000, expect: "effective", why: "no UL and no amount" },

  // Ingredients we cannot place must never be called over a limit — we don't
  // know their limit, so we don't claim one.
  { name: "Ashwagandha Root Extract", amount: 600, unit: "mg", expect: "unknown", why: "botanical, no DV or UL" },
  { name: "L-Citrulline", amount: 6, unit: "g", expect: "unknown", why: "amino acid, no DV" },
  { name: "Beta-Carotene", amount: 15000, unit: "mcg", dvPercent: 1667, expect: "effective", why: "provitamin A has no UL of its own" },

  // IU is form-dependent, so it is never converted; falls through to %DV.
  { name: "Vitamin D", amount: 2000, unit: "IU", dvPercent: 250, expect: "effective", why: "IU not converted; 250% is under the 500% ratio" },

  { name: "Vitamin C", amount: 10, unit: "mg", dvPercent: 11, expect: "below_effective", why: "under 20% DV" },
];

// Label spellings that must resolve to the right nutrient. "Sodium Selenite"
// is the trap: a naive leading-word match resolves it to sodium.
const NAME_CASES: Array<{ label: string; expectKey: string | null }> = [
  { label: "Vitamin B-12 (as Methylcobalamin)", expectKey: "vitamin b12" },
  { label: "d-Biotin", expectKey: "biotin" },
  { label: "Niacinamide", expectKey: "niacin" },
  { label: "Folic Acid", expectKey: "folate" },
  { label: "Magnesium Citrate", expectKey: "magnesium" },
  { label: "Calcium Carbonate", expectKey: "calcium" },
  { label: "Sodium Selenite", expectKey: "selenium" },
  { label: "Vitamin B5", expectKey: "pantothenic acid" },
  { label: "Pyridoxal 5-Phosphate", expectKey: "vitamin b6" },
  { label: "Green Tea Extract", expectKey: null },
];

let failed = 0;
const pass = (ok: boolean) => { if (!ok) failed++; return ok ? "PASS" : "FAIL"; };

console.log("=== dose assessment ===");
for (const c of CASES) {
  const got = assessDose(c).assessment;
  const ok = got === c.expect;
  console.log(
    `${pass(ok)}  ${c.name.padEnd(44)} ${String(c.amount ?? "-").padStart(6)} ${(c.unit ?? "").padEnd(4)} ` +
    `${String(c.dvPercent ?? "-").padStart(6)}%DV -> ${got}${ok ? "" : `  EXPECTED ${c.expect}`}   [${c.why}]`,
  );
}

console.log("\n=== nutrient name resolution ===");
for (const n of NAME_CASES) {
  const hit = lookupNutrientLimit(n.label);
  const key = hit?.key ?? null;
  const ok = key === n.expectKey;
  console.log(`${pass(ok)}  ${n.label.padEnd(40)} -> ${key ?? "unrecognized"}${ok ? "" : `  EXPECTED ${n.expectKey ?? "unrecognized"}`}`);
}

// Live DSLD labels: guards against the table drifting out of step with the
// real data shape. Skipped rather than failed when the API can't be reached.
console.log("\n=== live DSLD labels ===");
try {
  for (const id of [17131, 180062]) {
    const label = await getDsldLabel(id);
    if (!label) { console.log(`  SKIP  label ${id} not found`); continue; }
    console.log(`\n  [${id}] ${label.brand} — ${label.name}`);
    for (const i of label.ingredients.filter((x) => !x.isBlendComponent)) {
      if ((i.dvPercent ?? 0) < 300) continue;
      const d = assessDose({ name: i.name, amount: i.quantity, unit: i.unit, dvPercent: i.dvPercent });
      const hasUl = lookupNutrientLimit(i.name)?.limit.ul != null;
      // A high-%DV row may only be above_UL if its nutrient actually has a UL.
      const ok = d.assessment !== "above_UL" || hasUl;
      console.log(`  ${pass(ok)}  ${i.name.padEnd(38)} ${String(i.dvPercent).padStart(6)}%DV -> ${d.assessment}${hasUl ? "" : " (nutrient has no UL)"}`);
    }
  }
} catch (e) {
  console.log(`  SKIPPED — DSLD unreachable (${e instanceof Error ? e.message : String(e)})`);
}

console.log(failed === 0 ? "\nALL CHECKS PASSED" : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
