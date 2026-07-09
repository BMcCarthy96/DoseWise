import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, F } from "../theme";
import type { ReviewConsensus } from "../types";

const SENTIMENT_COLOR: Record<string, string> = { positive: C.good, mixed: C.caution, negative: C.bad };

export default function ReviewsPanel({
  reviews,
  loading,
  error,
}: {
  reviews: ReviewConsensus | null;
  loading: boolean;
  error?: string;
}) {
  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={C.primary} />
        <Text style={s.muted}>Gathering certifications and public reviews…</Text>
      </View>
    );
  }

  if (error || !reviews) {
    return (
      <View style={s.center}>
        <Ionicons name="cloud-offline-outline" size={28} color={C.muted} />
        <Text style={s.muted}>{error ?? "Couldn't gather reviews for this product."}</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.section}>
        <Text style={s.sectionTitle}>Third-party certification</Text>
        {reviews.thirdParty.length === 0 ? (
          <Text style={s.muted}>No third-party certification found.</Text>
        ) : (
          reviews.thirdParty.map((t, i) => (
            <View key={i} style={s.certRow}>
              <View style={s.certBadge}>
                <Text style={s.certBadgeText}>{t.org}</Text>
              </View>
              <Text style={s.certStatus}>{t.status}</Text>
            </View>
          ))
        )}
      </View>

      <View style={s.section}>
        <View style={s.consensusHeader}>
          <Text style={s.sectionTitle}>Public consensus</Text>
          <View style={[s.sentimentDot, { backgroundColor: SENTIMENT_COLOR[reviews.consensus.sentiment] }]} />
        </View>
        <Text style={s.consensusText}>{reviews.consensus.summary}</Text>
        {reviews.consensus.sources.map((src, i) => (
          <Text key={i} style={s.source} numberOfLines={1}>• {src.title}</Text>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { gap: 18 },
  center: { alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 20 },
  muted: { fontFamily: F.semibold, fontSize: 13, color: C.muted, textAlign: "center" },
  section: { gap: 8 },
  sectionTitle: { fontFamily: F.extrabold, fontSize: 13, color: C.text, textTransform: "uppercase", letterSpacing: 0.4 },
  certRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  certBadge: { backgroundColor: C.primary, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  certBadgeText: { fontFamily: F.extrabold, fontSize: 11, color: "#fff" },
  certStatus: { flex: 1, fontFamily: F.semibold, fontSize: 13, color: C.text },
  consensusHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  sentimentDot: { width: 8, height: 8, borderRadius: 4 },
  consensusText: { fontFamily: F.semibold, fontSize: 13, color: C.text, lineHeight: 19 },
  source: { fontFamily: F.semibold, fontSize: 12, color: C.secondary },
});
