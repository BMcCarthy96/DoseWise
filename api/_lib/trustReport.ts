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

// Tolerable Upper Intake Levels (adults), approximate, from NIH ODS fact
// sheets — used only as a secondary check. The primary over-dose signal is
// DSLD's own %DV figure (see checkDoseAssessment), since it's already
// computed against FDA reference values and doesn't require unit matching.
export const UPPER_LIMITS: Record<string, { amount: number; unit: string }> = {
  "vitamin a": { amount: 3000, unit: "mcg" },
  "vitamin c": { amount: 2000, unit: "mg" },
  "vitamin d": { amount: 100, unit: "mcg" },
  "vitamin e": { amount: 1000, unit: "mg" },
  niacin: { amount: 35, unit: "mg" },
  "vitamin b6": { amount: 100, unit: "mg" },
  pyridoxine: { amount: 100, unit: "mg" },
  "folic acid": { amount: 1000, unit: "mcg" },
  folate: { amount: 1000, unit: "mcg" },
  choline: { amount: 3500, unit: "mg" },
  calcium: { amount: 2500, unit: "mg" },
  iron: { amount: 45, unit: "mg" },
  magnesium: { amount: 350, unit: "mg" },
  zinc: { amount: 40, unit: "mg" },
  selenium: { amount: 400, unit: "mcg" },
  manganese: { amount: 11, unit: "mg" },
  phosphorus: { amount: 4000, unit: "mg" },
  iodine: { amount: 1100, unit: "mcg" },
  copper: { amount: 10, unit: "mg" },
  boron: { amount: 20, unit: "mg" },
  nickel: { amount: 1, unit: "mg" },
  vanadium: { amount: 1.8, unit: "mg" },
  molybdenum: { amount: 2000, unit: "mcg" },
};

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

export function checkDoseAssessment(dvPercent: number | undefined): DoseAssessment {
  if (dvPercent == null) return "unknown";
  if (dvPercent >= 300) return "above_UL";
  if (dvPercent >= 20) return "effective";
  return "below_effective";
}

export function flagRiskyIngredient(name: string): string | null {
  const lower = name.toLowerCase();
  const hit = RISKY_INGREDIENTS.find((r) => lower.includes(r.match));
  return hit ? hit.reason : null;
}
