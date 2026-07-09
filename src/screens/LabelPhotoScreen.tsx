import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { useNavigation } from "@react-navigation/native";
import { C, F } from "../theme";

async function compressForUpload(uri: string): Promise<{ uri: string; base64: string }> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1024 } }],
    { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  return { uri: result.uri, base64: result.base64! };
}

async function compressOrFallback(
  uri: string,
  fallbackBase64: string | undefined,
): Promise<{ uri: string; base64: string }> {
  try {
    return await compressForUpload(uri);
  } catch (e) {
    if (Platform.OS === "web" && fallbackBase64) return { uri, base64: fallbackBase64 };
    throw e;
  }
}

export default function LabelPhotoScreen() {
  const navigation = useNavigation<any>();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);

  async function pickFromCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Camera access required", "Please grant camera permission in Settings.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1 });
    if (!result.canceled && result.assets[0]) {
      const compressed = await compressForUpload(result.assets[0].uri);
      setImageUri(compressed.uri);
      setImageBase64(compressed.base64);
    }
  }

  async function pickFromLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Photo access required", "Please grant photo library permission in Settings.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      base64: Platform.OS === "web",
    });
    if (!result.canceled && result.assets[0]) {
      const compressed = await compressOrFallback(result.assets[0].uri, result.assets[0].base64 ?? undefined);
      setImageUri(compressed.uri);
      setImageBase64(compressed.base64);
    }
  }

  function analyzeLabel() {
    if (!imageUri || !imageBase64) return;
    navigation.navigate("Results", { base64: imageBase64 });
    setImageUri(null);
    setImageBase64(null);
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={s.title}>Photo the label</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={s.preview}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={s.previewImage} resizeMode="cover" />
        ) : (
          <>
            <Ionicons name="image-outline" size={48} color="rgba(255,255,255,0.4)" />
            <Text style={s.previewLabel}>No photo selected</Text>
            <Text style={s.previewHint}>Use the buttons below to add one</Text>
          </>
        )}
      </View>

      <View style={s.actions}>
        <View style={s.pickerRow}>
          {Platform.OS !== "web" && (
            <TouchableOpacity style={s.pickerBtn} onPress={pickFromCamera} activeOpacity={0.85}>
              <Ionicons name="camera" size={20} color={C.primary} />
              <Text style={s.pickerLabel}>Camera</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={s.pickerBtn} onPress={pickFromLibrary} activeOpacity={0.85}>
            <Ionicons name="images" size={20} color={C.primary} />
            <Text style={s.pickerLabel}>{Platform.OS === "web" ? "Upload" : "Gallery"}</Text>
          </TouchableOpacity>
          {imageUri && (
            <TouchableOpacity
              style={s.pickerBtn}
              onPress={() => { setImageUri(null); setImageBase64(null); }}
              activeOpacity={0.85}
            >
              <Ionicons name="refresh-outline" size={20} color={C.muted} />
              <Text style={[s.pickerLabel, { color: C.muted }]}>Retake</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={[s.analyzeBtn, !imageUri && s.analyzeBtnDisabled]}
          onPress={analyzeLabel}
          disabled={!imageUri || !imageBase64}
          activeOpacity={0.85}
        >
          <Text style={[s.analyzeText, !imageUri && { color: C.muted }]}>
            {imageUri ? "Analyze Label" : "Select a photo to continue"}
          </Text>
        </TouchableOpacity>
      </View>
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
  title: { fontFamily: F.extrabold, fontSize: 18, color: C.text },
  preview: {
    flex: 1,
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 24,
    backgroundColor: C.text,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    overflow: "hidden",
  },
  previewImage: { width: "100%", height: "100%" },
  previewLabel: { fontFamily: F.bold, fontSize: 15, color: "#fff", marginTop: 6 },
  previewHint: { fontFamily: F.semibold, fontSize: 12, color: "rgba(255,255,255,0.5)" },
  actions: { padding: 20, gap: 10 },
  pickerRow: { flexDirection: "row", gap: 10 },
  pickerBtn: {
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
  pickerLabel: { fontFamily: F.bold, fontSize: 13, color: C.text },
  analyzeBtn: {
    backgroundColor: C.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
  },
  analyzeBtnDisabled: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  analyzeText: { fontFamily: F.extrabold, fontSize: 15, color: "#fff" },
});
