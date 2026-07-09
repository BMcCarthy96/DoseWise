import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import type { ScanRecord, TrustReport, Verdict } from "../types";

const HISTORY_KEY = "dosewise.scan_history.v1";
const MAX_LOCAL_HISTORY = 200;

export function recordFromReport(report: TrustReport, productKey: string): ScanRecord {
  return {
    id: `${productKey}-${Date.now()}`,
    productKey,
    scannedAt: Date.now(),
    brand: report.product.brand,
    productName: report.product.name,
    verdict: report.verdict.grade,
    score: report.verdict.score,
    report,
  };
}

export async function getLocalHistory(): Promise<ScanRecord[]> {
  const raw = await AsyncStorage.getItem(HISTORY_KEY);
  return raw ? (JSON.parse(raw) as ScanRecord[]) : [];
}

export async function addLocalScan(record: ScanRecord): Promise<void> {
  const history = await getLocalHistory();
  history.unshift(record);
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_LOCAL_HISTORY)));
}

export async function clearLocalHistory(): Promise<void> {
  await AsyncStorage.removeItem(HISTORY_KEY);
}

// Anonymous scans live in AsyncStorage; once signed in, history reads from
// (and new scans write to) the user's scan_history rows in Supabase instead.
export async function getHistory(): Promise<ScanRecord[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return getLocalHistory();

  const { data, error } = await supabase
    .from("scan_history")
    .select("id, scanned_at, product_key, brand, product_name, verdict, score")
    .order("scanned_at", { ascending: false })
    .limit(100);

  if (error || !data) return getLocalHistory();

  return data.map((row) => ({
    id: row.id,
    productKey: row.product_key,
    scannedAt: new Date(row.scanned_at).getTime(),
    brand: row.brand ?? "Unknown brand",
    productName: row.product_name ?? "Unknown product",
    verdict: (row.verdict ?? "caution") as Verdict,
    score: row.score ?? 0,
  }));
}

export async function recordScan(report: TrustReport, productKey: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    await addLocalScan(recordFromReport(report, productKey));
    return;
  }

  await supabase.from("scan_history").insert({
    user_id: session.user.id,
    product_key: productKey,
    brand: report.product.brand,
    product_name: report.product.name,
    verdict: report.verdict.grade,
    score: report.verdict.score,
  });
}

// Called after sign-in: uploads any anonymous local scans into the user's
// Supabase history, then clears them locally so they aren't duplicated.
export async function syncLocalHistoryToSupabase(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const local = await getLocalHistory();
  if (local.length === 0) return;

  const rows = local.map((r) => ({
    user_id: session.user.id,
    scanned_at: new Date(r.scannedAt).toISOString(),
    product_key: r.productKey,
    brand: r.brand,
    product_name: r.productName,
    verdict: r.verdict,
    score: r.score,
  }));

  const { error } = await supabase.from("scan_history").insert(rows);
  if (!error) await clearLocalHistory();
}
