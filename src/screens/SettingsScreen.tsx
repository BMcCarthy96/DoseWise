import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, F } from "../theme";

function Row({ icon, label, sub }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; sub?: string }) {
  return (
    <TouchableOpacity style={s.row} activeOpacity={0.7}>
      <View style={s.rowIcon}>
        <Ionicons name={icon} size={18} color={C.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.rowLabel}>{label}</Text>
        {sub ? <Text style={s.rowSub}>{sub}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={C.muted} />
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Settings</Text>
      </View>

      <View style={s.section}>
        <Row icon="log-in-outline" label="Sign in" sub="Save and sync your scan history" />
      </View>

      <View style={s.section}>
        <Row icon="information-circle-outline" label="Data sources" sub="NIH, PubMed, openFDA & more" />
        <Row icon="trash-outline" label="Clear scan history" />
      </View>

      <Text style={s.disclaimer}>
        DoseWise summarizes publicly available research and regulatory data. It is not medical advice —
        talk to a healthcare provider before starting or stopping any supplement.
      </Text>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 8 },
  title: { fontFamily: F.extrabold, fontSize: 26, color: C.text },
  section: {
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: C.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: C.fill,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { fontFamily: F.bold, fontSize: 14, color: C.text },
  rowSub: { fontFamily: F.semibold, fontSize: 12, color: C.muted, marginTop: 1 },
  disclaimer: {
    marginHorizontal: 24,
    marginTop: 24,
    fontFamily: F.semibold,
    fontSize: 11,
    lineHeight: 16,
    color: C.muted,
    textAlign: "center",
  },
});
