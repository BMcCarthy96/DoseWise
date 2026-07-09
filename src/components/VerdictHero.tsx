import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, F, Verdict, verdictColor } from "../theme";

const VERDICT_ICON: Record<Verdict, React.ComponentProps<typeof Ionicons>["name"]> = {
  good: "checkmark-circle",
  caution: "alert-circle",
  bad: "close-circle",
};

export default function VerdictHero({
  grade,
  score,
  headline,
  summary,
  confidence,
}: {
  grade: Verdict;
  score: number;
  headline: string;
  summary: string;
  confidence: "low" | "medium" | "high";
}) {
  const color = verdictColor(grade);

  return (
    <View style={[s.hero, { backgroundColor: color }]}>
      <Ionicons name={VERDICT_ICON[grade]} size={44} color="#fff" />
      <Text style={s.headline}>{headline}</Text>
      <View style={s.scoreRow}>
        <Text style={s.score}>{score}</Text>
        <Text style={s.scoreOutOf}>/100</Text>
      </View>
      <Text style={s.summary}>{summary}</Text>
      <View style={s.confidenceBadge}>
        <Text style={s.confidenceText}>{confidence} confidence</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  hero: { borderRadius: 28, padding: 28, alignItems: "center", gap: 8, marginTop: 8 },
  headline: { fontFamily: F.extrabold, fontSize: 21, color: "#fff", textAlign: "center", marginTop: 4 },
  scoreRow: { flexDirection: "row", alignItems: "flex-end", gap: 2 },
  score: { fontFamily: F.extrabold, fontSize: 36, color: "#fff" },
  scoreOutOf: { fontFamily: F.bold, fontSize: 16, color: "rgba(255,255,255,0.8)", marginBottom: 4 },
  summary: { fontFamily: F.semibold, fontSize: 13, color: "rgba(255,255,255,0.92)", textAlign: "center", lineHeight: 19 },
  confidenceBadge: {
    marginTop: 6,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  confidenceText: { fontFamily: F.bold, fontSize: 11, color: "#fff", textTransform: "capitalize" },
});
