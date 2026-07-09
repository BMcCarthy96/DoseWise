import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Modal, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, F } from "../theme";

export default function ManualUpcModal({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (upc: string) => void;
}) {
  const [upc, setUpc] = useState("");

  function handleSubmit() {
    const trimmed = upc.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setUpc("");
  }

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={s.card}>
          <Text style={s.title}>Enter UPC</Text>
          <Text style={s.subtitle}>Type the barcode number printed under the bars</Text>
          <TextInput
            style={s.input}
            value={upc}
            onChangeText={setUpc}
            placeholder="e.g. 074312021008"
            placeholderTextColor={C.muted}
            keyboardType="number-pad"
            autoFocus
          />
          <TouchableOpacity style={s.submitBtn} onPress={handleSubmit} activeOpacity={0.85}>
            <Ionicons name="search" size={18} color="#fff" />
            <Text style={s.submitLabel}>Look Up</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(15,42,67,0.45)", alignItems: "center", justifyContent: "center" },
  card: {
    width: "84%",
    backgroundColor: C.card,
    borderRadius: 24,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 20,
  },
  title: { fontFamily: F.extrabold, fontSize: 20, color: C.text },
  subtitle: { fontFamily: F.semibold, fontSize: 13, color: C.muted, marginTop: 4, marginBottom: 18 },
  input: {
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.fill,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: F.bold,
    fontSize: 18,
    color: C.text,
    letterSpacing: 1,
  },
  submitBtn: {
    marginTop: 16,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.primary,
    borderRadius: 14,
    paddingVertical: 14,
  },
  submitLabel: { fontFamily: F.bold, fontSize: 15, color: "#fff" },
});
