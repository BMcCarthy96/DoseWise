import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, F } from "../theme";
import type { ScoreFactor, ScoreImpact } from "../types";

const META: Record<ScoreImpact, { icon: React.ComponentProps<typeof Ionicons>["name"]; color: string }> = {
  positive: { icon: "add-circle", color: C.good },
  negative: { icon: "remove-circle", color: C.bad },
  neutral: { icon: "help-circle", color: C.muted },
};

// "Why this grade" — turns the score into a scannable list of the specific
// factors that lifted or lowered it. Always shown under the verdict hero.
export default function WhyThisGrade({ factors }: { factors: ScoreFactor[] }) {
  if (!factors || factors.length === 0) return null;

  return (
    <View style={s.card}>
      <Text style={s.title}>Why this grade</Text>
      {factors.map((f, i) => {
        const m = META[f.impact] ?? META.neutral;
        return (
          <View key={`${f.impact}-${i}`} style={s.row}>
            <Ionicons name={m.icon} size={18} color={m.color} style={s.icon} />
            <Text style={s.text}>{f.text}</Text>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    marginTop: 16,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 18,
    padding: 18,
    gap: 12,
  },
  title: {
    fontFamily: F.extrabold,
    fontSize: 12,
    color: C.text,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  icon: { marginTop: 1 },
  text: { flex: 1, fontFamily: F.semibold, fontSize: 13.5, color: C.text, lineHeight: 19 },
});
