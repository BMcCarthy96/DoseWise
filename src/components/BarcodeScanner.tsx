import React, { useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { CameraView, useCameraPermissions, BarcodeScanningResult } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { C, F } from "../theme";

export default function BarcodeScanner({ onScanned }: { onScanned: (upc: string) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const lockedRef = useRef(false);

  function handleScan(result: BarcodeScanningResult) {
    if (lockedRef.current) return;
    lockedRef.current = true;
    onScanned(result.data);
  }

  if (!permission) {
    return (
      <View style={s.center}>
        <Text style={s.hint}>Checking camera permission…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={s.center}>
        <Ionicons name="camera-outline" size={40} color="#fff" />
        <Text style={s.hint}>Camera access is needed to scan barcodes</Text>
        <TouchableOpacity style={s.permBtn} onPress={requestPermission} activeOpacity={0.85}>
          <Text style={s.permBtnLabel}>Grant camera access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <CameraView
      style={StyleSheet.absoluteFill}
      facing="back"
      barcodeScannerSettings={{ barcodeTypes: ["upc_a", "upc_e", "ean13", "ean8"] }}
      onBarcodeScanned={lockedRef.current ? undefined : handleScan}
    />
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 24 },
  hint: { fontFamily: F.semibold, fontSize: 13, color: "rgba(255,255,255,0.8)", textAlign: "center" },
  permBtn: { backgroundColor: C.primary, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12, marginTop: 4 },
  permBtnLabel: { fontFamily: F.bold, fontSize: 13, color: "#fff" },
});
