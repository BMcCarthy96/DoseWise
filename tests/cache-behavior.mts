// Regression tests for api/_lib/cache.ts.
//
// Why this exists: the report cache is deliberately best-effort — a read or
// write failure must degrade to "regenerate from scratch" rather than break a
// scan. It used to do that *silently*, which is how a paused Supabase project
// went unnoticed for weeks: reads returned null, writes did nothing, and no log
// line appeared anywhere. These tests pin down both halves of the contract —
// failures never throw into the caller, and failures are never unlogged, while
// ordinary misses and expiries stay quiet so the signal isn't buried.
//
//   npm run test:cache
//
// The unconfigured and unreachable sections need nothing. The live sections
// need a .env with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, and they write
// one throwaway row to the real report_cache table, then delete it.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { TrustReport } from "../src/types";

function loadEnvFile(): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(".env", "utf8").split("\n")
        .map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
        .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")]; }),
    );
  } catch {
    return {};
  }
}
const real = loadEnvFile();
const canReachSupabase = Boolean(real.SUPABASE_URL && real.SUPABASE_SERVICE_ROLE_KEY);

// Import only after env is under our control — getAdminClient reads it per call.
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const { getCachedReport, setCachedReport } = await import("../api/_lib/cache");

const origWarn = console.warn;
const origError = console.error;
let captured: string[] = [];
const hook = () => {
  console.warn = (...a: unknown[]) => { captured.push("WARN  " + a.join(" ")); };
  console.error = (...a: unknown[]) => { captured.push("ERROR " + a.join(" ")); };
};
const unhook = () => { console.warn = origWarn; console.error = origError; };
const drain = () => { const c = captured; captured = []; return c; };

let failed = 0;
function check(name: string, ok: boolean, lines: string[]) {
  if (!ok) failed++;
  unhook();
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  for (const l of lines) console.log(`        ${l}`);
  hook();
}
function skip(name: string, why: string) {
  unhook();
  console.log(`SKIP  ${name} — ${why}`);
  hook();
}

const TEST_KEY = "__cache_behavior_test__" + Date.now();
const report = {
  reportVersion: 2,
  generatedAt: new Date().toISOString(),
  product: { source: "dsld", dsldId: 1, upc: "000000000000", brand: "Test Brand", name: "Cache Behavior Test" },
  verdict: { grade: "good", score: 1, confidence: "low", headline: "h", summary: "s" },
  breakdown: { ingredients: [], proprietaryBlends: [], otherIngredients: [] },
  labelTrust: { flags: [] },
  warnings: { recalls: [], adverseEventSummary: null, researchConsensus: "" },
  reviews: null,
  meta: { model: "cache-behavior-test", cached: false, searchesUsed: 0 },
} as unknown as TrustReport;

hook();

// 1. Unconfigured: warn once, not on every request.
await getCachedReport("k1");
await getCachedReport("k2");
await setCachedReport("k3", report);
let out = drain();
check("unconfigured warns exactly once across 3 calls",
  out.length === 1 && out[0].includes("not set"), out);

// 2. Unreachable host: log an actionable error, return a miss, never throw.
process.env.SUPABASE_URL = "https://definitely-not-a-real-project-xyz.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = real.SUPABASE_SERVICE_ROLE_KEY ?? "placeholder-key";
const missed = await getCachedReport(TEST_KEY);
out = drain();
check("unreachable read: returns null, logs error naming the dashboard",
  missed === null && out.length === 1 && out[0].startsWith("ERROR") && out[0].includes("paused"), out);

await setCachedReport(TEST_KEY, report);
out = drain();
check("unreachable write: does not throw, logs error, report still returned",
  out.length === 1 && out[0].startsWith("ERROR") && out[0].includes("still returned"), out);

// 3. Live project: the ordinary paths must stay quiet.
if (!canReachSupabase) {
  skip("live cache round-trip", "no SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env");
  unhook();
  console.log(failed === 0 ? "\nALL RUN CHECKS PASSED (live section skipped)" : `\n${failed} CHECK(S) FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

process.env.SUPABASE_URL = real.SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = real.SUPABASE_SERVICE_ROLE_KEY;

const absent = await getCachedReport("no-such-key-" + Date.now());
out = drain();
check("real miss: returns null, logs nothing", absent === null && out.length === 0, out);

await setCachedReport(TEST_KEY, report);
out = drain();
check("real write: succeeds, logs nothing", out.length === 0, out);

const hit = await getCachedReport(TEST_KEY);
out = drain();
check("real hit: returns the stored report, logs nothing",
  hit?.product?.name === "Cache Behavior Test" && out.length === 0, out);

const db = createClient(real.SUPABASE_URL, real.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
await db.from("report_cache")
  .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
  .eq("product_key", TEST_KEY);
const stale = await getCachedReport(TEST_KEY);
out = drain();
check("expired row: returns null, logs nothing", stale === null && out.length === 0, out);

unhook();

// Always clean up the throwaway row, and prove it's gone.
const { error: delErr } = await db.from("report_cache").delete().eq("product_key", TEST_KEY);
if (delErr) { failed++; console.log(`\nFAIL  cleanup: ${delErr.message}`); }
const { data: leftovers } = await db.from("report_cache")
  .select("product_key").like("product_key", "__cache_behavior_test__%");
const leftoverCount = leftovers?.length ?? 0;
if (leftoverCount > 0) failed++;
console.log(`\ncleanup: test rows remaining = ${leftoverCount}`);

console.log(failed === 0 ? "\nALL CHECKS PASSED" : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
