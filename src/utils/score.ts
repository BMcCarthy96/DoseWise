import type { DoseAssessment, DoseAssessmentReason, ScoreBreakdownLine, Verdict, Confidence, ProductMatchMethod, SourceStatus } from "../types";

// Deterministic scoring rubric — pure, no I/O, so both the server (before the
// Claude call, so the model writes prose around an already-decided verdict
// instead of inventing one) and the client (recomputing from a cached
// report's own structured data) get the identical number from the identical
// arithmetic. `breakdown` is not a post-hoc explanation of the score — it IS
// the score: `score` always equals the sum of `breakdown`'s points, so the
// number and its justification cannot contradict each other by construction.
//
// A product earns above 70 by demonstrating verifiable quality; it doesn't
// start at 100 and get punished down to it. Nothing scores 95 off a blurry
// photo — see the "caps" section below.

// Keyed by source module (api/_lib/openfda.ts, api/_lib/pubmed.ts — see Phase
// 4), not by individual endpoint: recalls and adverse events both come from
// openFDA, so a single "openfda" status covers both calls report.ts makes to
// it. (off.ts/dsld.ts have their own health, but those calls happen during
// /api/resolve, before a report is generated, so they don't factor in here —
// matchedBy already reflects how well identity was established.)
export interface SourceHealth {
  openfda: SourceStatus;
  pubmed: SourceStatus;
}

export interface VerdictIngredientInput {
  name: string;
  doseAssessment: DoseAssessment;
  doseAssessmentReason?: DoseAssessmentReason;
  /** Present only when doseAssessment === "above_UL". */
  ulSeverity?: "serious" | "tolerable";
  amountDisclosed: boolean;
  isBlendComponent: boolean;
  /** Whether this ingredient fell inside the PubMed research budget. */
  researched: boolean;
  citationCount: number;
}

export interface VerdictInput {
  source: "dsld" | "off" | "vision";
  matchedBy?: ProductMatchMethod;
  offMarket: boolean;
  ingredients: VerdictIngredientInput[];
  /** Disclosed ingredients past the research budget — never individually researched. */
  unresearchedCount: number;
  proprietaryBlendCount: number;
  /** One entry per banned/risky ingredient flag raised. */
  riskFlagCount: number;
  recalls: Array<{ classification: string; date: string }>;
  sourceHealth: SourceHealth;
  /** True when the only ingredient data is an unstructured OFF ingredients string. */
  ingredientsTextOnly: boolean;
}

