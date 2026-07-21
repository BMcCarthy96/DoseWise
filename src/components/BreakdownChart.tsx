import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, F } from "../theme";
import type { IngredientEvidence, DoseAssessment, EvidenceGrade, Citation } from "../types";

// Dose assessment → plain-language label + color. This is the "is the amount
// actually useful / safe" signal a layperson cares about.
const DOSE_META: Record<DoseAssessment, { label: string; color: string; icon: React.ComponentProps<typeof Ionicons>["name"] }> = {
  effective: { label: "Effective dose", color: C.good, icon: "checkmark-circle" },
  below_effective: { label: "Below typical dose", color: C.caution, icon: "remove-circle" },
  above_UL: { label: "Above safe upper limit", color: C.bad, icon: "alert-circle" },
  unknown: { label: "Dose not disclosed", color: C.muted, icon: "help-circle" },
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
}: {
  ingredients: IngredientEvidence[];
  proprietaryBlends: string[];
  otherIngredients: string[];
}) {
  return (
    <View style={s.container}>
      {ingredients.map((ing) => {
        const dose = DOSE_META[ing.doseAssessment] ?? DOSE_META.unknown;
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

            {ing.citations?.length > 0 && (
              <View style={s.citationBox}>
                <Text style={s.citationHeader}>Sources ({ing.citations.length})</Text>
                {ing.citations.map((cit, i) => (
                  <CitationRow key={cit.pmid ?? i} citation={cit} />
                ))}
              </View>
            )}
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
