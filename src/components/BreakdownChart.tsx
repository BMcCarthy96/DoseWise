import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { C, F } from "../theme";
import type { IngredientEvidence } from "../types";

const GRADE_COLOR: Record<string, string> = {
  A: C.good,
  B: "#34D399",
  C: C.caution,
  D: C.bad,
  insufficient: C.muted,
};

function barWidth(dvPercent: number | undefined): number {
  if (dvPercent == null) return 6;
  return Math.max(6, Math.min(100, dvPercent));
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
      {ingredients.map((ing) => (
        <View key={ing.name} style={s.row}>
          <View style={s.rowHeader}>
            <Text style={s.name} numberOfLines={1}>{ing.name}</Text>
            <Text style={s.dv}>{ing.dvPercent != null ? `${ing.dvPercent}% DV` : "dose hidden"}</Text>
          </View>
          <View style={s.barTrack}>
            <View style={[s.barFill, { width: `${barWidth(ing.dvPercent)}%`, backgroundColor: GRADE_COLOR[ing.evidenceGrade] ?? C.muted }]} />
          </View>
          <Text style={s.note} numberOfLines={2}>{ing.note}</Text>
        </View>
      ))}

      {proprietaryBlends.length > 0 && (
        <View style={s.blendBox}>
          <Text style={s.blendTitle}>Proprietary blends (individual doses not disclosed)</Text>
          <Text style={s.blendList}>{proprietaryBlends.join(", ")}</Text>
        </View>
      )}

      {otherIngredients.length > 0 && (
        <View style={s.otherBox}>
          <Text style={s.otherTitle}>Other ingredients (inactive)</Text>
          <Text style={s.otherList}>{otherIngredients.join(", ")}</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { gap: 16 },
  row: { gap: 6 },
  rowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  name: { fontFamily: F.bold, fontSize: 14, color: C.text, flex: 1, marginRight: 8 },
  dv: { fontFamily: F.bold, fontSize: 12, color: C.muted },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: C.fill, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 4 },
  note: { fontFamily: F.semibold, fontSize: 12, color: C.muted, lineHeight: 16 },
  blendBox: { backgroundColor: C.fill, borderRadius: 14, padding: 14, gap: 4 },
  blendTitle: { fontFamily: F.bold, fontSize: 12, color: C.caution },
  blendList: { fontFamily: F.semibold, fontSize: 13, color: C.text },
  otherBox: { gap: 4 },
  otherTitle: { fontFamily: F.bold, fontSize: 12, color: C.muted },
  otherList: { fontFamily: F.semibold, fontSize: 13, color: C.muted },
});
