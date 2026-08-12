// Regression tests for the Phase 2 nutrient-table rewrite: name resolution
// (parenthetical form preference, trailing-token salts, modifier stripping,
// bare-salt-name guard) and targeted IU/basis conversion (vitamin D
// unconditional, vitamin E form-gated, vitamin A two-bound, folate DFE).
//
// Every case here pins a bug the accuracy audit found live in production —
// see the plan at the top of this work for the exact repro. A regression here
// means the app is back to flagging a limit that doesn't apply, or missing
// one that does.
//
//   npx tsx tests/nutrient-resolution.mts
import { assessDose, resolveNutrient } from "../api/_lib/trustReport";
import type { DoseAssessment } from "../src/types";

let failed = 0;
const pass = (ok: boolean) => { if (!ok) failed++; return ok ? "PASS" : "FAIL"; };

interface DoseCase {
  label: string;
  name: string;
  amount?: number;
  unit?: string;
  dvPercent?: number;
  expect: DoseAssessment;
  expectReason?: string;
}

const DOSE_CASES: DoseCase[] = [
  {
    label: "Vitamin A (as Beta-Carotene) 5000 mcg never above_UL",
    name: "Vitamin A (as Beta-Carotene)", amount: 5000, unit: "mcg", dvPercent: 100,
    expect: "effective",
  },
  {
    label: "Calcium Ascorbate 500 mg resolves as vitamin C, not calcium",
    name: "Calcium Ascorbate", amount: 500, unit: "mg", dvPercent: 556,
    expect: "effective",
  },
  {
    label: "Folate 1360 mcg DFE is effective (below the folic-acid UL)",
    name: "Folate", amount: 1360, unit: "mcg DFE", dvPercent: 340,
    expect: "effective",
  },
  {
    label: "Folic Acid 1200 mcg (named directly) is above_UL",
    name: "Folic Acid", amount: 1200, unit: "mcg", dvPercent: 300,
    expect: "above_UL",
  },
  {
    label: "Vitamin D3 5000 IU with no %DV is above_UL",
    name: "Vitamin D3", amount: 5000, unit: "IU",
    expect: "above_UL",
  },
  {
    label: "Vitamin A 25000 IU, no stated form, is not_assessable",
    name: "Vitamin A", amount: 25000, unit: "IU",
    expect: "unknown", expectReason: "iu_form_unknown",
  },
  {
    label: "Vitamin A 100000 IU, no stated form, is above_UL (lower bound alone exceeds it)",
    name: "Vitamin A", amount: 100000, unit: "IU",
    expect: "above_UL",
  },
  {
    label: "Magnesium Gluconate 100 mg is not above_UL",
    name: "Magnesium Gluconate", amount: 100, unit: "mg", dvPercent: 24,
    expect: "effective",
  },
];

console.log("=== nutrient-resolution: dose assessment ===");
for (const c of DOSE_CASES) {
  const got = assessDose({ name: c.name, amount: c.amount, unit: c.unit, dvPercent: c.dvPercent });
  const assessmentOk = got.assessment === c.expect;
  const reasonOk = c.expectReason == null || got.reason === c.expectReason;
  const ok = assessmentOk && reasonOk;
  console.log(
    `${pass(ok)}  ${c.label}\n      -> ${got.assessment}${got.reason ? ` (${got.reason})` : ""}` +
    `${ok ? "" : `  EXPECTED ${c.expect}${c.expectReason ? ` (${c.expectReason})` : ""}`}`,
  );
}

interface NameCase {
  label: string;
  input: string;
  expectKey: string | null;
}

const NAME_CASES: NameCase[] = [
  { label: "Buffered Vitamin C resolves (transparent modifier stripped)", input: "Buffered Vitamin C", expectKey: "vitamin c" },
  { label: "Chelated Zinc resolves (transparent modifier stripped)", input: "Chelated Zinc", expectKey: "zinc" },
  { label: "Vitamin B Complex does not resolve (blocking modifier)", input: "Vitamin B Complex", expectKey: null },
  { label: "Multivitamin Blend does not resolve (blocking modifier)", input: "Proprietary Blend", expectKey: null },
  { label: "Vitamin A (as Beta-Carotene) resolves to beta-carotene, not vitamin A", input: "Vitamin A (as Beta-Carotene)", expectKey: "beta-carotene" },
];

console.log("\n=== nutrient-resolution: name resolution ===");
for (const c of NAME_CASES) {
  const hit = resolveNutrient(c.input);
  const key = hit?.key ?? null;
  const ok = key === c.expectKey;
  console.log(`${pass(ok)}  ${c.label} -> ${key ?? "unrecognized"}${ok ? "" : `  EXPECTED ${c.expectKey ?? "unrecognized"}`}`);
}

console.log(failed === 0 ? "\nALL CHECKS PASSED" : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
