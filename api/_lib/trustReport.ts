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
// Because UL and DV differ per nutrient, "how many %DV is the UL" differs
// wildly: it's 219% for niacin but 2,222% for vitamin C. That ratio is what
// checkDoseAssessment compares against, replacing the old flat 300% rule that
// was simultaneously too strict on B vitamins and too lenient on niacin.
export interface NutrientLimit {
  /** FDA Daily Value for adults, expressed in `unit`. Omitted when the nutrient has no DV. */
  dv?: number;
  /** Tolerable Upper Intake Level for adults, in `unit`. Omitted when no UL has been established. */
  ul?: number;
  unit: "mg" | "mcg";
  /** Caveat on what the UL actually covers, surfaced to the report so it can explain itself. */
  ulNote?: string;
}

export const NUTRIENT_LIMITS: Record<string, NutrientLimit> = {
  // Fat-soluble vitamins
  "vitamin a": { dv: 900, ul: 3000, unit: "mcg", ulNote: "The upper limit applies to preformed vitamin A (retinol/retinyl esters), not to beta-carotene." },
  "beta-carotene": { unit: "mcg" }, // provitamin A; no DV of its own and no UL
  "vitamin d": { dv: 20, ul: 100, unit: "mcg" },
  "vitamin e": { dv: 15, ul: 1000, unit: "mg", ulNote: "The upper limit applies to supplemental alpha-tocopherol, not vitamin E from food." },
  "vitamin k": { dv: 120, unit: "mcg" }, // no UL established

  // Water-soluble vitamins
  "vitamin c": { dv: 90, ul: 2000, unit: "mg" },
  thiamin: { dv: 1.2, unit: "mg" }, // no UL established
  riboflavin: { dv: 1.3, unit: "mg" }, // no UL established
  niacin: { dv: 16, ul: 35, unit: "mg", ulNote: "The upper limit applies to supplemental niacin; above it, flushing and (at high chronic doses) liver stress become likely." },
  "vitamin b6": { dv: 1.7, ul: 100, unit: "mg", ulNote: "Chronic intake above the upper limit has been linked to nerve damage." },
  folate: { dv: 400, ul: 1000, unit: "mcg", ulNote: "The upper limit applies to synthetic folic acid from supplements and fortified food, not to folate from food." },
  "vitamin b12": { dv: 2.4, unit: "mcg" }, // no UL established
  biotin: { dv: 30, unit: "mcg" }, // no UL established
  "pantothenic acid": { dv: 5, unit: "mg" }, // no UL established
  choline: { dv: 550, ul: 3500, unit: "mg" },

  // Minerals
  calcium: { dv: 1300, ul: 2500, unit: "mg" },
  iron: { dv: 18, ul: 45, unit: "mg" },
  phosphorus: { dv: 1250, ul: 4000, unit: "mg" },
  iodine: { dv: 150, ul: 1100, unit: "mcg" },
  magnesium: { dv: 420, ul: 350, unit: "mg", ulNote: "The upper limit covers only supplemental magnesium (not magnesium from food); exceeding it typically causes diarrhea rather than serious harm, and many magnesium supplements are dosed above it." },
  zinc: { dv: 11, ul: 40, unit: "mg" },
  selenium: { dv: 55, ul: 400, unit: "mcg" },
  copper: { dv: 0.9, ul: 10, unit: "mg" },
  manganese: { dv: 2.3, ul: 11, unit: "mg" },
  chromium: { dv: 35, unit: "mcg" }, // no UL established
  molybdenum: { dv: 45, ul: 2000, unit: "mcg" },
  chloride: { dv: 2300, ul: 3600, unit: "mg" },
  potassium: { dv: 4700, unit: "mg" }, // no UL established
  sodium: { dv: 2300, unit: "mg" }, // chronic-disease reduction target, not a UL
  boron: { ul: 20, unit: "mg" },
  nickel: { ul: 1, unit: "mg" },
  vanadium: { ul: 1.8, unit: "mg" },
  fluoride: { ul: 10, unit: "mg" },
};

// Label spellings that mean the same nutrient. DSLD names usually carry the
// chemical form in parentheses ("Vitamin B6 (as pyridoxine HCl)"), which
// normalizeNutrientName strips, but the row itself is sometimes named after
// the form instead.
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

