// NIH ODS Dietary Supplement Label Database (DSLD) v9 client.
// https://api.ods.od.nih.gov/dsld/v9/ — free, keyless.
//
// Critical gotcha (confirmed by live testing): UPCs are indexed in spaced
// UPC-A human-readable form, e.g. "0 74312 02100 8" (1-5-5-1 grouping). A
// query with the raw 12-digit string returns zero hits, so we always try the
// spaced form first.

import { lookupNutrientLimit } from "./trustReport";
import { fetchWithTimeout } from "./http";

const DSLD_BASE = "https://api.ods.od.nih.gov/dsld/v9";
const DSLD_TIMEOUT_MS = 6000;

export interface DsldIngredient {
  name: string;
  category?: string;
  quantity?: number;
  unit?: string;
  dvPercent?: number;
  isBlendComponent: boolean;
}

export interface DsldLabel {
  dsldId: number;
  upc?: string;
  brand: string;
  name: string;
  servingSize?: string;
  offMarket: boolean;
  claims: string[];
  ingredients: DsldIngredient[];
  proprietaryBlends: string[];
  otherIngredients: string[];
}

function toUpcA(digits: string): string | null {
  const clean = digits.replace(/\D/g, "");
  if (clean.length === 12) return clean;
  if (clean.length === 13 && clean.startsWith("0")) return clean.slice(1);
  return null; // UPC-E (8-digit) and other formats aren't handled here — falls through to Open Food Facts / photo path
}

function toSpacedUpcA(upcA: string): string {
  return `${upcA[0]} ${upcA.slice(1, 6)} ${upcA.slice(6, 11)} ${upcA.slice(11, 12)}`;
}

async function searchFilterFirstId(query: string): Promise<string | null> {
  const url = `${DSLD_BASE}/search-filter?q=${encodeURIComponent(query)}`;
  const res = await fetchWithTimeout(url, { timeoutMs: DSLD_TIMEOUT_MS }).catch(() => null);
  if (!res || !res.ok) return null;
  const data = await res.json().catch(() => null);
  const hit = data?.hits?.[0];
  return hit?._id ?? null;
}

// search-filter does relevance-scored full-text search, not exact matching —
// a garbage UPC still returns "closest" hits instead of nothing. We only
// trust a hit once we've fetched its label and confirmed upcSku actually
// matches the digits we searched for, so this returns the label directly
// rather than an unverified id.
export async function findDsldLabelByUpc(upcDigits: string): Promise<DsldLabel | null> {
  const upcA = toUpcA(upcDigits);
  if (!upcA) return null;
  const spaced = toSpacedUpcA(upcA);
  const candidateId = (await searchFilterFirstId(`"${spaced}"`)) ?? (await searchFilterFirstId(`"${upcA}"`));
  if (!candidateId) return null;

  const label = await getDsldLabel(candidateId);
  if (!label?.upc) return null;
  const labelUpcDigits = label.upc.replace(/\D/g, "");
  return labelUpcDigits === upcA ? label : null;
}

export async function getDsldLabel(id: string | number): Promise<DsldLabel | null> {
  const res = await fetchWithTimeout(`${DSLD_BASE}/label/${id}`, { timeoutMs: DSLD_TIMEOUT_MS }).catch(() => null);
  if (!res || !res.ok) return null;
  const raw = await res.json().catch(() => null);
  return raw ? normalizeDsldLabel(raw) : null;
}

// ── Name-match verification ─────────────────────────────────────────────────
//
// A full-text search on brand+name alone is not verification — DSLD's
// relevance ranking happily returns the wrong strength or an unrelated
// product from the same brand as its top hit. Before adopting any full-text
// match as "this is the product the user scanned", it has to survive three
// hard gates (brand, name, strength) and is optionally corroborated by a
// fourth (ingredient amounts) that decides whether we trust it enough to
// re-key the cache entry to the DSLD UPC.

const CORPORATE_SUFFIXES = /\b(inc|llc|ltd|co|company|corp|labs|laboratories|nutrition|brands|products)\b\.?/gi;
const STOPWORDS = new Set(["the", "and", "of", "for", "by"]);