export interface VerdictResult {
  score: number;
  grade: Verdict;
  confidence: Confidence;
  breakdown: ScoreBreakdownLine[];
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function isRecentClassI(r: { classification: string; date: string }): boolean {
  // Exact match only — a loose /class i/ test would also match "Class II"/"Class III".
  const isClassI = /^class\s*i$/i.test(r.classification.trim()) || r.classification.trim().toUpperCase() === "I";
  if (!isClassI) return false;
  const date = new Date(r.date);
  if (Number.isNaN(date.getTime())) return true; // undated record — treat conservatively as recent
  const threeYearsAgo = Date.now() - 3 * 365 * 24 * 60 * 60 * 1000;
  return date.getTime() >= threeYearsAgo;
}

export function computeVerdict(input: VerdictInput): VerdictResult {
  const breakdown: ScoreBreakdownLine[] = [{ label: "Base", points: 70 }];
  const add = (label: string, points: number) => {
    if (points !== 0) breakdown.push({ label, points });
  };

  const nonBlend = input.ingredients.filter((i) => !i.isBlendComponent);
  const assessable = input.ingredients.filter((i) => i.doseAssessment !== "unknown");
  const researched = input.ingredients.filter((i) => i.researched);

  // ── Credits (max +34) ─────────────────────────────────────────────────────
  if (input.matchedBy === "upc") add("Identity verified by barcode", 8);
  else if (input.matchedBy === "name") add("Identity verified by matching label details", 4);

  if (nonBlend.length > 0 && nonBlend.every((i) => i.amountDisclosed)) {
    add("Every ingredient discloses an exact amount", 6);
  }
  if (input.proprietaryBlendCount === 0 && input.ingredients.length >= 2) {
    add("No proprietary blends", 5);
  }
  const effectiveCount = assessable.filter((i) => i.doseAssessment === "effective").length;
  if (assessable.length >= 2 && effectiveCount === assessable.length) {
    add("All assessable ingredients sit at effective doses", 6);
  }
  if (input.sourceHealth.openfda === "ok" && input.recalls.length === 0) {
    add("Clean recall history (verified)", 5);
  }
  if (researched.length > 0 && researched.filter((i) => i.citationCount >= 3).length / researched.length >= 0.5) {
    add("Strong published research coverage", 4);
  }

  // ── Deductions (per-category subtotal, each capped) ─────────────────────────
  const aboveUlSerious = assessable.filter((i) => i.doseAssessment === "above_UL" && i.ulSeverity === "serious").length;
  add("Dosed above a safety limit", Math.max(aboveUlSerious * -20, -45));

  const aboveUlTolerable = assessable.filter((i) => i.doseAssessment === "above_UL" && i.ulSeverity === "tolerable").length;
  add("Dosed above a tolerable limit", Math.max(aboveUlTolerable * -8, -16));

  add("Contains a flagged ingredient", Math.max(input.riskFlagCount * -45, -70));

  const classI3y = input.recalls.filter(isRecentClassI).length;
  add("Recent Class I recall", Math.max(classI3y * -25, -40));
  const otherRecalls = input.recalls.length - classI3y;
  add("FDA recall on file", Math.max(otherRecalls * -8, -20));

  if (input.proprietaryBlendCount > 0) {
    const blendPoints = -12 + Math.max(0, input.proprietaryBlendCount - 1) * -4;
    add("Proprietary blend hides doses", Math.max(blendPoints, -24));
  }

  const undisclosed = nonBlend.filter((i) => !i.amountDisclosed).length;
  add("Ingredient dose not disclosed", Math.max(undisclosed * -4, -16));

  const belowEffective = assessable.filter((i) => i.doseAssessment === "below_effective").length;
  add("Below an effective dose", Math.max(belowEffective * -3, -9));

  add("Ingredients not individually researched", Math.max(input.unresearchedCount * -2, -10));

  if (input.offMarket) add("Marked off-market", -10);

  // not_assessable ingredients, an unreachable source, and adverse-event
  // report counts deliberately deduct nothing (see the plan this rubric
  // implements): a limitation we couldn't resolve is our infrastructure's
  // problem, not evidence the product is unsafe, and openFDA CAERS is
  // unverified self-report — it must never be why a product renders red.

  const rawScore = clamp(breakdown.reduce((s, l) => s + l.points, 0), 0, 100);

  // ── Final-score ceilings (take the minimum applicable) ──────────────────────
  const ceilings: number[] = [];
  if (input.riskFlagCount > 0) ceilings.push(30);
  if (classI3y > 0) ceilings.push(45);
  if (aboveUlSerious > 0) ceilings.push(60);
  if (assessable.length === 0) ceilings.push(65);
  if (input.source === "off" || input.offMarket) ceilings.push(75);
  if (input.source === "vision") ceilings.push(80);
  const anySourceUnreachable = input.sourceHealth.openfda !== "ok" || input.sourceHealth.pubmed !== "ok";
  if (input.proprietaryBlendCount >= 1 || anySourceUnreachable) ceilings.push(85);

  let score = ceilings.length > 0 ? Math.min(rawScore, ...ceilings) : rawScore;

  // A `bad` grade requires an actual safety finding — a serious above_UL, a
  // flagged ingredient, or a recall. Pure transparency problems (an opaque
  // blend, undisclosed doses) can push a product to the bottom of `caution`
  // but never into `bad`: unverifiable isn't the same claim as unsafe.
  const hasSafetyFinding = aboveUlSerious > 0 || input.riskFlagCount > 0 || input.recalls.length > 0;
  if (!hasSafetyFinding) score = Math.max(score, 45);
  score = clamp(score, 0, 100);

  if (score !== rawScore) {
    breakdown.push({
      label: score > rawScore ? "Raised to the floor (no safety finding)" : "Capped by a safety or transparency limit",
      points: score - rawScore,
    });
  }

  let grade: Verdict = score >= 75 ? "good" : score >= 45 ? "caution" : "bad";
  if (input.riskFlagCount > 0 || classI3y > 0) grade = "bad";

  const doseAssessablePct = input.ingredients.length ? assessable.length / input.ingredients.length : 0;
  const allSourcesOk = input.sourceHealth.openfda === "ok" && input.sourceHealth.pubmed === "ok";
  const citedPct = researched.length ? researched.filter((i) => i.citationCount > 0).length / researched.length : 0;
  const totalCitations = input.ingredients.reduce((s, i) => s + i.citationCount, 0);

  const low =
    input.source === "vision" ||
    !allSourcesOk ||
    doseAssessablePct < 0.5 ||
    totalCitations === 0 ||
    input.ingredientsTextOnly;
  const high = input.matchedBy === "upc" && doseAssessablePct >= 0.8 && allSourcesOk && citedPct >= 0.5;
  const confidence: Confidence = low ? "low" : high ? "high" : "medium";

  return { score, grade, confidence, breakdown };
}