// "Vitamin B6 (as pyridoxine HCl), USP" -> "vitamin b6"
function normalizeNutrientName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")   // drop the "(as ...)" chemical form
    .replace(/\bvitamin\s+b[\s-]*(\d+)/g, "vitamin b$1") // "vitamin b-12" -> "vitamin b12"
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Resolves a label row to a known nutrient, or null when we don't recognize it.
// Deliberately conservative: an exact match on the whole name, else a match on
// the leading words ("Zinc Picolinate" -> zinc, "Magnesium Oxide" -> magnesium).
// Anything we can't place returns null, and an unplaced ingredient is never
// reported as over its limit — we don't know its limit, so we don't claim one.
export function lookupNutrientLimit(name: string): { key: string; limit: NutrientLimit } | null {
  const normalized = normalizeNutrientName(name);
  if (!normalized) return null;

  const resolve = (candidate: string) => {
    const key = NUTRIENT_ALIASES[candidate] ?? candidate;
    const limit = NUTRIENT_LIMITS[key];
    return limit ? { key, limit } : null;
  };

  const exact = resolve(normalized);
  if (exact) return exact;

  const words = normalized.split(" ");
  for (let take = Math.min(3, words.length); take >= 1; take--) {
    const hit = resolve(words.slice(0, take).join(" "));
    if (hit) return hit;
  }
  return null;
}

const TO_MCG: Record<string, number> = { mcg: 1, ug: 1, µg: 1, mg: 1000, g: 1_000_000 };

// IU conversion is form-dependent (retinol vs beta-carotene, D2 vs D3,
// natural vs synthetic E), so we never convert it — those rows fall through to
// the %DV comparison instead of being guessed at.
function toMcg(amount: number, unit: string): number | null {
  const factor = TO_MCG[unit.toLowerCase().trim()];
  return factor == null ? null : amount * factor;
}

export interface DoseInput {
  name: string;
  amount?: number;
  unit?: string;
  dvPercent?: number;
}

export interface DoseVerdict {
  assessment: DoseAssessment;
  /** Set when the assessment is "above_UL": the limit that was exceeded, for the report to explain. */
  exceeded?: { ul: number; unit: string; ulNote?: string };
}

// Decides whether a dose is over its nutrient's Tolerable Upper Intake Level.
//
// Prefers the absolute amount when the label gives one in a convertible unit,
// since that's a direct comparison against the published UL. Falls back to
// comparing %DV against the UL expressed as a percentage of that same
// nutrient's DV. If the nutrient has no UL, or we can't identify it, the dose
// is never called "above_UL" no matter how large the %DV is.
export function assessDose(input: DoseInput): DoseVerdict {
  const { dvPercent } = input;
  const found = lookupNutrientLimit(input.name);
  const limit = found?.limit;

  if (limit?.ul != null) {
    const ulInMcg = toMcg(limit.ul, limit.unit)!;
    const amountInMcg =
      input.amount != null && input.unit ? toMcg(input.amount, input.unit) : null;

    const overByAmount = amountInMcg != null && amountInMcg > ulInMcg;
    const overByDv =
      amountInMcg == null &&
      dvPercent != null &&
      limit.dv != null &&
      dvPercent > (limit.ul / limit.dv) * 100;

    if (overByAmount || overByDv) {
      return {
        assessment: "above_UL",
        exceeded: { ul: limit.ul, unit: limit.unit, ulNote: limit.ulNote },
      };
    }
  }

  if (dvPercent == null) return { assessment: "unknown" };
  return { assessment: dvPercent >= 20 ? "effective" : "below_effective" };
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
export const RISKY_INGREDIENTS: Array<{ match: string; reason: string }> = [
  { match: "dmaa", reason: "1,3-Dimethylamylamine — the FDA has warned this is not a legal dietary ingredient and has linked it to cardiovascular events." },
  { match: "1,3-dimethylamylamine", reason: "Also known as DMAA — FDA-flagged, not a legal dietary ingredient." },
  { match: "ephedra", reason: "Ephedrine alkaloids have been banned in U.S. dietary supplements since 2004 due to cardiovascular risk." },
  { match: "ephedrine", reason: "A banned stimulant alkaloid linked to heart attack and stroke." },
  { match: "comfrey", reason: "Contains pyrrolizidine alkaloids that are toxic to the liver." },
  { match: "aristolochic acid", reason: "A known human carcinogen and cause of kidney failure; banned from supplements." },
  { match: "yohimbe", reason: "Can cause dangerous blood pressure changes, anxiety, and heart arrhythmia at supplement doses." },
  { match: "yohimbine", reason: "Can cause dangerous blood pressure changes, anxiety, and heart arrhythmia at supplement doses." },
  { match: "kava", reason: "Linked to rare but serious liver toxicity." },
  { match: "phenibut", reason: "An unapproved synthetic anxiolytic with dependence and withdrawal risk; not a legal dietary ingredient." },
  { match: "bmpea", reason: "An undisclosed synthetic stimulant the FDA has found in supplements marketed as natural plant extracts." },
  { match: "higenamine", reason: "A beta-agonist stimulant banned in competitive sport and flagged by the FDA as not a legal dietary ingredient in some contexts." },
];

export function flagRiskyIngredient(name: string): string | null {
  const lower = name.toLowerCase();
  const hit = RISKY_INGREDIENTS.find((r) => lower.includes(r.match));
  return hit ? hit.reason : null;
}
