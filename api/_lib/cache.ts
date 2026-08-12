import { createClient } from "@supabase/supabase-js";
import type { TrustReport } from "../../src/types";

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
// A report generated while a source was degraded gets a much shorter TTL, so
// an openFDA/PubMed outage isn't frozen into the shared cache and served to
// everyone who scans that product for a week — see api/report.ts's
// meta.sources for what counts as degraded.
export const DEGRADED_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// The cache is strictly an optimization: every function here swallows its own
// failures and reports a miss, so a broken or unreachable database degrades to
// "always regenerate" rather than breaking a scan. That silence is also how a
// paused Supabase project once went unnoticed for weeks — reads returned null
// and writes did nothing, with no symptom anywhere. So failures are swallowed
// but never unlogged: anything unexpected is written to the function logs,
// while ordinary misses and expiries stay quiet.
function log(level: "warn" | "error", message: string, detail?: unknown) {
  const line = `[cache] ${message}`;
  if (detail === undefined) console[level](line);
  else console[level](line, detail);
}

// Vercel keeps a warm function instance across invocations, so this only
// suppresses the repeat within one instance — enough to stop a misconfigured
// deployment from writing a line on every single request, while still
// surfacing it in the logs of each new instance.
let warnedUnconfigured = false;

// Service-role client, server-only — bypasses RLS, so report_cache (which has
// zero policies defined) is reachable only from here. Returns null if Supabase
// isn't configured, so the pipeline still works end-to-end during local
// development before Supabase is wired up.
function getAdminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      const missing = [!url && "SUPABASE_URL", !key && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean).join(", ");
      log("warn", `disabled — ${missing} not set. Every report will be regenerated from scratch.`);
    }
    return null;
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

// Distinguishes "the database told us no such row" from "we could not reach the
// database at all". The first is routine; the second means the cache is down
// and someone should know.
function describeFailure(error: { message?: string; code?: string } | null, thrown?: unknown): string {
  const message = error?.message ?? (thrown instanceof Error ? thrown.message : String(thrown));
  const code = error?.code ? ` (code ${error.code})` : "";
  const unreachable = /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|521|522|523/i.test(message);
  const hint = unreachable
    ? " — Supabase looks unreachable; check whether the project is paused at supabase.com/dashboard"
    : "";
  return `${message}${code}${hint}`;
}

// Reports below this version were scored by the model with no deterministic
// basis (see src/utils/score.ts) — treating them as a miss is what clears
// every invented score out of the shared cache on deploy, without a migration.
const MIN_REPORT_VERSION = 2;

export async function getCachedReport(productKey: string): Promise<TrustReport | null> {
  const client = getAdminClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from("report_cache")
      .select("report, expires_at, report_version")
      .eq("product_key", productKey)
      .maybeSingle();

    if (error) {
      log("error", `read failed for ${productKey} — regenerating instead: ${describeFailure(error)}`);
      return null;
    }
    if (!data) return null; // ordinary miss
    if (new Date(data.expires_at).getTime() < Date.now()) return null; // ordinary expiry
    if ((data.report_version ?? 0) < MIN_REPORT_VERSION) return null; // stale scoring model — regenerate
    return data.report as TrustReport;
  } catch (e) {
    // A network-layer throw would otherwise escape into the request handler,
    // where several call sites sit outside a try block.
    log("error", `read threw for ${productKey} — regenerating instead: ${describeFailure(null, e)}`);
    return null;
  }
}

export async function setCachedReport(productKey: string, report: TrustReport, ttlMs: number = CACHE_TTL_MS): Promise<void> {
  const client = getAdminClient();
  if (!client) return;

  try {
    const { error } = await client.from("report_cache").upsert(
      {
        product_key: productKey,
        upc: report.product.upc ?? null,
        dsld_id: report.product.dsldId ?? null,
        brand: report.product.brand,
        product_name: report.product.name,
        report,
        report_version: report.reportVersion,
        model: report.meta.model,
        expires_at: new Date(Date.now() + ttlMs).toISOString(),
      },
      { onConflict: "product_key" },
    );

    if (error) {
      log("error", `write failed for ${productKey} — the report was still returned: ${describeFailure(error)}`);
    }
  } catch (e) {
    // Never let a cache write fail the request: the caller has already built a
    // valid report, and in api/report.ts this call sits inside the try block
    // that turns a throw into a 502.
    log("error", `write threw for ${productKey} — the report was still returned: ${describeFailure(null, e)}`);
  }
}
