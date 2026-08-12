import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, F } from "../theme";
import type { IngredientEvidence, DoseAssessment, DoseAssessmentReason, EvidenceGrade, Citation, ProductMatchMethod } from "../types";
import { NOT_RESEARCHED_NOTE } from "../types";

// Dose assessment → plain-language label + color. This is the "is the amount
// actually useful / safe" signal a layperson cares about.
const DOSE_META: Record<DoseAssessment, { label: string; color: string; icon: React.ComponentProps<typeof Ionicons>["name"] }> = {
  effective: { label: "Effective dose", color: C.good, icon: "checkmark-circle" },
  below_effective: { label: "Below typical dose", color: C.caution, icon: "remove-circle" },
  above_UL: { label: "Above safe upper limit", color: C.bad, icon: "alert-circle" },
  unknown: { label: "Dose not disclosed", color: C.muted, icon: "help-circle" },
};

// "Unknown" alone used to always render as "Dose not disclosed" — false when
// the label plainly DOES print an amount and the server simply can't place it
// against a limit (a 25,000 IU vitamin A with no stated form, an ambiguous
// salt weight). These labels are additive on top of DOSE_META.unknown rather
// than replacing it, so a cached report with no reason set still renders.
const DOSE_REASON_LABEL: Partial<Record<DoseAssessmentReason, string>> = {
  no_dose_given: "Dose not disclosed",
  unknown_nutrient: "Not a recognized nutrient",
  unknown_basis: "Dose disclosed, but its basis can't be confirmed",
  iu_form_unknown: "Dose disclosed, but its chemical form is unknown",
  ambiguous_salt_weight: "Dose disclosed as a salt weight — elemental amount unclear",
  blend_component: "Hidden inside a proprietary blend",
};

function doseMeta(ing: IngredientEvidence) {
  const base = DOSE_META[ing.doseAssessment] ?? DOSE_META.unknown;
  if (ing.doseAssessment !== "unknown" || !ing.doseAssessmentReason) return base;
  const label = DOSE_REASON_LABEL[ing.doseAssessmentReason];
  return label ? { ...base, label } : base;
}

const MATCH_METHOD_NOTE: Record<ProductMatchMethod, string> = {
  upc: "Identified by barcode and matched against the NIH supplement label database.",
  name: "Identified by matching the label's brand, name, and strength against the NIH supplement label database.",
  photo: "Identified from a label photo — not verified against a product database.",
};

// Evidence grade → plain-language label + color. Reflects how much published
// human research backs the ingredient — kept separate from dose so the two
// signals never get visually conflated.
const GRADE_META: Record<EvidenceGrade, { label: string; color: string }> = {
  A: { label: "Strong evidence", color: C.good },
  B: { label: "Moderate evidence", color: "#34D399" },
  C: { label: "Limited evidence", color: C.caution },
  D: { label: "Weak evidence", color: C.bad },
  insufficient: { label: "Not enough data", color: C.muted },
};

