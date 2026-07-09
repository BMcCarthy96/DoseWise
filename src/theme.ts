// ── Color palette — "clinical trust" teal/navy ──────────────────────────────
export const C = {
  primary:   "#0D9488",   // deep teal — main CTA, brand
  secondary: "#38BDF8",   // sky blue — info accents, links
  bg:        "#F4FAF9",   // cool mint-white — screen background
  card:      "#FFFFFF",   // pure white — card surfaces
  text:      "#0F2A43",   // deep navy — primary text
  ink:       "#0F2A43",   // alias of text, used for headings
  muted:     "#5F7B7A",   // slate teal — secondary text / labels
  border:    "#DCEBE9",   // pale teal — card borders, dividers
  fill:      "#EAF4F2",   // light teal — input / inner backgrounds
  good:      "#10B981",   // verdict: good (emerald)
  caution:   "#F59E0B",   // verdict: caution (amber)
  bad:       "#EF4444",   // verdict: bad (red)
  error:     "#EF4444",   // alias of bad, used for form errors
} as const;

// ── Font families (loaded via @expo-google-fonts/manrope) ──────────────────
export const F = {
  regular:   "Manrope_400Regular",
  semibold:  "Manrope_600SemiBold",
  bold:      "Manrope_700Bold",
  extrabold: "Manrope_800ExtraBold",
} as const;

export type Verdict = "good" | "caution" | "bad";

// ── Verdict → color ──────────────────────────────────────────────────────────
export function verdictColor(verdict: Verdict): string {
  if (verdict === "good") return C.good;
  if (verdict === "caution") return C.caution;
  return C.bad;
}
