import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, F } from "../theme";
import type { LabelTrustFlag, Recall, AdverseEventSummary } from "../types";

const SEVERITY_COLOR: Record<string, string> = { info: C.secondary, warn: C.caution, danger: C.bad };

export default function WarningList({
  flags,
  recalls,
  adverseEventSummary,
  researchConsensus,
}: {
  flags: LabelTrustFlag[];
  recalls: Recall[];
  adverseEventSummary: AdverseEventSummary | null;
  researchConsensus: string;
}) {
  return (
    <View style={s.container}>
      {flags.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Label flags</Text>
          {flags.map((f, i) => (
            <View key={i} style={s.flagRow}>
              <View style={[s.flagDot, { backgroundColor: SEVERITY_COLOR[f.severity] ?? C.muted }]} />
              <Text style={s.flagText}>{f.detail}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={s.section}>
        <Text style={s.sectionTitle}>FDA recalls</Text>
        {recalls.length === 0 ? (
          <Text style={s.muted}>No recall records found for this brand.</Text>
        ) : (
          recalls.map((r, i) => (
            <View key={i} style={s.recallRow}>
              <Ionicons name="warning-outline" size={16} color={C.bad} />
              <View style={{ flex: 1 }}>
                <Text style={s.recallReason}>{r.reason}</Text>
                <Text style={s.recallMeta}>{r.date} · {r.classification} · {r.status}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>Adverse event reports</Text>
        {adverseEventSummary ? (
          <Text style={s.muted}>
            {adverseEventSummary.reportCount} reports filed mentioning this brand (unverified, self-reported).
            Most common: {adverseEventSummary.topReactions.join(", ")}.
          </Text>
        ) : (
          <Text style={s.muted}>No adverse event records found for this brand.</Text>
        )}
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>Research consensus</Text>
        <Text style={s.consensus}>{researchConsensus}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { gap: 18 },
  section: { gap: 8 },
  sectionTitle: { fontFamily: F.extrabold, fontSize: 13, color: C.text, textTransform: "uppercase", letterSpacing: 0.4 },
  flagRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  flagDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  flagText: { flex: 1, fontFamily: F.semibold, fontSize: 13, color: C.text, lineHeight: 19 },
  recallRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  recallReason: { fontFamily: F.semibold, fontSize: 13, color: C.text, lineHeight: 18 },
  recallMeta: { fontFamily: F.semibold, fontSize: 11, color: C.muted, marginTop: 2 },
  muted: { fontFamily: F.semibold, fontSize: 13, color: C.muted, lineHeight: 19 },
  consensus: { fontFamily: F.semibold, fontSize: 13, color: C.text, lineHeight: 19 },
});
