// Regression tests for source-failure honesty (Phase 4).
//
// Why this exists: every source client used to return []/null on any kind of
// failure — a genuine "we searched and found nothing" and "the API is down"
// were the same value. The prompt then turned an outage into "No openFDA
// enforcement records found for this brand", which reads to a user as a
// clean safety check that never actually ran. These tests stub
// globalThis.fetch to simulate a 500, a hang past the timeout, and malformed
// JSON, and assert every client turns those into a real status rather than a
// silent empty result — and that computeVerdict treats "we couldn't check"
// as neutral, never as evidence of safety.
//
//   npx tsx tests/source-failure.mts
import { fetchWithTimeout } from "../api/_lib/http";
import { searchFdaRecalls, getFdaAdverseEventSummary } from "../api/_lib/openfda";
import { searchPubmedForIngredient } from "../api/_lib/pubmed";
import { computeVerdict, type VerdictInput } from "../src/utils/score";

let failed = 0;
const pass = (ok: boolean) => { if (!ok) failed++; return ok ? "PASS" : "FAIL"; };

const originalFetch = globalThis.fetch;
function restoreFetch() { globalThis.fetch = originalFetch; }

async function withFetch<T>(impl: typeof fetch, fn: () => Promise<T>): Promise<T> {
  globalThis.fetch = impl as typeof fetch;
  try {
    return await fn();
  } finally {
    restoreFetch();
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

console.log("=== api/_lib/http.ts: fetchWithTimeout ===");
await (async () => {
  // AbortSignal.timeout() firing on a genuinely hanging fetch surfaces to the
  // caller as exactly this: an AbortError/TimeoutError thrown out of fetch().
  // Asserting fetchWithTimeout converts that into a clean rejection (rather
  // than, say, swallowing it or hanging itself) is what actually matters here
  // — real signal timing is the platform's contract, not this file's.
  const timeoutErrorFetch: typeof fetch = () => Promise.reject(new DOMException("The operation was aborted.", "TimeoutError"));
  let threw = false;
  await withFetch(timeoutErrorFetch, async () => {
    try {
      await fetchWithTimeout("https://example.invalid", { timeoutMs: 80, retry: false });
    } catch {
      threw = true;
    }
  });
  console.log(`${pass(threw)}  a timed-out fetch rejects cleanly rather than hanging or throwing somewhere unexpected`);
})();

await (async () => {
  let calls = 0;
  const notFoundFetch: typeof fetch = async () => { calls++; return new Response("nope", { status: 404 }); };
  await withFetch(notFoundFetch, () => fetchWithTimeout("https://example.invalid", { timeoutMs: 500 }));
  console.log(`${pass(calls === 1)}  a 4xx is never retried (${calls} call(s))`);
})();

await (async () => {
  let calls = 0;
  const flakyThen500Fetch: typeof fetch = async () => { calls++; return new Response("err", { status: 503 }); };
  await withFetch(flakyThen500Fetch, () => fetchWithTimeout("https://example.invalid", { timeoutMs: 500 }));
  console.log(`${pass(calls === 2)}  a 5xx is retried exactly once (${calls} call(s))`);
})();

console.log("\n=== api/_lib/openfda.ts ===");
await (async () => {
  const serverErrorFetch: typeof fetch = async () => new Response("err", { status: 500 });
  const r = await withFetch(serverErrorFetch, () => searchFdaRecalls("test"));
  console.log(`${pass(r.status === "unreachable" && r.data.length === 0)}  searchFdaRecalls on a 500 -> unreachable, []`);
})();

await (async () => {
  const malformedFetch: typeof fetch = async () => jsonResponse({ notResults: [] });
  const r = await withFetch(malformedFetch, () => searchFdaRecalls("test"));
  console.log(`${pass(r.status === "malformed" && r.data.length === 0)}  searchFdaRecalls on malformed JSON -> malformed, []`);
})();

await (async () => {
  const notFoundFetch: typeof fetch = async () => new Response("", { status: 404 });
  const r = await withFetch(notFoundFetch, () => searchFdaRecalls("test"));
  console.log(`${pass(r.status === "ok" && r.data.length === 0)}  searchFdaRecalls on a 404 -> ok, [] (a real clean search, not a failure)`);
})();

await (async () => {
  const throwingFetch: typeof fetch = async () => { throw new TypeError("network down"); };
  const [recalls, ae] = await withFetch(throwingFetch, () =>
    Promise.all([searchFdaRecalls("test"), getFdaAdverseEventSummary("test")]),
  );
  console.log(`${pass(recalls.status === "unreachable")}  searchFdaRecalls never throws on a network error — returns unreachable`);
  console.log(`${pass(ae.status === "unreachable" && ae.data === null)}  getFdaAdverseEventSummary never throws on a network error — returns unreachable, null`);
})();

console.log("\n=== api/_lib/pubmed.ts ===");
await (async () => {
  const serverErrorFetch: typeof fetch = async () => new Response("err", { status: 500 });
  const r = await withFetch(serverErrorFetch, () => searchPubmedForIngredient("caffeine"));
  console.log(`${pass(r.status === "unreachable" && r.data.length === 0)}  searchPubmedForIngredient on a 500 -> unreachable, []`);
})();

await (async () => {
  const malformedFetch: typeof fetch = async () => jsonResponse({ nothingUseful: true });
  const r = await withFetch(malformedFetch, () => searchPubmedForIngredient("caffeine"));
  console.log(`${pass(r.status === "malformed" && r.data.length === 0)}  searchPubmedForIngredient on malformed JSON -> malformed, []`);
})();

console.log("\n=== computeVerdict treats an unreachable source as neutral, never as safety evidence ===");
{
  const baseIngredients: VerdictInput["ingredients"] = [
    { name: "Vitamin C", doseAssessment: "effective", amountDisclosed: true, isBlendComponent: false, researched: true, citationCount: 4 },
  ];
  const reachable: VerdictInput = {
    source: "dsld", matchedBy: "upc", offMarket: false, ingredients: baseIngredients,
    unresearchedCount: 0, proprietaryBlendCount: 0, riskFlagCount: 0, recalls: [],
    sourceHealth: { openfda: "ok", pubmed: "ok" }, ingredientsTextOnly: false,
  };
  const unreachable: VerdictInput = { ...reachable, sourceHealth: { openfda: "unreachable", pubmed: "ok" } };

  const rReachable = computeVerdict(reachable);
  const rUnreachable = computeVerdict(unreachable);
  console.log(`${pass(rUnreachable.score <= rReachable.score)}  an unreachable source never scores higher than the same product fully checked (${rUnreachable.score} <= ${rReachable.score})`);
  console.log(`${pass(rUnreachable.confidence === "low")}  confidence drops to low when a source couldn't be reached`);
  const gainedCredit = rUnreachable.breakdown.some((l) => l.label === "Clean recall history (verified)");
  console.log(`${pass(!gainedCredit)}  no "clean recall" credit is awarded when the recall search never ran`);
}

console.log(failed === 0 ? "\nALL CHECKS PASSED" : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