export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’.,]/g, "")
    .replace(CORPORATE_SUFFIXES, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function significantTokens(normalized: string): string[] {
  return normalized.split(" ").filter((t) => t && !STOPWORDS.has(t));
}

function bigrams(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

// Dice bigram coefficient: 2 * |shared bigrams| / (|bigrams(a)| + |bigrams(b)|).
export function diceSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const bgA = bigrams(a);
  const bgB = bigrams(b);
  if (bgA.length === 0 || bgB.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const bg of bgA) counts.set(bg, (counts.get(bg) ?? 0) + 1);
  let matches = 0;
  for (const bg of bgB) {
    const c = counts.get(bg) ?? 0;
    if (c > 0) {
      matches++;
      counts.set(bg, c - 1);
    }
  }
  return (2 * matches) / (bgA.length + bgB.length);
}

// Gate 1: brand similarity, or one normalized brand is a token-subset of the
// other sharing at least one non-stopword token — "Nature's Way" matches
// "Nature's Way, Inc." (the corporate suffix strip makes them identical) but
// not "Nature Made".
export function brandGatePass(a: string, b: string): boolean {
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);
  if (!na || !nb) return false;
  if (diceSimilarity(na, nb) >= 0.8) return true;
  const ta = significantTokens(na);
  const tb = significantTokens(nb);
  const shared = ta.filter((t) => t.length >= 3 && tb.includes(t));
  if (shared.length === 0) return false;
  const setA = new Set(ta);
  const setB = new Set(tb);
  return ta.every((t) => setB.has(t)) || tb.every((t) => setA.has(t));
}

// Gate 2: name similarity AND most of the vision name's significant tokens
// actually appear in the candidate.
export function nameGatePass(visionName: string, candidateName: string): boolean {
  const nv = normalizeForMatch(visionName);
  const nc = normalizeForMatch(candidateName);
  if (!nv || !nc) return false;
  if (diceSimilarity(nv, nc) < 0.7) return false;
  const sig = significantTokens(nv).filter((t) => t.length >= 3);
  if (sig.length === 0) return true;
  const present = sig.filter((t) => nc.includes(t));
  return present.length / sig.length >= 0.6;
}

const STRENGTH_RE = /(\d[\d,.]*)\s*(iu|mcg|µg|ug|mg|g|%)\b/gi;

export function extractStrengthTokens(s: string): Set<string> {
  const out = new Set<string>();
  for (const m of s.matchAll(STRENGTH_RE)) {
    const num = parseFloat(m[1].replace(/,/g, ""));
    if (!Number.isFinite(num)) continue;
    const unit = m[2].toLowerCase().replace(/^u?g$/, "g").replace(/^(ug|µg)$/, "mcg");
    out.add(`${num}${unit}`);
  }
  return out;
}

// Gate 3, the discriminator that actually fixes the "different strength"
// bug: strength tokens present on both sides must match exactly; a token on
// one side and none on the other is a hard fail rather than a shrug — a label
// that says "1000 IU" can never match a candidate that doesn't.
export function strengthGatePass(a: string, b: string): boolean {
  const ta = extractStrengthTokens(a);
  const tb = extractStrengthTokens(b);
  if (ta.size === 0 && tb.size === 0) return true;
  if (ta.size === 0 || tb.size === 0) return false;
  if (ta.size !== tb.size) return false;
  for (const t of ta) if (!tb.has(t)) return false;
  return true;
}

export function passesIdentityGates(
  vision: { brand: string; name: string },
  candidate: { brandName: string; fullName: string },
): boolean {
  return (
    brandGatePass(vision.brand, candidate.brandName) &&
    nameGatePass(vision.name, candidate.fullName) &&
    strengthGatePass(vision.name, candidate.fullName)
  );
}

// Gate 4 (soft): when the vision extraction actually produced amounts, most
// of them should show up in the candidate label at roughly the same amount.
// Returns "skip" rather than true/false when there isn't enough vision data
// to corroborate against (the front-of-bottle case this feature exists for),
// which the caller treats as "adopt, but don't re-key to this UPC".
export function ingredientCorroborationPasses(
  visionIngredients: Array<{ name: string; amount?: number }>,
  candidateLabel: DsldLabel,
): boolean | "skip" {
  const withAmounts = visionIngredients.filter((i) => i.name && i.amount != null);
  if (withAmounts.length < 2) return "skip";

  let matched = 0;
  for (const vi of withAmounts) {
    const viKey = lookupNutrientLimit(vi.name)?.key ?? normalizeForMatch(vi.name);
    const hit = candidateLabel.ingredients.some((ci) => {
      const ciKey = lookupNutrientLimit(ci.name)?.key ?? normalizeForMatch(ci.name);
      if (ciKey !== viKey || ci.quantity == null || vi.amount == null) return false;
      return Math.abs(ci.quantity - vi.amount) <= vi.amount * 0.1;
    });
    if (hit) matched++;
  }
  return matched / withAmounts.length >= 0.5;
}

interface SearchFilterHit {
  id: string;
  brandName: string;
  fullName: string;
}

