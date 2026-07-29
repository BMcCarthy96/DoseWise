import React from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, F } from "../theme";
import type { Alternative } from "../types";

// Suggests real NIH DSLD products whose labels avoid the issues found in the
// scanned product. Every entry is a verified database record — never an AI
// suggestion — and deliberately carries no DoseWise score, since we haven't run
// the full report pipeline on it. Tapping one scans it for real.
export default function AlternativesPanel({
  alternatives,
  loading,
  error,
  onScan,
}: {
  alternatives: Alternative[] | null;
  loading: boolean;
  error?: string;
  onScan: (upc: string) => void;
}) {
  // Stay quiet unless there's something real to say: no card at all when the
  // lookup failed or turned up nothing we can stand behind.
  if (error) return null;
  if (!loading && (!alternatives || alternatives.length === 0)) return null;

  return (
    <View style={s.card}>
      <Text style={s.title}>Better-labelled options</Text>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={C.primary} />
          <Text style={s.muted}>Looking for better-labelled options…</Text>
        </View>
      ) : (
        <>
          <Text style={s.intro}>
            Similar products in the NIH Dietary Supplement Label Database whose labels avoid the issues found above.
            These come straight from that database — we haven't scored them yet, so scan one to run a full report.
          </Text>

          {(alternatives ?? []).map((alt) => (
            <View key={alt.dsldId} style={s.item}>
              <Text style={s.brand}>{alt.brand}</Text>
              <Text style={s.name}>{alt.name}</Text>

              {alt.fixes.map((fix, i) => (
                <View key={`f-${i}`} style={s.row}>
                  <Ionicons name="checkmark-circle" size={16} color={C.good} style={s.icon} />
                  <Text style={s.fix}>{fix}</Text>
                </View>
              ))}

              {alt.caveats.map((cav, i) => (
                <View key={`c-${i}`} style={s.row}>
                  <Ionicons name="alert-circle-outline" size={16} color={C.muted} style={s.icon} />
                  <Text style={s.caveat}>{cav}</Text>
                </View>
              ))}

              {alt.upc ? (
                <TouchableOpacity style={s.scanBtn} activeOpacity={0.7} onPress={() => onScan(alt.upc as string)}>
                  <Ionicons name="scan-outline" size={15} color="#fff" />
                  <Text style={s.scanLabel}>Scan this product</Text>
                </TouchableOpacity>
              ) : (
                <Text style={s.noUpc}>No barcode on file for this label.</Text>
              )}
            </View>
          ))}

          <Text style={s.footnote}>
            Not an endorsement — these are label comparisons from public NIH data, not medical advice.
          </Text>
        </>
      )}
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
  center: { alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12 },
  muted: { fontFamily: F.semibold, fontSize: 13, color: C.muted, textAlign: "center", lineHeight: 19 },
  intro: { fontFamily: F.semibold, fontSize: 12.5, color: C.muted, lineHeight: 18 },
  item: { backgroundColor: C.fill, borderRadius: 14, padding: 14, gap: 7 },
  brand: { fontFamily: F.extrabold, fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 0.4 },
  name: { fontFamily: F.extrabold, fontSize: 15, color: C.text, marginBottom: 2 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  icon: { marginTop: 1 },
  fix: { flex: 1, fontFamily: F.semibold, fontSize: 13, color: C.text, lineHeight: 18 },
  caveat: { flex: 1, fontFamily: F.semibold, fontSize: 12.5, color: C.muted, lineHeight: 18 },
  scanBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: C.primary,
    borderRadius: 11,
    paddingVertical: 10,
    marginTop: 6,
  },
  scanLabel: { fontFamily: F.bold, fontSize: 13, color: "#fff" },
  noUpc: { fontFamily: F.semibold, fontSize: 11.5, color: C.muted, marginTop: 4 },
  footnote: { fontFamily: F.semibold, fontSize: 11, color: C.muted, lineHeight: 16 },
});
