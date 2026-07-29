import type { ScoreFactor, TrustReport } from "../types";

// Validate model-supplied score factors: keep only well-formed entries with a
// known impact and non-empty text, cap at 5. Returns [] if nothing usable.
export function sanitizeScoreFactors(input: unknown): ScoreFactor[] {
  if (!Array.isArray(input)) return [];
  const out: ScoreFactor[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const impact = (raw as any)?.impact;
    const text = typeof (raw as any)?.text === "string" ? (raw as any).text.trim() : "";
    if (!text) continue;
    if (impact !== "positive" && impact !== "negative" && impact !== "neutral") continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ impact, text });
    if (out.length >= 5) break;
  }
  return out;
}

// Deterministically explain the grade straight from the report's own structured
// data — no AI, no external lookups, so it can never fabricate and it works on
// every cached report (including ones generated before scoreFactors existed).
// Used as a fallback whenever the model didn't supply usable factors.
export function deriveScoreFactors(report: TrustReport): ScoreFactor[] {
  const factors: ScoreFactor[] = [];
  const flags = report.labelTrust?.flags ?? [];
  const ingredients = report.breakdown?.ingredients ?? [];
  const recallCount = report.warnings?.recalls?.length ?? 0;

  // Strongest negatives first: banned/risky ingredients.
  for (const f of flags) {
    if (f.type === "banned_or_risky_ingredient" && f.detail?.trim()) {
      factors.push({ impact: "negative", text: f.detail.trim() });
    }
  }

  // FDA recalls on record.
  if (recallCount > 0) {
    factors.push({
      impact: "negative",
      text: `${recallCount} FDA recall record${recallCount > 1 ? "s" : ""} on file for this brand.`,
    });
  }

  // Ingredients dosed above their nutrient's tolerable upper intake level.
  const overUL = ingredients.filter((i) => i.doseAssessment === "above_UL");
  for (const i of overUL.slice(0, 2)) {
    factors.push({ impact: "negative", text: `${i.name} is dosed above its tolerable upper intake level.` });
  }

  // Positive: ingredients at effective, standard doses.
  const effective = ingredients.filter((i) => i.doseAssessment === "effective");
  if (effective.length > 0) {
    factors.push({
      impact: "positive",
      text:
        effective.length === ingredients.length
          ? `All ${effective.length} listed ingredient${effective.length > 1 ? "s sit" : " sits"} at an effective, standard dose.`
          : `${effective.length} of ${ingredients.length} ingredients sit at effective, standard doses.`,
    });
  }

  // Positive: clean recall history.
  if (recallCount === 0) {
    factors.push({ impact: "positive", text: "No FDA recalls found for this brand." });
  }

  // Proprietary blend hides doses.
  if ((report.breakdown?.proprietaryBlends?.length ?? 0) > 0 || flags.some((f) => f.type === "proprietary_blend")) {
    factors.push({ impact: "negative", text: "A proprietary blend hides the exact dose of some ingredients." });
  }

  // Claims not supported by the evidence.
  if (flags.some((f) => f.type === "unsupported_claim")) {
    factors.push({ impact: "negative", text: "Some label claims aren't backed by strong evidence." });
  }

  // Limiting factor: missing data / low confidence.
  if (report.verdict?.confidence === "low" || flags.some((f) => f.type === "data_gap")) {
    factors.push({
      impact: "neutral",
      text: "Some exact doses or data were missing, which limits how confidently it can be scored.",
    });
  }

  // Dedupe by text and cap at 5.
  const seen = new Set<string>();
  const out: ScoreFactor[] = [];
  for (const f of factors) {
    const key = f.text.trim().toLowerCase();
    if (!f.text.trim() || seen.has(key)) continue;
    seen.add(key);
    out.push(f);
    if (out.length >= 5) break;
  }
  return out;
}

// Single entry point for the UI: prefer the model's factors when it supplied
// usable ones, otherwise fall back to the deterministic derivation.
export function getScoreFactors(report: TrustReport): ScoreFactor[] {
  const fromModel = sanitizeScoreFactors(report.verdict?.scoreFactors);
  return fromModel.length > 0 ? fromModel : deriveScoreFactors(report);
}
