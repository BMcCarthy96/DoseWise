import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, F } from "../theme";

const DESKTOP_BREAKPOINT = 500;
const FRAME_WIDTH = 390;
const FRAME_HEIGHT = 844;

function isInsideIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export default function PhoneFrame({ children }: { children: React.ReactNode }) {
  const [width, setWidth] = useState(window.innerWidth);

  useEffect(() => {
    function onResize() {
      setWidth(window.innerWidth);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (isInsideIframe() || width <= DESKTOP_BREAKPOINT) {
    return <>{children}</>;
  }

  return (
    <View style={s.backdrop}>
      <View style={s.brandRow}>
        <Ionicons name="shield-checkmark" size={20} color={C.primary} />
        <Text style={s.brandName}>DoseWise</Text>
      </View>
      <View style={s.bezel}>
        {React.createElement("iframe", {
          src: window.location.href,
          title: "DoseWise",
          allow: "camera; clipboard-write",
          style: { width: FRAME_WIDTH, height: FRAME_HEIGHT, border: "none", borderRadius: 34, display: "block" },
        })}
      </View>
      <Text style={s.caption}>Live demo — best experienced on mobile</Text>
      {React.createElement(
        "a",
        {
          href: "https://github.com/BMcCarthy96/DoseWise",
          target: "_blank",
          rel: "noopener noreferrer",
          style: { color: C.primary, fontFamily: F.semibold, textDecoration: "none", fontSize: 13, marginTop: 6 },
        },
        "View source on GitHub",
      )}
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.text,
    paddingVertical: 40,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 24 },
  brandName: { fontFamily: F.extrabold, fontSize: 20, color: "#fff" },
  bezel: {
    padding: 14,
    borderRadius: 48,
    backgroundColor: "#0b1620",
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.35,
    shadowRadius: 50,
  },
  caption: {
    marginTop: 20,
    color: "rgba(255,255,255,0.55)",
    fontFamily: F.semibold,
    fontSize: 13,
  },
});
