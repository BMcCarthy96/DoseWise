import type { DoseAssessment } from "../../src/types";

// Extracts a JSON object from a Claude text response that may include
// prose narration around it — common when the web_search tool is enabled,
// since the model tends to summarize its findings in natural language
// despite being told to return only JSON.
export function extractJsonObject(text: string): unknown {
  const fenced = text.trim().replace(/^```json\n?/, "").replace(/^```\n?/, "").replace(/\n?```$/, "");
  try {
    return JSON.parse(fenced);
  } catch {
    const start = fenced.indexOf("{");
    const end = fenced.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) throw new Error("No JSON object found in response");
    return JSON.parse(fenced.slice(start, end + 1));
  }
}

// ── Nutrient reference table ────────────────────────────────────────────────
//
// Per-nutrient reference amounts: the FDA Daily Value used on Supplement Facts
// panels (2016 labeling rule, adults and children 4+) alongside the Tolerable
// Upper Intake Level from the NIH ODS fact sheets.
//
// `ul: undefined` is a deliberate, meaningful value: it means the Food and
// Nutrition Board has established NO upper limit for that nutrient. Biotin,
// B12, thiamin, riboflavin, pantothenic acid, vitamin K, chromium and
// potassium all fall in that bucket, which is why a biotin product listing
// 12,500% DV must never be reported as "above the safe upper limit" — there is
// no such limit to be above. Saying otherwise would be inventing a fact.
//
// DV and UL are frequently expressed in different BASES even though they share
// a unit: folate's DV is mcg dietary folate equivalents (DFE) but its UL is mcg
// of synthetic folic acid only; niacin's DV is mg niacin equivalents (NE) but
// its UL covers only supplemental (preformed) niacin; vitamin A's DV is mcg
// retinol activity equivalents (RAE) but its UL covers only preformed vitamin A
// (not beta-carotene); magnesium's UL covers only supplemental magnesium, not
// magnesium from food. Basis is recorded on both dv and ul so a label's amount
// can be checked against the right one — see resolveNutrient/assessDose below.
//
// `severity` on ul distinguishes limits whose overage is a serious safety
// concern (vitamin A toxicity, iron overload) from ones that are merely
// uncomfortable (magnesium's UL "typically causes diarrhea rather than serious
// harm" per its own note, and many ordinary magnesium supplements are dosed
// above it). This feeds the deterministic scoring rubric — a tolerable overage
// should not be scored like a serious one.
export type NutrientBasis =
  | "total"
  | "dfe"
  | "folic_acid"
  | "ne"
  | "supplemental_niacin"
  | "rae"
  | "preformed_retinol"
  | "supplemental"
  | "elemental";

export interface NutrientAmount {
  amount: number;
  unit: "mg" | "mcg";
  basis: NutrientBasis;
}

export interface NutrientLimit {
  /** FDA Daily Value for adults. Omitted when the nutrient has no DV. */
  dv?: NutrientAmount;
  /** Tolerable Upper Intake Level for adults. Omitted when no UL has been established. */
  ul?: NutrientAmount & {
    /** Caveat on what the UL actually covers, surfaced to the report so it can explain itself. */
    note?: string;
    /** Whether exceeding this UL is a serious safety concern or a merely tolerable one (e.g. GI upset). */
    severity: "serious" | "tolerable";
  };
}

export const NUTRIENT_LIMITS: Record<string, NutrientLimit> = {
  // Fat-soluble vitamins
  "vitamin a": {
    dv: { amount: 900, unit: "mcg", basis: "rae" },
    ul: { amount: 3000, unit: "mcg", basis: "preformed_retinol", severity: "serious", note: "The upper limit applies to preformed vitamin A (retinol/retinyl esters), not to beta-carotene." },
  },
  "beta-carotene": {}, // provitamin A; no DV of its own and no UL
  "vitamin d": { dv: { amount: 20, unit: "mcg", basis: "total" }, ul: { amount: 100, unit: "mcg", basis: "total", severity: "serious" } },
  "vitamin e": {
    dv: { amount: 15, unit: "mg", basis: "total" },
    ul: { amount: 1000, unit: "mg", basis: "supplemental", severity: "serious", note: "The upper limit applies to supplemental alpha-tocopherol, not vitamin E from food." },
  },
  "vitamin k": { dv: { amount: 120, unit: "mcg", basis: "total" } }, // no UL established

  // Water-soluble vitamins
  "vitamin c": { dv: { amount: 90, unit: "mg", basis: "total" }, ul: { amount: 2000, unit: "mg", basis: "total", severity: "serious" } },
  thiamin: { dv: { amount: 1.2, unit: "mg", basis: "total" } }, // no UL established
  riboflavin: { dv: { amount: 1.3, unit: "mg", basis: "total" } }, // no UL established
  niacin: {
    dv: { amount: 16, unit: "mg", basis: "ne" },
    ul: { amount: 35, unit: "mg", basis: "supplemental_niacin", severity: "tolerable", note: "The upper limit applies to supplemental niacin; above it, flushing and (at high chronic doses) liver stress become likely." },
  },
  "vitamin b6": { dv: { amount: 1.7, unit: "mg", basis: "total" }, ul: { amount: 100, unit: "mg", basis: "total", severity: "serious", note: "Chronic intake above the upper limit has been linked to nerve damage." } },
  folate: {
    dv: { amount: 400, unit: "mcg", basis: "dfe" },
    ul: { amount: 1000, unit: "mcg", basis: "folic_acid", severity: "serious", note: "The upper limit applies to synthetic folic acid from supplements and fortified food, not to folate from food." },
  },
  "vitamin b12": { dv: { amount: 2.4, unit: "mcg", basis: "total" } }, // no UL established
  biotin: { dv: { amount: 30, unit: "mcg", basis: "total" } }, // no UL established
  "pantothenic acid": { dv: { amount: 5, unit: "mg", basis: "total" } }, // no UL established
  choline: { dv: { amount: 550, unit: "mg", basis: "total" }, ul: { amount: 3500, unit: "mg", basis: "total", severity: "serious" } },

  // Minerals
  calcium: { dv: { amount: 1300, unit: "mg", basis: "total" }, ul: { amount: 2500, unit: "mg", basis: "total", severity: "serious" } },
  iron: { dv: { amount: 18, unit: "mg", basis: "total" }, ul: { amount: 45, unit: "mg", basis: "total", severity: "serious" } },
  phosphorus: { dv: { amount: 1250, unit: "mg", basis: "total" }, ul: { amount: 4000, unit: "mg", basis: "total", severity: "serious" } },
  iodine: { dv: { amount: 150, unit: "mcg", basis: "total" }, ul: { amount: 1100, unit: "mcg", basis: "total", severity: "serious" } },
  magnesium: {
    dv: { amount: 420, unit: "mg", basis: "total" },
    ul: { amount: 350, unit: "mg", basis: "supplemental", severity: "tolerable", note: "The upper limit covers only supplemental magnesium (not magnesium from food); exceeding it typically causes diarrhea rather than serious harm, and many magnesium supplements are dosed above it." },
  },
  zinc: { dv: { amount: 11, unit: "mg", basis: "total" }, ul: { amount: 40, unit: "mg", basis: "total", severity: "serious" } },
  selenium: { dv: { amount: 55, unit: "mcg", basis: "total" }, ul: { amount: 400, unit: "mcg", basis: "total", severity: "serious" } },
  copper: { dv: { amount: 0.9, unit: "mg", basis: "total" }, ul: { amount: 10, unit: "mg", basis: "total", severity: "serious" } },
  manganese: { dv: { amount: 2.3, unit: "mg", basis: "total" }, ul: { amount: 11, unit: "mg", basis: "total", severity: "serious" } },
  chromium: { dv: { amount: 35, unit: "mcg", basis: "total" } }, // no UL established
  molybdenum: { dv: { amount: 45, unit: "mcg", basis: "total" }, ul: { amount: 2000, unit: "mcg", basis: "total", severity: "serious" } },
  chloride: { dv: { amount: 2300, unit: "mg", basis: "total" }, ul: { amount: 3600, unit: "mg", basis: "total", severity: "serious" } },
  potassium: { dv: { amount: 4700, unit: "mg", basis: "total" } }, // no UL established
  sodium: { dv: { amount: 2300, unit: "mg", basis: "total" } }, // chronic-disease reduction target, not a UL
  boron: { ul: { amount: 20, unit: "mg", basis: "total", severity: "serious" } },
  nickel: { ul: { amount: 1, unit: "mg", basis: "total", severity: "serious" } },
  vanadium: { ul: { amount: 1.8, unit: "mg", basis: "total", severity: "serious" } },
  fluoride: { ul: { amount: 10, unit: "mg", basis: "total", severity: "serious" } },
};

// Label spellings that mean the same nutrient. DSLD names usually carry the
// chemical form in parentheses ("Vitamin B6 (as pyridoxine HCl)"), which
// resolveNutrient strips (and separately inspects — see formText below), but
// the row itself is sometimes named after the form instead.
const NUTRIENT_ALIASES: Record<string, string> = {
  retinol: "vitamin a",
  "retinyl palmitate": "vitamin a",
  "retinyl acetate": "vitamin a",
  "vitamin a palmitate": "vitamin a",
  betacarotene: "beta-carotene",
  "mixed carotenoids": "beta-carotene",
  "ascorbic acid": "vitamin c",
  "l-ascorbic acid": "vitamin c",
  "sodium ascorbate": "vitamin c",
  cholecalciferol: "vitamin d",
  ergocalciferol: "vitamin d",
  "vitamin d3": "vitamin d",
  "vitamin d2": "vitamin d",
  "alpha-tocopherol": "vitamin e",
  "d-alpha tocopherol": "vitamin e",
  "dl-alpha tocopherol": "vitamin e",
  "tocopheryl acetate": "vitamin e",
  phylloquinone: "vitamin k",
  menaquinone: "vitamin k",
  "vitamin k1": "vitamin k",
  "vitamin k2": "vitamin k",
  "vitamin b1": "thiamin",
  thiamine: "thiamin",
  "thiamine hydrochloride": "thiamin",
  "thiamin mononitrate": "thiamin",
  "vitamin b2": "riboflavin",
  "vitamin b3": "niacin",
  niacinamide: "niacin",
  nicotinamide: "niacin",
  "nicotinic acid": "niacin",
  "inositol hexanicotinate": "niacin",
  pyridoxine: "vitamin b6",
  "pyridoxine hydrochloride": "vitamin b6",
  "pyridoxal 5-phosphate": "vitamin b6",
  "vitamin b9": "folate",
  "folic acid": "folate",
  methylfolate: "folate",
  "l-methylfolate": "folate",
  "5-methyltetrahydrofolate": "folate",
  cobalamin: "vitamin b12",
  cyanocobalamin: "vitamin b12",
  methylcobalamin: "vitamin b12",
  hydroxocobalamin: "vitamin b12",
  "vitamin b7": "biotin",
  "d-biotin": "biotin",
  "vitamin b5": "pantothenic acid",
  "calcium pantothenate": "pantothenic acid",
  pantothenate: "pantothenic acid",
  "d-calcium pantothenate": "pantothenic acid",
  "choline bitartrate": "choline",
  iodide: "iodine",
  "potassium iodide": "iodine",
  // Mineral salts whose row name leads with a different element than the one
  // being supplied — the leading-word fallback would otherwise resolve
  // "Sodium Selenite" to sodium rather than selenium.
  "sodium selenite": "selenium",
  "sodium selenate": "selenium",
  selenomethionine: "selenium",
  "l-selenomethionine": "selenium",
  "sodium molybdate": "molybdenum",
  "sodium borate": "boron",
  "sodium fluoride": "fluoride",
  "cupric oxide": "copper",
  "cupric sulfate": "copper",
  "ferrous sulfate": "iron",
  "ferrous fumarate": "iron",
  "ferrous bisglycinate": "iron",
  "ferric pyrophosphate": "iron",
  "carbonyl iron": "iron",
  "dicalcium phosphate": "calcium",
  "tricalcium phosphate": "calcium",
};

// Label rows named for the salt itself, with the amount possibly declared as
// the salt's own weight rather than the elemental nutrient it delivers. Used
// only as a downgrade guard (see isBareSaltName) — never to compute a
// corrected elemental amount, which would need a fraction table we don't have
// and don't want to guess at.
const BARE_SALT_SUFFIXES = [
  "gluconate", "citrate", "oxide", "carbonate", "sulfate", "chloride",
  "glycinate", "bisglycinate", "malate", "orotate", "aspartate", "taurate",
  "picolinate", "lactate",
];

// Suffixes that identify the nutrient regardless of what element or word leads
// the name — the trap the leading-word walk falls into ("Calcium Ascorbate"
// would otherwise resolve to calcium). Checked before the leading-word walk.
const TRAILING_SUFFIXES: Record<string, string> = {
  "ascorbic acid": "vitamin c",
  ascorbate: "vitamin c",
  tocopherol: "vitamin e",
  pantothenate: "pantothenic acid",
  selenite: "selenium",
  selenate: "selenium",
  molybdate: "molybdenum",
  borate: "boron",
  iodide: "iodine",
  fluoride: "fluoride",
};

// Modifiers that describe manufacturing/delivery form, not identity — stripped
// before matching so "Buffered Vitamin C" and "Chelated Zinc" resolve instead
// of silently returning null.
const TRANSPARENT_MODIFIERS = [
  "buffered", "chelated", "natural", "synthetic", "activated", "coated",
  "timed-release", "sustained-release", "esterified", "liposomal",
  "methylated", "high-potency", "whole-food", "food-based", "organic", "pure",
];

// Modifiers that mean the row is a multi-ingredient grouping, not a single
// identifiable nutrient — resolving through these would invent an identity for
// something that is deliberately not single-ingredient ("Vitamin B Complex"
// must never resolve to one B vitamin).
const BLOCKING_MODIFIERS = ["complex", "blend", "formula", "matrix", "proprietary"];

function wordRegex(phrase: string): RegExp {
  return new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
}

function containsBlockingModifier(name: string): boolean {
  return BLOCKING_MODIFIERS.some((m) => wordRegex(m).test(name));
}

function stripTransparentModifiers(text: string): string {
  let out = text;
  for (const m of TRANSPARENT_MODIFIERS) out = out.replace(new RegExp(wordRegex(m), "gi"), " ");
  return out;
}

function isBareSaltName(rawName: string): boolean {
  if (/\(/.test(rawName)) return false; // already has an "(as ...)" qualifier
  return BARE_SALT_SUFFIXES.some((s) => wordRegex(s).test(rawName));
}

// "Vitamin B6 (as pyridoxine HCl), USP" -> "vitamin b6"
function normalizeNutrientName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\bvitamin\s+b[\s-]*(\d+)/g, "vitamin b$1") // "vitamin b-12" -> "vitamin b12"
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractParenContent(name: string): { outside: string; inside: string | null } {
  const match = name.match(/\(([^)]*)\)/);
  const inside = match ? match[1].replace(/^\s*as\s+/i, "").trim() : null;
  const outside = name.replace(/\([^)]*\)/g, " ").trim();
  return { outside, inside };
}

function resolveExactOrAlias(candidate: string): { key: string; limit: NutrientLimit; matchedText: string } | null {
  const key = NUTRIENT_ALIASES[candidate] ?? candidate;
  const limit = NUTRIENT_LIMITS[key];
  return limit ? { key, limit, matchedText: candidate } : null;
}

function resolveNormalized(text: string): { key: string; limit: NutrientLimit; matchedText: string } | null {
  const normalized = normalizeNutrientName(stripTransparentModifiers(text));
  if (!normalized) return null;

  const exact = resolveExactOrAlias(normalized);
  if (exact) return exact;

  for (const suffix of Object.keys(TRAILING_SUFFIXES).sort((a, b) => b.length - a.length)) {
    if (normalized.endsWith(suffix)) {
      const key = TRAILING_SUFFIXES[suffix];
      const limit = NUTRIENT_LIMITS[key];
      if (limit) return { key, limit, matchedText: suffix };
    }
  }

  const words = normalized.split(" ");
  for (let take = Math.min(3, words.length); take >= 1; take--) {
    const hit = resolveExactOrAlias(words.slice(0, take).join(" "));
    if (hit) return hit;
  }
  return null;
}

export interface ResolvedNutrient {
  key: string;
  limit: NutrientLimit;
  /** Raw "(as ...)" text, lowercased, when the label carried one — used to gate IU/basis conversions that would otherwise have to guess. */
  formText?: string;
  /** The candidate string (pre-alias-mapping) that produced the match on the row's primary (outside-parens) name — distinguishes a row literally named "Folic Acid" from one named "Folate". */
  primaryMatchedText?: string;
}

// Resolves a label row to a known nutrient, or null when we don't recognize
// it. Tries, in order: the row's own primary name, then a suffix that
// identifies the nutrient regardless of what leads the name, then a
// leading-word walk ("Zinc Picolinate" -> zinc). When the row also carries an
// "(as ...)" qualifier that resolves to a DIFFERENT nutrient than the primary
// name — "Vitamin A (as Beta-Carotene)" — the qualifier wins, since that's
// what the label is actually declaring the amount of. A qualifier that
// resolves to the SAME nutrient (or doesn't resolve at all) is kept only as
// formText, for basis/form-gated conversions to inspect.
//
// Anything we can't place returns null, and an unplaced ingredient is never
// reported as over its limit — we don't know its limit, so we don't claim one.
export function resolveNutrient(rawName: string): ResolvedNutrient | null {
  if (containsBlockingModifier(rawName)) return null;

  const { outside, inside } = extractParenContent(rawName);
  const formText = inside ? inside.toLowerCase() : undefined;

  const insideResolved = inside ? resolveNormalized(inside) : null;
  const outsideResolved = resolveNormalized(outside);

  if (insideResolved && (!outsideResolved || insideResolved.key !== outsideResolved.key)) {
    return { key: insideResolved.key, limit: insideResolved.limit, formText };
  }
  if (outsideResolved) return { key: outsideResolved.key, limit: outsideResolved.limit, formText, primaryMatchedText: outsideResolved.matchedText };
  if (insideResolved) return { key: insideResolved.key, limit: insideResolved.limit, formText };
  return null;
}

// Backward-compatible accessor for callers that only need identity, not the
// form/basis context (alternatives.ts, the regression test's name-resolution
// table).
export function lookupNutrientLimit(name: string): { key: string; limit: NutrientLimit } | null {
  const r = resolveNutrient(name);
  return r ? { key: r.key, limit: r.limit } : null;
}

const TO_MCG: Record<string, number> = { mcg: 1, ug: 1, "µg": 1, mg: 1000, g: 1_000_000 };

function toMcg(amount: number, unit: string): number | null {
  const factor = TO_MCG[unit.toLowerCase().trim()];
  return factor == null ? null : amount * factor;
}

const BASIS_WORDS: Record<string, NutrientBasis> = { dfe: "dfe", ne: "ne", rae: "rae" };

// Splits a label unit into its measurable unit and, when present, a basis
// suffix DSLD passes straight through from the source data ("mcg DFE",
// "mg NE", "mcg RAE"). A bare "IU" has no basis suffix — it's handled as its
// own unit, form-gated per nutrient below.
function splitUnitBasis(rawUnit?: string): { unit: string | null; basisCode: NutrientBasis | null } {
  if (!rawUnit) return { unit: null, basisCode: null };
  const parts = rawUnit.trim().toLowerCase().split(/\s+/);
  const unit = parts[0] || null;
  const basisCode = parts[1] && BASIS_WORDS[parts[1]] ? BASIS_WORDS[parts[1]] : null;
  return { unit, basisCode };
}

export interface DoseInput {
  name: string;
  amount?: number;
  unit?: string;
  dvPercent?: number;
}

export type DoseAssessmentReason =
  | "no_dose_given"
  | "unknown_nutrient"
  | "unknown_basis"
  | "iu_form_unknown"
  | "ambiguous_salt_weight"
  | "blend_component";

export interface DoseVerdict {
  assessment: DoseAssessment;
  /** Set whenever the assessment is "unknown": why we couldn't place it, so the UI can say something truer than "dose not disclosed" when a dose plainly *was* disclosed. */
  reason?: DoseAssessmentReason;
  /** Set when the assessment is "above_UL": the limit that was exceeded, for the report to explain. */
  exceeded?: { ul: number; unit: string; ulNote?: string; severity: "serious" | "tolerable" };
}

function unknownDose(reason: DoseAssessmentReason): DoseVerdict {
  return { assessment: "unknown", reason };
}

function aboveUl(ul: NonNullable<NutrientLimit["ul"]>): DoseVerdict {
  return { assessment: "above_UL", exceeded: { ul: ul.amount, unit: ul.unit, ulNote: ul.note, severity: ul.severity } };
}

function dvOnlyOrUnknown(dvPercent?: number): DoseVerdict {
  if (dvPercent == null) return unknownDose("no_dose_given");
  return { assessment: dvPercent >= 20 ? "effective" : "below_effective" };
}

// Nutrients with no UL to check at all (biotin, B12, thiamin, etc.) go
// straight to the %DV comparison — there is nothing to exceed.
function assessGeneric(input: DoseInput, limit: NutrientLimit): DoseVerdict {
  if (!limit.ul) return dvOnlyOrUnknown(input.dvPercent);

  const { unit } = splitUnitBasis(input.unit);
  const ulMcg = toMcg(limit.ul.amount, limit.ul.unit)!;
  const amountMcg = input.amount != null && unit ? toMcg(input.amount, unit) : null;

  const overByAmount = amountMcg != null && amountMcg > ulMcg;
  let overByDv = false;
  if (amountMcg == null && input.dvPercent != null && limit.dv) {
    const dvMcg = toMcg(limit.dv.amount, limit.dv.unit);
    if (dvMcg) overByDv = input.dvPercent > (ulMcg / dvMcg) * 100;
  }

  if (overByAmount || overByDv) {
    // DSLD sometimes names a row for the salt itself ("Magnesium Gluconate")
    // rather than the elemental nutrient. US labels are supposed to declare
    // elemental amounts regardless, but we're not confident enough in that for
    // every source to assert a breach on a close call — only a wide margin
    // (>=2x the UL) is trusted as a genuine overage for a bare salt name.
    if (overByAmount && isBareSaltName(input.name) && amountMcg! < ulMcg * 2) {
      return unknownDose("ambiguous_salt_weight");
    }
    return aboveUl(limit.ul);
  }
  return dvOnlyOrUnknown(input.dvPercent);
}

// Vitamin D: 1 IU = 0.025 mcg regardless of form (D2 or D3) — no ambiguity, so
// this is converted unconditionally, unlike A and E below.
function assessVitaminD(input: DoseInput, limit: NutrientLimit): DoseVerdict {
  if (!limit.ul) return dvOnlyOrUnknown(input.dvPercent);
  const { unit } = splitUnitBasis(input.unit);
  let amountMcg: number | null = null;
  if (input.amount != null && unit === "iu") amountMcg = input.amount * 0.025;
  else if (input.amount != null && unit) amountMcg = toMcg(input.amount, unit);

  if (amountMcg != null && amountMcg > toMcg(limit.ul.amount, limit.ul.unit)!) return aboveUl(limit.ul);
  return dvOnlyOrUnknown(input.dvPercent);
}

// Vitamin E: IU-to-mg depends on form (d-alpha natural vs dl-alpha synthetic).
// An unstated form uses the LOWER dl-alpha factor (0.45 mg/IU) — the bound
// that can't manufacture a false positive.
function assessVitaminE(input: DoseInput, limit: NutrientLimit, formText: string | undefined): DoseVerdict {
  if (!limit.ul) return dvOnlyOrUnknown(input.dvPercent);
  const { unit } = splitUnitBasis(input.unit);
  const ulMg = limit.ul.unit === "mg" ? limit.ul.amount : toMcg(limit.ul.amount, limit.ul.unit)! / 1000;

  if (unit === "iu" && input.amount != null) {
    const isDAlpha = formText ? /\bd-alpha\b/.test(formText) : false;
    const mg = input.amount * (isDAlpha ? 0.67 : 0.45);
    if (mg > ulMg) return aboveUl(limit.ul);
    return dvOnlyOrUnknown(input.dvPercent);
  }
  if (input.amount != null && unit) {
    const mcgAmount = toMcg(input.amount, unit);
    if (mcgAmount != null && mcgAmount / 1000 > ulMg) return aboveUl(limit.ul);
  }
  return dvOnlyOrUnknown(input.dvPercent);
}

// Vitamin A: the UL only covers preformed vitamin A (retinol/retinyl esters),
// never beta-carotene — a form resolveNutrient already routes to its own
// no-UL entry when the label says so explicitly. What lands here is either an
// explicitly preformed form (safe to convert) or an unstated one (never safe
// to assume preformed, so IU gets a two-bound rule and non-IU units without a
// form annotation are refused rather than guessed at).
function assessVitaminA(input: DoseInput, limit: NutrientLimit, hasExplicitForm: boolean): DoseVerdict {
  if (!limit.ul) return dvOnlyOrUnknown(input.dvPercent);
  const { unit } = splitUnitBasis(input.unit);
  const ul = limit.ul;

  if (unit === "iu") {
    if (input.amount == null) return dvOnlyOrUnknown(input.dvPercent);
    if (hasExplicitForm) {
      const mcg = input.amount * 0.3; // preformed retinol
      if (mcg > ul.amount) return aboveUl(ul);
      return dvOnlyOrUnknown(input.dvPercent);
    }
    // Two-bound rule: only flag when even the lower (beta-carotene, 0.05
    // mcg RAE/IU) bound would exceed the UL — otherwise we'd be asserting a
    // preformed-vitamin-A breach we can't actually confirm from the label.
    const lowerBoundMcg = input.amount * 0.05;
    if (lowerBoundMcg > ul.amount) return aboveUl(ul);
    return unknownDose("iu_form_unknown");
  }

  if (input.amount != null && unit) {
    if (!hasExplicitForm) return unknownDose("unknown_basis");
    const mcgAmount = toMcg(input.amount, unit);
    if (mcgAmount != null && mcgAmount > ul.amount) return aboveUl(ul);
  }
  return dvOnlyOrUnknown(input.dvPercent);
}

// Folate: FDA mandates supplement labels declare folate in mcg DFE regardless
// of chemical form, so a plain "mcg" amount on a row named "Folate" defaults
// to DFE and is converted (divide by 1.7) before comparing to the folic-acid
// UL. The one exception is a row whose PRIMARY name is literally "Folic
// Acid" — some DSLD entries for straight folic-acid products declare that
// amount directly rather than as DFE.
function assessFolate(input: DoseInput, limit: NutrientLimit, primaryIsFolicAcid: boolean): DoseVerdict {
  if (!limit.ul) return dvOnlyOrUnknown(input.dvPercent);
  const { unit, basisCode } = splitUnitBasis(input.unit);
  const ul = limit.ul;

  if (input.amount != null && unit === "mcg") {
    const folicAcidMcg =
      basisCode === "dfe" ? input.amount / 1.7
      : basisCode === "folic_acid" || primaryIsFolicAcid ? input.amount
      : input.amount / 1.7; // default: FDA-mandated DFE declaration
    if (folicAcidMcg > ul.amount) return aboveUl(ul);
    return dvOnlyOrUnknown(input.dvPercent);
  }
  if (input.amount != null && unit) {
    const mcgAmount = toMcg(input.amount, unit);
    const folicAcidMcg = mcgAmount != null ? mcgAmount / 1.7 : null;
    if (folicAcidMcg != null && folicAcidMcg > ul.amount) return aboveUl(ul);
  }
  return dvOnlyOrUnknown(input.dvPercent);
}

// Decides whether a dose is over its nutrient's Tolerable Upper Intake Level.
//
// Prefers the absolute amount when the label gives one in a convertible unit,
// since that's a direct comparison against the published UL. Falls back to
// comparing %DV against the UL expressed as a percentage of that same
// nutrient's DV. If the nutrient has no UL, or we can't identify it, the dose
// is never called "above_UL" no matter how large the %DV is — and per the
// "fail toward silence" rule, an ambiguous basis or an unstated IU form also
// never resolves to "above_UL": it resolves to "unknown" with a reason that
// says why, rather than guessing.
export function assessDose(input: DoseInput): DoseVerdict {
  const resolved = resolveNutrient(input.name);
  if (!resolved) return unknownDose("unknown_nutrient");
  const { key, limit, formText, primaryMatchedText } = resolved;

  switch (key) {
    case "vitamin a": return assessVitaminA(input, limit, formText != null);
    case "vitamin d": return assessVitaminD(input, limit);
    case "vitamin e": return assessVitaminE(input, limit, formText);
    case "folate": return assessFolate(input, limit, primaryMatchedText === "folic acid");
    default: return assessGeneric(input, limit);
  }
}

export function checkDoseAssessment(input: DoseInput): DoseAssessment {
  return assessDose(input).assessment;
}

// Ingredients the FDA has specifically warned about, banned, or that carry
// well-documented serious risk at supplement doses. Not exhaustive — the
// Claude synthesis step also draws on PubMed evidence for ingredients not
// listed here (this is exactly the kind of case, like historical
// L-tryptophan contamination, that benefits from the research lookup rather
// than a static list).
export const RISKY_INGREDIENTS: Array<{ match: string; reason: string; source: string }> = [
  { match: "dmaa", reason: "1,3-Dimethylamylamine — the FDA has warned this is not a legal dietary ingredient and has linked it to cardiovascular events.", source: "FDA Dietary Supplement Ingredient Advisory: DMAA" },
  { match: "1,3-dimethylamylamine", reason: "Also known as DMAA — FDA-flagged, not a legal dietary ingredient.", source: "FDA Dietary Supplement Ingredient Advisory: DMAA" },
  { match: "ephedra", reason: "Ephedrine alkaloids have been banned in U.S. dietary supplements since 2004 due to cardiovascular risk.", source: "21 CFR Part 119 — Ephedrine Alkaloid Dietary Supplements Final Rule (2004)" },
  { match: "ephedrine", reason: "A banned stimulant alkaloid linked to heart attack and stroke.", source: "21 CFR Part 119 — Ephedrine Alkaloid Dietary Supplements Final Rule (2004)" },
  { match: "comfrey", reason: "Contains pyrrolizidine alkaloids that are toxic to the liver.", source: "FDA Consumer Advisory on comfrey-containing products (2001)" },
  { match: "aristolochic acid", reason: "A known human carcinogen and cause of kidney failure; banned from supplements.", source: "FDA Concept Paper: Aristolochic Acid (2001)" },
  { match: "yohimbe", reason: "Can cause dangerous blood pressure changes, anxiety, and heart arrhythmia at supplement doses.", source: "NIH NCCIH Yohimbe fact sheet" },
  { match: "yohimbine", reason: "Can cause dangerous blood pressure changes, anxiety, and heart arrhythmia at supplement doses.", source: "NIH NCCIH Yohimbe fact sheet" },
  { match: "kava", reason: "Linked to rare but serious liver toxicity.", source: "FDA Consumer Advisory on kava-containing dietary supplements (2002)" },
  { match: "phenibut", reason: "An unapproved synthetic anxiolytic with dependence and withdrawal risk; not a legal dietary ingredient.", source: "FDA import alerts treating phenibut as an unapproved new drug" },
  { match: "bmpea", reason: "An undisclosed synthetic stimulant the FDA has found in supplements marketed as natural plant extracts.", source: "FDA research letter identifying BMPEA in Acacia rigidula-labeled supplements (2015)" },
  { match: "higenamine", reason: "A beta-agonist stimulant banned in competitive sport and flagged by the FDA as not a legal dietary ingredient in some contexts.", source: "WADA Prohibited List (beta-2 agonists); FDA warning letters citing higenamine" },
];

export function flagRiskyIngredient(name: string): { reason: string; source: string } | null {
  const lower = name.toLowerCase();
  const hit = RISKY_INGREDIENTS.find((r) => lower.includes(r.match));
  return hit ? { reason: hit.reason, source: hit.source } : null;
}
