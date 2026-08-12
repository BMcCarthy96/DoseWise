// Regression tests for the deterministic scoring rubric (Phase 3).
//
// Why this exists: the old score was never computed anywhere — the model
// invented a number and the UI rendered whatever it said, so a report could
// show "All 3 ingredients at effective doses / No FDA recalls" underneath a
// red 41/100. computeVerdict() is a pure function: score is always exactly
// the sum of breakdown's points, so a silent change to a constant here fails
// loudly rather than quietly drifting the number away from its own
// explanation.
//
//   npx tsx tests/score-rubric.mts
import { computeVerdict, type VerdictInput, type VerdictIngredientInput } from "../src/utils/score";

let failed = 0;
const pass = (ok: boolean) => { if (!ok) failed++; return ok ? "PASS" : "FAIL"; };

function sumOk(breakdown: { points: number }[], score: number): boolean {
  return breakdown.reduce((s, l) => s + l.points, 0) === score;
}

function ingredient(over: Partial<VerdictIngredientInput> & { name: string }): VerdictIngredientInput {
  return {
    doseAssessment: "effective",
    amountDisclosed: true,
    isBlendComponent: false,
    researched: false,
    citationCount: 0,
    ...over,
  };
}

console.log("=== clean DSLD multivitamin: high credits, small research-budget deduction ===");
{
  const researched = [4, 3, 5, 2, 3, 4].map((c, i) => ingredient({ name: `R${i}`, researched: true, citationCount: c }));
  const unresearched = [0, 1, 2].map((i) => ingredient({ name: `U${i}` }));
  const input: VerdictInput = {
    source: "dsld",
    matchedBy: "upc",
    offMarket: false,
    ingredients: [...researched, ...unresearched],
    unresearchedCount: 3,
    proprietaryBlendCount: 0,
    riskFlagCount: 0,
    recalls: [],
    sourceHealth: { openfda: "ok", pubmed: "ok" },
    ingredientsTextOnly: false,
  };
  const r = computeVerdict(input);
  console.log(`${pass(r.score === 98)}  score = ${r.score} (expected 98)`);
  console.log(`${pass(r.grade === "good")}  grade = ${r.grade} (expected good)`);
  console.log(`${pass(r.confidence === "high")}  confidence = ${r.confidence} (expected high)`);
  console.log(`${pass(sumOk(r.breakdown, r.score))}  breakdown sums to score`);
}

console.log("\n=== same product, one TOLERABLE magnesium above_UL: loses the all-effective credit, still good ===");
{
  const researched = [4, 3, 5, 2, 3, 4].map((c, i) =>
    i === 0
      ? ingredient({ name: "Magnesium", researched: true, citationCount: c, doseAssessment: "above_UL", ulSeverity: "tolerable" })
      : ingredient({ name: `R${i}`, researched: true, citationCount: c }),
  );
  const unresearched = [0, 1, 2].map((i) => ingredient({ name: `U${i}` }));
  const input: VerdictInput = {
    source: "dsld",
    matchedBy: "upc",
    offMarket: false,
    ingredients: [...researched, ...unresearched],
    unresearchedCount: 3,
    proprietaryBlendCount: 0,
    riskFlagCount: 0,
    recalls: [],
    sourceHealth: { openfda: "ok", pubmed: "ok" },
    ingredientsTextOnly: false,
  };
  const r = computeVerdict(input);
  console.log(`${pass(r.score === 84)}  score = ${r.score} (expected 84 — a tolerable overage costs points but never forces bad)`);
  console.log(`${pass(r.grade === "good")}  grade = ${r.grade} (expected good — magnesium's own UL note says this is typically just GI upset)`);
  console.log(`${pass(sumOk(r.breakdown, r.score))}  breakdown sums to score`);
}

