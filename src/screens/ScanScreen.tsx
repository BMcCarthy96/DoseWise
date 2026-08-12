import React, { useRef } from "react";
import { View, Text, StyleSheet, SafeAreaView } from "react-native";
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

      {/* Photo / upload / manual-UPC all live in the FAB menu — duplicating
          them here just crowded the viewfinder. */}
      <View style={s.viewfinder}>
        <BarcodeScanner onScanned={handleScanned} />
        <View style={s.reticleOverlay} pointerEvents="none">
          <View style={s.reticle} />
        </View>
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
    marginBottom: 20,
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
});
