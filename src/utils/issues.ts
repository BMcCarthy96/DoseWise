import type { IssueCode, TrustReport } from "../types";

// Derive the scanned product's comparable label problems straight from its
// report — same vocabulary the alternatives engine uses on candidate labels, so
// "this one fixes X" is an apples-to-apples claim rather than a guess.
export function reportIssues(report: TrustReport): IssueCode[] {
  const issues = new Set<IssueCode>();
  const flags = report.labelTrust?.flags ?? [];
  const ingredients = report.breakdown?.ingredients ?? [];

  if (ingredients.some((i) => i.doseAssessment === "above_UL") || flags.some((f) => f.type === "dose_above_UL")) {
    issues.add("dose_above_UL");
  }
  if ((report.breakdown?.proprietaryBlends?.length ?? 0) > 0 || flags.some((f) => f.type === "proprietary_blend")) {
    issues.add("proprietary_blend");
  }
  if (flags.some((f) => f.type === "banned_or_risky_ingredient")) {
    issues.add("risky_ingredient");
  }
  // Treat a report as dose-blind only when most ingredients lack both an amount
  // and a %DV — mirrors the server-side hasMissingDoses threshold.
  const disclosed = ingredients.filter((i) => i.amount == null && i.dvPercent == null).length;
  if (ingredients.length > 0 && disclosed / ingredients.length >= 0.5) {
    issues.add("missing_doses");
  }

  return [...issues];
}
