import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { F } from "../theme";

// expo-camera's barcode scanning on web depends on the browser BarcodeDetector API,
// which is Chromium-only. @zxing/browser is a pure-JS decoder that works in every
// browser, so we use it here instead and fall back to manual entry / label photo
// if camera access is denied or unavailable.
export default function BarcodeScanner({ onScanned }: { onScanned: (upc: string) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lockedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let controls: { stop: () => void } | undefined;
    let cancelled = false;

    reader
      .decodeFromConstraints(
        { video: { facingMode: "environment" } },
        videoRef.current as HTMLVideoElement,
        (result) => {
          if (result && !lockedRef.current) {
            lockedRef.current = true;
            onScanned(result.getText());
          }
        },
      )
      .then((c) => {
        if (cancelled) c.stop();
        else controls = c;
      })
      .catch(() => setError("Camera access was denied or is unavailable in this browser."));

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [onScanned]);

  if (error) {
    return (
      <View style={s.center}>
        <Ionicons name="camera-outline" size={40} color="#fff" />
        <Text style={s.hint}>{error}</Text>
        <Text style={s.hintSub}>Use "Enter UPC" or "Photo the label" instead</Text>
      </View>
    );
  }

  return React.createElement("video", {
    ref: videoRef,
    style: { width: "100%", height: "100%", objectFit: "cover" },
    muted: true,
    playsInline: true,
    autoPlay: true,
  });
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 24 },
  hint: { fontFamily: F.semibold, fontSize: 13, color: "rgba(255,255,255,0.8)", textAlign: "center" },
  hintSub: { fontFamily: F.semibold, fontSize: 12, color: "rgba(255,255,255,0.5)", textAlign: "center" },
});