console.log("\n=== DMAA pre-workout: risk flag caps the score regardless of everything else ===");
{
  const input: VerdictInput = {
    source: "dsld",
    matchedBy: "upc",
    offMarket: false,
    ingredients: [
      ingredient({ name: "DMAA", doseAssessment: "unknown", doseAssessmentReason: "unknown_nutrient" }),
      ingredient({ name: "Caffeine" }),
      ingredient({ name: "Beta-Alanine" }),
    ],
    unresearchedCount: 0,
    proprietaryBlendCount: 0,
    riskFlagCount: 1,
    recalls: [],
    sourceHealth: { openfda: "ok", pubmed: "ok" },
    ingredientsTextOnly: false,
  };
  const r = computeVerdict(input);
  console.log(`${pass(r.score === 30)}  score = ${r.score} (expected 30 — hard-capped)`);
  console.log(`${pass(r.grade === "bad")}  grade = ${r.grade} (expected bad)`);
  const hasFlagLine = r.breakdown.some((l) => l.label === "Contains a flagged ingredient" && l.points === -45);
  console.log(`${pass(hasFlagLine)}  breakdown includes "Contains a flagged ingredient" at -45`);
  console.log(`${pass(sumOk(r.breakdown, r.score))}  breakdown sums to score`);
}

console.log("\n=== opaque blend: the plan's own worked example (70 - 12 - 16 = 42, floored to 45) ===");
{
  const blendComponents = [0, 1, 2].map((i) =>
    ingredient({ name: `Blend${i}`, isBlendComponent: true, amountDisclosed: false, doseAssessment: "unknown", doseAssessmentReason: "blend_component" }),
  );
  const undisclosedNonBlend = [0, 1, 2, 3].map((i) =>
    ingredient({ name: `Undisclosed${i}`, amountDisclosed: false, doseAssessment: "unknown", doseAssessmentReason: "no_dose_given" }),
  );
  const input: VerdictInput = {
    source: "dsld",
    matchedBy: "photo",
    offMarket: false,
    ingredients: [...blendComponents, ...undisclosedNonBlend],
    unresearchedCount: 0,
    proprietaryBlendCount: 1,
    riskFlagCount: 0,
    recalls: [],
    sourceHealth: { openfda: "unreachable", pubmed: "unreachable" },
    ingredientsTextOnly: false,
  };
  const r = computeVerdict(input);
  console.log(`${pass(r.score === 45)}  score = ${r.score} (expected 45 — floored, never bad for an opaque-but-not-unsafe product)`);
  console.log(`${pass(r.grade === "caution")}  grade = ${r.grade} (expected caution, NOT bad)`);
  console.log(`${pass(r.confidence === "low")}  confidence = ${r.confidence} (expected low)`);
  const hasBlendLine = r.breakdown.some((l) => l.label === "Proprietary blend hides doses" && l.points === -12);
  const hasUndisclosedLine = r.breakdown.some((l) => l.label === "Ingredient dose not disclosed" && l.points === -16);
  const hasFloorLine = r.breakdown.some((l) => l.label === "Raised to the floor (no safety finding)");
  console.log(`${pass(hasBlendLine)}  breakdown includes the -12 blend deduction`);
  console.log(`${pass(hasUndisclosedLine)}  breakdown includes the -16 (capped) undisclosed-dose deduction`);
  console.log(`${pass(hasFloorLine)}  breakdown includes the floor-raise line`);
  console.log(`${pass(sumOk(r.breakdown, r.score))}  breakdown sums to score`);
}

console.log("\n=== openFDA unreachable: no clean-recall credit, confidence forced low, score capped at 85 ===");
{
  const researched = [4, 3, 5, 2, 3, 4].map((c, i) => ingredient({ name: `R${i}`, researched: true, citationCount: c }));
  const unresearched = [0, 1, 2].map((i) => ingredient({ name: `U${i}` }));
  const input: VerdictInput = {
    source: "dsld",
    matchedBy: "upc",
    offMarket: false,
    ingredients: [...researched, ...unresearched],
    unresearchedCount: 3,
    proprietaryBlendCount: 0,
    riskFlagCount: 0,
    recalls: [],
    sourceHealth: { openfda: "unreachable", pubmed: "ok" },
    ingredientsTextOnly: false,
  };
  const r = computeVerdict(input);
  console.log(`${pass(r.score === 85)}  score = ${r.score} (expected 85 — capped, not the 98 the same ingredients scored with openFDA reachable)`);
  console.log(`${pass(r.confidence === "low")}  confidence = ${r.confidence} (expected low)`);
  const hasCleanRecallCredit = r.breakdown.some((l) => l.label === "Clean recall history (verified)");
  console.log(`${pass(!hasCleanRecallCredit)}  no "clean recall" credit when the search never ran`);
  console.log(`${pass(sumOk(r.breakdown, r.score))}  breakdown sums to score`);
}

console.log(failed === 0 ? "\nALL CHECKS PASSED" : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
