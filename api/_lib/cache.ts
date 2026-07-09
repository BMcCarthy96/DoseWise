import { createClient } from "@supabase/supabase-js";
import type { TrustReport } from "../../src/types";

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Service-role client, server-only — bypasses RLS, so report_cache (which has
// zero policies defined) is reachable only from here. Falls back to "no
// cache" if Supabase isn't configured yet, so the pipeline still works
// end-to-end during local development before Supabase is wired up.
function getAdminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function getCachedReport(productKey: string): Promise<TrustReport | null> {
  const client = getAdminClient();
  if (!client) return null;

  const { data, error } = await client
    .from("report_cache")
    .select("report, expires_at")
    .eq("product_key", productKey)
    .maybeSingle();

  if (error || !data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data.report as TrustReport;
}

export async function setCachedReport(productKey: string, report: TrustReport): Promise<void> {
  const client = getAdminClient();
  if (!client) return;

  await client.from("report_cache").upsert(
    {
      product_key: productKey,
      upc: report.product.upc ?? null,
      dsld_id: report.product.dsldId ?? null,
      brand: report.product.brand,
      product_name: report.product.name,
      report,
      report_version: report.reportVersion,
      model: report.meta.model,
      expires_at: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
    },
    { onConflict: "product_key" },
  );
}
