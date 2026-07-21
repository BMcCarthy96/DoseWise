import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { C, F } from "../theme";
import { supabase } from "../services/supabase";
import { clearLocalHistory } from "../services/history";
import { deleteAccount } from "../services/api";

function Row({
  icon,
  label,
  sub,
  onPress,
  destructive,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  sub?: string;
  onPress?: () => void;
  destructive?: boolean;
}) {
  return (
    <TouchableOpacity style={s.row} activeOpacity={0.7} onPress={onPress}>
      <View style={s.rowIcon}>
        <Ionicons name={icon} size={18} color={destructive ? C.bad : C.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.rowLabel, destructive && { color: C.bad }]}>{label}</Text>
        {sub ? <Text style={s.rowSub}>{sub}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={C.muted} />
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const navigation = useNavigation<any>();
  const [email, setEmail] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null));
    }, []),
  );

  const [deleting, setDeleting] = useState(false);

  async function signOut() {
    await supabase.auth.signOut();
    setEmail(null);
  }

  function clearHistory() {
    Alert.alert("Clear scan history", "This removes your locally saved scans. This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear", style: "destructive", onPress: () => clearLocalHistory() },
    ]);
  }

  async function performAccountDeletion() {
    setDeleting(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Your session has expired — sign in again to delete your account.");
      await deleteAccount(token);
      await supabase.auth.signOut();
      await clearLocalHistory();
      setEmail(null);
      Alert.alert("Account deleted", "Your account and scan history have been permanently removed.");
    } catch (e: any) {
      Alert.alert("Couldn't delete account", e.message ?? "Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  function deleteAccountFlow() {
    // Two-step confirmation — this is irreversible and removes server-side data.
    Alert.alert(
      "Delete account?",
      "This permanently deletes your account and all synced scan history. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            Alert.alert("Are you sure?", "There's no way to recover your account after this.", [
              { text: "Keep my account", style: "cancel" },
              { text: "Permanently delete", style: "destructive", onPress: performAccountDeletion },
            ]),
        },
      ],
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Settings</Text>
      </View>

      <View style={s.section}>
        {email ? (
          <Row icon="person-circle-outline" label={email} sub="Signed in — history syncs across devices" onPress={signOut} />
        ) : (
          <Row icon="log-in-outline" label="Sign in" sub="Save and sync your scan history" onPress={() => navigation.navigate("Auth")} />
        )}
        {email && <Row icon="log-out-outline" label="Sign out" onPress={signOut} />}
        {email && (
          <Row
            icon="trash-bin-outline"
            label={deleting ? "Deleting account…" : "Delete account"}
            sub="Permanently remove your account and synced history"
            onPress={deleting ? undefined : deleteAccountFlow}
            destructive
          />
        )}
      </View>

      <View style={s.section}>
        <Row icon="information-circle-outline" label="Data sources" sub="NIH, PubMed, openFDA & more" />
        <Row icon="trash-outline" label="Clear scan history" onPress={clearHistory} destructive />
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
