import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { DisclaimerBody } from "../components/DisclaimerGate";
import { C, F } from "../theme";

// A read-only copy of the first-run disclaimer, reachable from Settings. The
// gate only ever shows once, so without this the text would be unreachable
// after the first launch — which is the wrong posture for a health app.
export default function DisclaimerScreen() {
  const navigation = useNavigation<any>();

  return (
    <SafeAreaView style={s.container} edges={["top", "bottom"]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>About DoseWise</Text>
        <View style={{ width: 22 }} />
      </View>

      <DisclaimerBody heading="What DoseWise is" />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontFamily: F.extrabold, fontSize: 18, color: C.text },
});