async function searchFilterCandidates(query: string, limit = 5): Promise<SearchFilterHit[]> {
  const url = `${DSLD_BASE}/search-filter?q=${encodeURIComponent(query)}`;
  const res = await fetchWithTimeout(url, { timeoutMs: DSLD_TIMEOUT_MS }).catch(() => null);
  if (!res || !res.ok) return [];
  const data = await res.json().catch(() => null);
  const hits = Array.isArray(data?.hits) ? data.hits : [];
  return hits
    .map((h: any) => ({ id: String(h?._id ?? ""), brandName: h?._source?.brandName ?? "", fullName: h?._source?.fullName ?? "" }))
    .filter((h: SearchFilterHit) => h.id)
    .slice(0, limit);
}

export interface DsldNameMatch {
  label: DsldLabel;
  /** Gate 4 passed: the caller may re-key the cache entry to this label's UPC. When false, adopt the label's data but keep the vision-derived (brand+name) productKey. */
  corroborated: boolean;
}

// Verified name-based lookup, mirroring findDsldLabelByUpc's contract: never
// return an id the caller has to trust blind, only a label that has already
// passed identity verification (or null). See the gates above for what
// "verification" means here.
export async function findDsldLabelByName(
  brand: string,
  name: string,
  visionIngredients: Array<{ name: string; amount?: number }> = [],
): Promise<DsldNameMatch | null> {
  const candidates = await searchFilterCandidates(`${brand} ${name}`.trim());
  const surviving = candidates.filter((c) => passesIdentityGates({ brand, name }, c));

  for (const c of surviving) {
    const label = await getDsldLabel(c.id);
    if (!label) continue;
    const corroboration = ingredientCorroborationPasses(visionIngredients, label);
    if (corroboration === false) continue; // gate 4 explicitly contradicted this candidate — try the next one
    return { label, corroborated: corroboration === true };
  }
  return null;
}

// DSLD represents an undisclosed amount as quantity 0 with unit "NP" (not
// provided) rather than omitting it, so a raw null-check would read "0 NP" as a
// real dose of zero. Returns {} whenever the label doesn't actually disclose one.
function disclosedQuantity(q: any): { quantity?: number; unit?: string } {
  const quantity = q?.quantity;
  const unit = q?.unit;
  if (quantity == null || quantity === 0 || !unit || unit === "NP") return {};
  return { quantity, unit };
}

function dvPercentOf(q: any): number | undefined {
  const pct = q?.dailyValueTargetGroup?.[0]?.percent;
  return pct == null ? undefined : pct;
}

function normalizeDsldLabel(raw: any): DsldLabel {
  const ingredients: DsldIngredient[] = [];
  const proprietaryBlends: string[] = [];

  for (const row of raw.ingredientRows ?? []) {
    const q = row.quantity?.[0];
    const nested = row.nestedRows ?? [];

    if (nested.length > 0) {
      // A blend row. What makes it *proprietary* is that its components don't
      // disclose individual amounts — the parent almost always still declares
      // the blend's total weight, so the parent's own dose says nothing here.
      const anyComponentDisclosed = nested.some(
        (sub: any) => disclosedQuantity(sub.quantity?.[0]).quantity != null,
      );

      if (!anyComponentDisclosed) {
        proprietaryBlends.push(row.name);
        for (const sub of nested) {
          ingredients.push({
            name: sub.name,
            category: sub.category,
            isBlendComponent: true,
          });
        }
        continue;
      }

      // Components are individually disclosed — a transparent grouping, not a
      // proprietary blend. Record the components (not the parent) so doses
      // aren't double-counted.
      for (const sub of nested) {
        const sq = disclosedQuantity(sub.quantity?.[0]);
        ingredients.push({
          name: sub.name,
          category: sub.category,
          quantity: sq.quantity,
          unit: sq.unit,
          dvPercent: dvPercentOf(sub.quantity?.[0]),
          isBlendComponent: false,
        });
      }
      continue;
    }

    const own = disclosedQuantity(q);
    ingredients.push({
      name: row.name,
      category: row.category,
      quantity: own.quantity,
      unit: own.unit,
      dvPercent: dvPercentOf(q),
      isBlendComponent: false,
    });
  }

  const servingSizes = raw.servingSizes?.[0];
  const servingSize = servingSizes
    ? `${servingSizes.minQuantity ?? servingSizes.maxQuantity ?? 1} ${servingSizes.unit ?? ""}`.trim()
    : undefined;

  return {
    dsldId: raw.id,
    upc: raw.upcSku || undefined,
    brand: raw.brandName ?? "Unknown brand",
    name: raw.fullName ?? "Unknown product",
    servingSize,
    offMarket: Boolean(raw.offMarket),
    claims: (raw.claims ?? []).map((c: any) => c.langualCodeDescription).filter(Boolean),
    ingredients,
    proprietaryBlends,
    otherIngredients: (raw.otheringredients?.ingredients ?? []).map((i: any) => i.name),
  };
}
