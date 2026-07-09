import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { C, F } from "../theme";
import { supabase } from "../services/supabase";
import { syncLocalHistoryToSupabase } from "../services/history";

type Mode = "sign_in" | "sign_up";

export default function AuthScreen() {
  const navigation = useNavigation<any>();
  const [mode, setMode] = useState<Mode>("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function submit() {
    if (!email.trim() || !password) {
      setError("Enter an email and password.");
      return;
    }
    setLoading(true);
    setError(undefined);

    const { error: authError } =
      mode === "sign_in"
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password });

    setLoading(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    await syncLocalHistoryToSupabase().catch(() => {});
    navigation.goBack();
  }

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.closeBtn}>
            <Ionicons name="close" size={22} color={C.text} />
          </TouchableOpacity>
        </View>

        <View style={s.content}>
          <Ionicons name="shield-checkmark" size={40} color={C.primary} />
          <Text style={s.title}>{mode === "sign_in" ? "Sign in" : "Create your account"}</Text>
          <Text style={s.subtitle}>Save your scan history and sync it across devices</Text>

          <TextInput
            style={s.input}
            placeholder="Email"
            placeholderTextColor={C.muted}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={s.input}
            placeholder="Password"
            placeholderTextColor={C.muted}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          {error && <Text style={s.error}>{error}</Text>}

          <TouchableOpacity style={s.submitBtn} onPress={submit} disabled={loading} activeOpacity={0.85}>
            {loading ? <ActivityIndicator color="#fff" /> : (
              <Text style={s.submitLabel}>{mode === "sign_in" ? "Sign in" : "Create account"}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setMode(mode === "sign_in" ? "sign_up" : "sign_in")}>
            <Text style={s.switchMode}>
              {mode === "sign_in" ? "New here? Create an account" : "Already have an account? Sign in"}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 16, paddingTop: 8 },
  closeBtn: { padding: 6 },
  content: { flex: 1, alignItems: "center", paddingHorizontal: 28, paddingTop: 20, gap: 12 },
  title: { fontFamily: F.extrabold, fontSize: 22, color: C.text, marginTop: 8 },
  subtitle: { fontFamily: F.semibold, fontSize: 13, color: C.muted, textAlign: "center", marginBottom: 8 },
  input: {
    width: "100%",
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.fill,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: F.semibold,
    fontSize: 15,
    color: C.text,
  },
  error: { fontFamily: F.semibold, fontSize: 13, color: C.bad, textAlign: "center" },
  submitBtn: {
    width: "100%",
    backgroundColor: C.primary,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 4,
  },
  submitLabel: { fontFamily: F.extrabold, fontSize: 15, color: "#fff" },
  switchMode: { fontFamily: F.bold, fontSize: 13, color: C.secondary, marginTop: 8 },
});