function Badge({ color, icon, label }: { color: string; icon?: React.ComponentProps<typeof Ionicons>["name"]; label: string }) {
  return (
    <View style={[s.badge, { backgroundColor: `${color}1A`, borderColor: `${color}55` }]}>
      {icon ? <Ionicons name={icon} size={12} color={color} /> : null}
      <Text style={[s.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

function CitationRow({ citation }: { citation: Citation }) {
  return (
    <TouchableOpacity
      style={s.citation}
      activeOpacity={0.6}
      onPress={() => citation.url && Linking.openURL(citation.url)}
    >
      <Ionicons name="document-text-outline" size={13} color={C.secondary} style={{ marginTop: 1 }} />
      <Text style={s.citationText} numberOfLines={2}>
        {citation.title}
        {citation.year ? ` (${citation.year})` : ""}
      </Text>
      <Ionicons name="open-outline" size={12} color={C.muted} />
    </TouchableOpacity>
  );
}

export default function BreakdownChart({
  ingredients,
  proprietaryBlends,
  otherIngredients,
  matchedBy,
}: {
  ingredients: IngredientEvidence[];
  proprietaryBlends: string[];
  otherIngredients: string[];
  /** How the product itself was identified — shown once, since we don't track per-ingredient provenance separately from product identity. */
  matchedBy?: ProductMatchMethod;
}) {
  return (
    <View style={s.container}>
      {matchedBy && (
        <View style={s.provenance}>
          <Ionicons name="shield-checkmark-outline" size={13} color={C.muted} />
          <Text style={s.provenanceText}>{MATCH_METHOD_NOTE[matchedBy]}</Text>
        </View>
      )}

      {ingredients.map((ing) => {
        const dose = doseMeta(ing);
        const grade = GRADE_META[ing.evidenceGrade] ?? GRADE_META.insufficient;
        const amountLabel = ing.amount != null ? `${ing.amount}${ing.unit ? ` ${ing.unit}` : ""}` : null;

        return (
          <View key={ing.name} style={s.card}>
            <View style={s.cardHeader}>
              <Text style={s.name} numberOfLines={2}>{ing.name}</Text>
              <View style={s.amountCol}>
                {amountLabel ? <Text style={s.amount}>{amountLabel}</Text> : null}
                {ing.dvPercent != null ? <Text style={s.dv}>{ing.dvPercent}% DV</Text> : null}
              </View>
            </View>

            {ing.dvPercent != null && (
              <View style={s.barTrack}>
                <View style={[s.barFill, { width: `${Math.max(4, Math.min(100, ing.dvPercent))}%` }]} />
                {ing.dvPercent > 100 && <View style={s.barOver} />}
              </View>
            )}

            <View style={s.badgeRow}>
              <Badge color={dose.color} icon={dose.icon} label={dose.label} />
              <Badge color={grade.color} label={grade.label} />
            </View>

            {ing.note ? <Text style={s.note}>{ing.note}</Text> : null}

            {/* Rendered even at zero — absence of evidence communicated by
                absence of interface is exactly the failure mode this fixes:
                a blank space here used to look identical to "not checked yet". */}
            <View style={s.citationBox}>
              {ing.citations?.length > 0 ? (
                <>
                  <Text style={s.citationHeader}>Sources ({ing.citations.length})</Text>
                  {ing.citations.map((cit, i) => (
                    <CitationRow key={cit.pmid ?? i} citation={cit} />
                  ))}
                </>
              ) : ing.note === NOT_RESEARCHED_NOTE ? (
                <Text style={s.citationEmpty}>{NOT_RESEARCHED_NOTE}</Text>
              ) : (
                <Text style={s.citationEmpty}>No published studies matched our PubMed search for this ingredient.</Text>
              )}
            </View>
          </View>
        );
      })}

      {proprietaryBlends.length > 0 && (
        <View style={s.blendBox}>
          <View style={s.blendHeader}>
            <Ionicons name="eye-off-outline" size={15} color={C.caution} />
            <Text style={s.blendTitle}>Proprietary blends</Text>
          </View>
          <Text style={s.blendBody}>
            The individual doses inside these blends are hidden by the manufacturer, so we can't verify whether each
            ingredient is present in a meaningful amount:
          </Text>
          <Text style={s.blendList}>{proprietaryBlends.join(", ")}</Text>
        </View>
      )}

      {otherIngredients.length > 0 && (
        <View style={s.otherBox}>
          <Text style={s.otherTitle}>Other (inactive) ingredients</Text>
          <Text style={s.otherList}>{otherIngredients.join(", ")}</Text>
        </View>
      )}

      <View style={s.legend}>
        <Text style={s.legendTitle}>How to read this</Text>
        <Text style={s.legendLine}>
          <Text style={s.legendBold}>% DV</Text> is the percent of the recommended Daily Value for an average adult —
          100% covers a typical day's needs.
        </Text>
        <Text style={s.legendLine}>
          <Text style={s.legendBold}>Evidence</Text> reflects how much published human research supports the ingredient,
          from "Strong" down to "Not enough data." Tap any source to read it on PubMed.
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { gap: 14 },
  card: { backgroundColor: C.fill, borderRadius: 16, padding: 14, gap: 10 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  name: { fontFamily: F.extrabold, fontSize: 15, color: C.text, flex: 1 },
  amountCol: { alignItems: "flex-end" },
  amount: { fontFamily: F.bold, fontSize: 13, color: C.text },
  dv: { fontFamily: F.bold, fontSize: 12, color: C.muted, marginTop: 1 },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: "rgba(15,42,67,0.08)", overflow: "hidden", flexDirection: "row" },
  barFill: { height: "100%", borderRadius: 4, backgroundColor: C.primary },
  barOver: { position: "absolute", right: 0, top: 0, bottom: 0, width: 3, backgroundColor: C.bad },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: { fontFamily: F.bold, fontSize: 11 },
  note: { fontFamily: F.semibold, fontSize: 13, color: C.text, lineHeight: 19 },
  citationBox: { gap: 6, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10 },
  citationHeader: { fontFamily: F.bold, fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 0.4 },
  citation: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  citationText: { flex: 1, fontFamily: F.semibold, fontSize: 12, color: C.secondary, lineHeight: 16 },
  citationEmpty: { fontFamily: F.semibold, fontSize: 12, color: C.muted, fontStyle: "italic", lineHeight: 16 },
  provenance: { flexDirection: "row", alignItems: "flex-start", gap: 6, paddingHorizontal: 2, marginBottom: 2 },
  provenanceText: { flex: 1, fontFamily: F.semibold, fontSize: 11.5, color: C.muted, lineHeight: 16 },
  blendBox: { backgroundColor: `${C.caution}12`, borderRadius: 16, padding: 14, gap: 6 },
  blendHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  blendTitle: { fontFamily: F.extrabold, fontSize: 13, color: C.caution },
  blendBody: { fontFamily: F.semibold, fontSize: 12, color: C.text, lineHeight: 17 },
  blendList: { fontFamily: F.bold, fontSize: 13, color: C.text },
  otherBox: { gap: 4, paddingHorizontal: 2 },
  otherTitle: { fontFamily: F.bold, fontSize: 12, color: C.muted },
  otherList: { fontFamily: F.semibold, fontSize: 13, color: C.muted, lineHeight: 18 },
  legend: { backgroundColor: C.fill, borderRadius: 14, padding: 14, gap: 6 },
  legendTitle: { fontFamily: F.extrabold, fontSize: 12, color: C.text, textTransform: "uppercase", letterSpacing: 0.4 },
  legendLine: { fontFamily: F.semibold, fontSize: 12, color: C.muted, lineHeight: 17 },
  legendBold: { fontFamily: F.extrabold, color: C.text },
});
