import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, F, Verdict, verdictColor } from "../theme";

const VERDICT_ICON: Record<Verdict, React.ComponentProps<typeof Ionicons>["name"]> = {
  good: "checkmark-circle",
  caution: "alert-circle",
  bad: "close-circle",
};

// A `good` grade rendered as a full-bleed green card when the underlying data
// was thin (a blurry photo, an unreachable source) is the single most
// misleading thing this screen can show — it reads as confident regardless of
// how it was computed. Low confidence gets its own neutral treatment instead
// of just a small badge that's easy to miss: a desaturated surface, a smaller
// "estimated" score, and a full-width bar instead of a pill. Medium sits
// between the two — still the verdict color, but the badge is solid rather
// than translucent so it doesn't read as equally trustworthy as "high".
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
  const verdict = verdictColor(grade);
  const low = confidence === "low";
  const heroColor = low ? C.fill : verdict;
  const onColor = low ? C.text : "#fff";
  const onColorMuted = low ? C.muted : "rgba(255,255,255,0.92)";

  return (
    <View style={[s.hero, { backgroundColor: heroColor }, low && s.heroLow, low && { borderColor: verdict }]}>
      <Ionicons name={VERDICT_ICON[grade]} size={40} color={low ? verdict : "#fff"} />
      <Text style={[s.headline, { color: onColor }]}>{headline}</Text>

      {low && <Text style={[s.estimatedLabel, { color: verdict }]}>ESTIMATED</Text>}
      <View style={s.scoreRow}>
        <Text style={[s.score, { color: onColor }, low && s.scoreLow]}>{score}</Text>
        <Text style={[s.scoreOutOf, { color: onColorMuted }]}>/100</Text>
      </View>
      <Text style={[s.summary, { color: onColorMuted }]}>{summary}</Text>

      {low ? (
        <View style={[s.confidenceBar, { borderColor: verdict, backgroundColor: `${verdict}14` }]}>
          <Ionicons name="alert-circle" size={15} color={verdict} />
          <Text style={[s.confidenceBarText, { color: verdict }]}>
            Low confidence — thin or unverified data. Treat this as a starting point.
          </Text>
        </View>
      ) : (
        <View style={[s.confidenceBadge, confidence === "medium" && s.confidenceBadgeSolid]}>
          <Text style={s.confidenceText}>{confidence} confidence</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  hero: { borderRadius: 28, padding: 28, alignItems: "center", gap: 8, marginTop: 8 },
  heroLow: { borderWidth: 1.5, padding: 26.5 },
  headline: { fontFamily: F.extrabold, fontSize: 21, textAlign: "center", marginTop: 4 },
  estimatedLabel: { fontFamily: F.extrabold, fontSize: 11, letterSpacing: 1, marginTop: 6 },
  scoreRow: { flexDirection: "row", alignItems: "flex-end", gap: 2 },
  score: { fontFamily: F.extrabold, fontSize: 36 },
  scoreLow: { fontSize: 28 },
  scoreOutOf: { fontFamily: F.bold, fontSize: 16, marginBottom: 4 },
  summary: { fontFamily: F.semibold, fontSize: 13, textAlign: "center", lineHeight: 19 },
  confidenceBadge: {
    marginTop: 6,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  confidenceBadgeSolid: { backgroundColor: "rgba(255,255,255,0.38)" },
  confidenceText: { fontFamily: F.bold, fontSize: 11, color: "#fff", textTransform: "capitalize" },
  confidenceBar: {
    marginTop: 8,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  confidenceBarText: { flex: 1, fontFamily: F.bold, fontSize: 12, lineHeight: 16 },
});
