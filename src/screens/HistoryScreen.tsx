import React from "react";
import { View, Text, StyleSheet, SafeAreaView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, F } from "../theme";

export default function HistoryScreen() {
  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>History</Text>
        <Text style={s.subtitle}>Your past scans</Text>
      </View>

      <View style={s.empty}>
        <Ionicons name="time-outline" size={40} color={C.muted} />
        <Text style={s.emptyTitle}>No scans yet</Text>
        <Text style={s.emptyHint}>Scanned supplements will show up here</Text>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 8 },
  title: { fontFamily: F.extrabold, fontSize: 26, color: C.text },
  subtitle: { fontFamily: F.semibold, fontSize: 13, color: C.muted, marginTop: 4 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 40 },
  emptyTitle: { fontFamily: F.bold, fontSize: 16, color: C.text, marginTop: 8 },
  emptyHint: { fontFamily: F.semibold, fontSize: 13, color: C.muted, textAlign: "center" },
});
