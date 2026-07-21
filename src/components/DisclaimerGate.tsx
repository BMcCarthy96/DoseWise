import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { C, F } from "../theme";

const ACCEPTED_KEY = "dosewise.disclaimer_accepted.v1";

function Point({ icon, title, body }: { icon: React.ComponentProps<typeof Ionicons>["name"]; title: string; body: string }) {
  return (
    <View style={s.point}>
      <View style={s.pointIcon}>
        <Ionicons name={icon} size={18} color={C.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.pointTitle}>{title}</Text>
        <Text style={s.pointBody}>{body}</Text>
      </View>
    </View>
  );
}

// Shows a one-time informational disclaimer before the app is usable. Required
// posture for a health-information app: make it unmistakable that DoseWise is
// informational only, not medical advice, and not an official/endorsed source.
export default function DisclaimerGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"loading" | "needs_accept" | "accepted">("loading");

  useEffect(() => {
    AsyncStorage.getItem(ACCEPTED_KEY)
      .then((v) => setStatus(v === "true" ? "accepted" : "needs_accept"))
      .catch(() => setStatus("needs_accept"));
  }, []);

  async function accept() {
    setStatus("accepted");
    await AsyncStorage.setItem(ACCEPTED_KEY, "true").catch(() => {});
  }

  if (status === "loading") return null;
  if (status === "accepted") return <>{children}</>;

  return (
    <SafeAreaView style={s.container} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.badge}>
          <Ionicons name="shield-checkmark" size={30} color="#fff" />
        </View>
        <Text style={s.title}>Before you start</Text>
        <Text style={s.intro}>
          DoseWise helps you understand what's in a supplement using published research and public regulatory data.
          A few things to know first:
        </Text>

        <View style={s.points}>
          <Point
            icon="information-circle-outline"
            title="Informational, not medical advice"
            body="DoseWise summarizes research and label data to help you make sense of a product. It doesn't diagnose, treat, or replace a conversation with a healthcare professional."
          />
          <Point
            icon="people-outline"
            title="Talk to a professional"
            body="Always check with a doctor or pharmacist before starting, stopping, or combining supplements — especially if you're pregnant, on medication, or managing a health condition."
          />
          <Point
            icon="document-text-outline"
            title="We show our sources — and our limits"
            body="Reports draw on NIH, PubMed, and openFDA data, with links you can verify. When the data is thin, DoseWise says so rather than guessing."
          />
          <Point
            icon="alert-circle-outline"
            title="Not an official or endorsed source"
            body="DoseWise is an independent tool. It is not affiliated with, or endorsed by, the FDA, NIH, or any supplement manufacturer."
          />
        </View>
      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity style={s.button} activeOpacity={0.85} onPress={accept}>
          <Text style={s.buttonText}>I understand — let's go</Text>
        </TouchableOpacity>
        <Text style={s.footNote}>By continuing you acknowledge you've read the above.</Text>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 26, paddingTop: 24, paddingBottom: 16, alignItems: "flex-start" },
  badge: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: C.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  title: { fontFamily: F.extrabold, fontSize: 27, color: C.text, letterSpacing: -0.5 },
  intro: { fontFamily: F.semibold, fontSize: 14.5, color: C.muted, lineHeight: 21, marginTop: 8 },
  points: { gap: 16, marginTop: 22, width: "100%" },
  point: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  pointIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: C.fill,
    alignItems: "center",
    justifyContent: "center",
  },
  pointTitle: { fontFamily: F.extrabold, fontSize: 15, color: C.text },
  pointBody: { fontFamily: F.semibold, fontSize: 13, color: C.muted, lineHeight: 19, marginTop: 3 },
  footer: { paddingHorizontal: 26, paddingTop: 10, paddingBottom: 8, gap: 8, borderTopWidth: 1, borderTopColor: C.border },
  button: {
    backgroundColor: C.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
  },
  buttonText: { fontFamily: F.extrabold, fontSize: 16, color: "#fff" },
  footNote: { fontFamily: F.semibold, fontSize: 11, color: C.muted, textAlign: "center" },
});
