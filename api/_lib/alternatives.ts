// Suggested alternatives — deterministic, DSLD-sourced.
//
// ACCURACY CONTRACT: every suggested product is a real NIH DSLD label, found by
// searching DSLD and verified by fetching its actual label. No AI is involved in
// choosing or describing an alternative, so a product name, brand, dose, or
// "fix" can never be fabricated. We also never show a DoseWise score for an
// alternative, because we haven't run the full report pipeline on it — the card
// offers to scan it properly instead.

import { getDsldLabel, type DsldLabel, type DsldIngredient } from "./dsld";
import { checkDoseAssessment, flagRiskyIngredient } from "./trustReport";

const DSLD_BASE = "https://api.ods.od.nih.gov/dsld/v9";

// The label problems we can detect deterministically from DSLD data alone.
export const ISSUE_CODES = [
  "dose_above_UL",
  "proprietary_blend",
  "risky_ingredient",
  "missing_doses",
] as const;
export type IssueCode = (typeof ISSUE_CODES)[number];

export function isIssueCode(v: unknown): v is IssueCode {
  return typeof v === "string" && (ISSUE_CODES as readonly string[]).includes(v);
}

export interface Alternative {
  dsldId: number;
  upc?: string;
  brand: string;
  name: string;
  fixes: string[];   // what this product does better, stated factually from its label
  caveats: string[]; // honest downsides so we never oversell it
}

const MAX_CANDIDATE_LABELS = 10;
const MAX_RESULTS = 3;

function nonBlendIngredients(label: DsldLabel): DsldIngredient[] {
  return label.ingredients.filter((i) => !i.isBlendComponent);
}

// Ingredients dosed above their own nutrient's Tolerable Upper Intake Level,
// using the same per-nutrient check the report itself uses so the comparison
// stays consistent. Nutrients with no established UL (biotin, B12, etc.) are
// never counted here regardless of how high their %DV runs.
function overLimitIngredients(label: DsldLabel): DsldIngredient[] {
  return nonBlendIngredients(label).filter(
    (i) =>
      checkDoseAssessment({
        name: i.name,
        amount: i.quantity,
        unit: i.unit,
        dvPercent: i.dvPercent,
      }) === "above_UL",
  );
}

function riskyIngredients(label: DsldLabel): string[] {
  return label.ingredients.map((i) => i.name).filter((n) => flagRiskyIngredient(n) != null);
}

// "Missing doses" = most disclosed ingredients carry neither an amount nor a
// %DV, which is what makes a product hard to assess.
function hasMissingDoses(label: DsldLabel): boolean {
  const rows = nonBlendIngredients(label);
  if (rows.length === 0) return true;
  const undisclosed = rows.filter((i) => i.quantity == null && i.dvPercent == null).length;
  return undisclosed / rows.length >= 0.5;
}

export function labelIssues(label: DsldLabel): Set<IssueCode> {
  const issues = new Set<IssueCode>();
  if (overLimitIngredients(label).length > 0) issues.add("dose_above_UL");
  if (label.proprietaryBlends.length > 0) issues.add("proprietary_blend");
  if (riskyIngredients(label).length > 0) issues.add("risky_ingredient");
  if (hasMissingDoses(label)) issues.add("missing_doses");
  return issues;
}

// Plain-language, factual statement of what this candidate does better — each
// line is derived from the candidate's own label, never generated.
function describeFix(issue: IssueCode): string {
  switch (issue) {
    case "dose_above_UL":
      return "No ingredient exceeds its tolerable upper intake level.";
    case "proprietary_blend":
      return "No proprietary blend — every ingredient's dose is disclosed.";
    case "risky_ingredient":
      return "Contains no ingredient we flag as risky or FDA-restricted.";
    case "missing_doses":
      return "Lists exact amounts for its ingredients.";
  }
}

function describeCaveat(issue: IssueCode, label: DsldLabel): string {
  switch (issue) {
    case "dose_above_UL": {
      const names = overLimitIngredients(label).map((i) => i.name).slice(0, 2);
      return names.length
        ? `${names.join(" and ")} ${names.length > 1 ? "are" : "is"} dosed above the tolerable upper intake level.`
        : "Contains an ingredient above its tolerable upper intake level.";
    }
    case "proprietary_blend":
      return "Uses a proprietary blend, so some doses aren't disclosed.";
    case "risky_ingredient": {
      const names = riskyIngredients(label).slice(0, 2);
      return names.length
        ? `Contains ${names.join(" and ")}, which we flag as risky.`
        : "Contains an ingredient we flag as risky.";
    }
    case "missing_doses":
      return "Doesn't list exact amounts for most ingredients.";
  }
}

interface SearchHit {
  id: string;
  brand: string;
  name: string;
  offMarket: boolean;
}

async function searchDsldProducts(query: string): Promise<SearchHit[]> {
  const res = await fetch(`${DSLD_BASE}/search-filter?q=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  const data = await res.json().catch(() => null);
  const hits = Array.isArray(data?.hits) ? data.hits : [];
  return hits
    .map((h: any) => ({
      id: String(h?._id ?? ""),
      brand: h?._source?.brandName ?? "",
      name: h?._source?.fullName ?? "",
      // DSLD encodes offMarket as 0/1
      offMarket: Boolean(Number(h?._source?.offMarket ?? 0)),
    }))
    .filter((h: SearchHit) => h.id && h.name);
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Find real DSLD products that fix at least one of the scanned product's issues
 * without introducing a worse one. Returns [] when nothing genuinely better is
 * found — we'd rather show nothing than a bogus recommendation.
 */
export async function findAlternatives(
  product: { brand: string; name: string; dsldId?: number },
  scannedIssues: Set<IssueCode>,
): Promise<Alternative[]> {
  if (scannedIssues.size === 0) return [];

  const hits = await searchDsldProducts(product.name).catch(() => []);

  // Drop the scanned product itself, anything off-market, and duplicate
  // brand+name entries before spending a label fetch on them.
  const seen = new Set<string>();
  const candidates = hits
    .filter((h) => !h.offMarket)
    .filter((h) => String(h.id) !== String(product.dsldId ?? ""))
    .filter((h) => !(norm(h.brand) === norm(product.brand) && norm(h.name) === norm(product.name)))
    .filter((h) => {
      const key = `${norm(h.brand)}|${norm(h.name)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_CANDIDATE_LABELS);

  const labels = (
    await Promise.all(candidates.map((c) => getDsldLabel(c.id).catch(() => null)))
  ).filter((l): l is DsldLabel => l != null && !l.offMarket);

  const scored = labels
    .map((label) => {
      const issues = labelIssues(label);
      const fixed = [...scannedIssues].filter((i) => !issues.has(i));
      const introduced = [...issues].filter((i) => !scannedIssues.has(i));
      return { label, issues, fixed, introduced };
    })
    // Must genuinely improve on something, and must not introduce a NEW problem
    // the scanned product didn't have — otherwise it isn't an upgrade.
    .filter((c) => c.fixed.length > 0 && c.introduced.length === 0)
    .sort(
      (a, b) =>
        b.fixed.length - a.fixed.length ||
        a.issues.size - b.issues.size ||
        a.label.brand.localeCompare(b.label.brand),
    )
    .slice(0, MAX_RESULTS);

  return scored.map(({ label, issues, fixed }) => ({
    dsldId: label.dsldId,
    upc: label.upc ? label.upc.replace(/\D/g, "") : undefined,
    brand: label.brand,
    name: label.name,
    fixes: fixed.map(describeFix),
    caveats: [...issues].map((i) => describeCaveat(i, label)),
  }));
}
