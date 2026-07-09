import React, { useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import BarcodeScanner from "../components/BarcodeScanner";
import { C, F } from "../theme";

export default function ScanScreen() {
  const navigation = useNavigation<any>();
  const navigatedRef = useRef(false);

  function handleScanned(upc: string) {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    navigation.navigate("Results", { upc });
    // Reset the lock shortly after so re-focusing this tab can scan again.
    setTimeout(() => { navigatedRef.current = false; }, 1000);
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>DoseWise</Text>
        <Text style={s.subtitle}>Scan a supplement to see what's really inside</Text>
      </View>

      <View style={s.viewfinder}>
        <BarcodeScanner onScanned={handleScanned} />
        <View style={s.reticleOverlay} pointerEvents="none">
          <View style={s.reticle} />
        </View>
      </View>

      <View style={s.actions}>
        <TouchableOpacity
          style={s.actionBtn}
          activeOpacity={0.85}
          onPress={() => navigation.navigate("LabelPhoto")}
        >
          <Ionicons name="camera-outline" size={20} color={C.primary} />
          <Text style={s.actionLabel}>Photo the label</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 8 },
  title: { fontFamily: F.extrabold, fontSize: 26, color: C.text },
  subtitle: { fontFamily: F.semibold, fontSize: 13, color: C.muted, marginTop: 4 },
  viewfinder: {
    flex: 1,
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 28,
    backgroundColor: C.text,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  reticleOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  reticle: {
    width: 220,
    height: 130,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: C.primary,
  },
  actions: { flexDirection: "row", padding: 20, gap: 12 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    paddingVertical: 14,
  },
  actionLabel: { fontFamily: F.bold, fontSize: 14, color: C.text },
});
