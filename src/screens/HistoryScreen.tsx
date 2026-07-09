import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, FlatList, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { C, F, verdictColor } from "../theme";
import { getHistory } from "../services/history";
import type { ScanRecord } from "../types";

function timeAgo(ts: number): string {
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function HistoryScreen() {
  const navigation = useNavigation<any>();
  const [history, setHistory] = useState<ScanRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    getHistory()
      .then(setHistory)
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(load);

  function openRecord(item: ScanRecord) {
    if (/^\d+$/.test(item.productKey)) {
      navigation.navigate("Results", { upc: item.productKey });
    }
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>History</Text>
        <Text style={s.subtitle}>Your past scans</Text>
      </View>

      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={C.primary} />}
        contentContainerStyle={history.length === 0 ? { flex: 1 } : { paddingHorizontal: 20, paddingBottom: 24 }}
        ListEmptyComponent={
          !loading ? (
            <View style={s.empty}>
              <Ionicons name="time-outline" size={40} color={C.muted} />
              <Text style={s.emptyTitle}>No scans yet</Text>
              <Text style={s.emptyHint}>Scanned supplements will show up here</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={s.item} activeOpacity={0.7} onPress={() => openRecord(item)}>
            <View style={[s.verdictDot, { backgroundColor: verdictColor(item.verdict) }]} />
            <View style={{ flex: 1 }}>
              <Text style={s.itemName} numberOfLines={1}>{item.productName}</Text>
              <Text style={s.itemBrand} numberOfLines={1}>{item.brand} · {timeAgo(item.scannedAt)}</Text>
            </View>
            <Text style={[s.itemScore, { color: verdictColor(item.verdict) }]}>{item.score}</Text>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 8 },
  title: { fontFamily: F.extrabold, fontSize: 26, color: C.text },
  subtitle: { fontFamily: F.semibold, fontSize: 13, color: C.muted, marginTop: 4 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 40 },
  emptyTitle: { fontFamily: F.bold, fontSize: 16, color: C.text, marginTop: 8 },
  emptyHint: { fontFamily: F.semibold, fontSize: 13, color: C.muted, textAlign: "center" },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 10,
  },
  verdictDot: { width: 10, height: 10, borderRadius: 5 },
  itemName: { fontFamily: F.bold, fontSize: 14, color: C.text },
  itemBrand: { fontFamily: F.semibold, fontSize: 12, color: C.muted, marginTop: 2 },
  itemScore: { fontFamily: F.extrabold, fontSize: 18 },
});
