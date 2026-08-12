// Regression tests for the DSLD name-match verification gates (Phase 1).
//
// Why this exists: findDsldIdByName used to take hits[0] from a full-text
// search with zero verification, so scanning a 1000 IU bottle could return a
// confident, fully-detailed report for the 5000 IU version of the same
// product. These gates are what stand between "found something that sounds
// similar" and "verified this is the same product" — a regression here means
// the app can show the wrong product's data again.
//
//   npx tsx tests/dsld-name-match.mts
//
// The live section needs network access and skips itself if DSLD is
// unreachable; the offline gate checks always run and assert.
import {
  brandGatePass,
  nameGatePass,
  strengthGatePass,
  passesIdentityGates,
  getDsldLabel,
} from "../api/_lib/dsld";

let failed = 0;
const pass = (ok: boolean) => { if (!ok) failed++; return ok ? "PASS" : "FAIL"; };

console.log("=== gate 1: brand ===");
{
  const ok1 = pass(brandGatePass("Nature's Way", "Nature's Way, Inc.") === true);
  console.log(`${ok1}  "Nature's Way" vs "Nature's Way, Inc." -> accept`);
  const ok2 = pass(brandGatePass("Nature's Way", "Nature Made") === false);
  console.log(`${ok2}  "Nature's Way" vs "Nature Made" -> reject`);
}

console.log("\n=== gate 2: name ===");
{
  const ok1 = pass(nameGatePass("Vitamin D3 5000 IU Softgels", "Vitamin D3 5000 IU Softgels, 250 Count") === true);
  console.log(`${ok1}  near-identical names (packaging suffix differs) -> accept`);
  const ok2 = pass(nameGatePass("Vitamin D3 5000 IU Softgels", "Fish Oil Omega-3 1000 mg") === false);
  console.log(`${ok2}  unrelated product names -> reject`);
}

console.log("\n=== gate 3: strength (the gate that fixes the bug) ===");
{
  const ok1 = pass(strengthGatePass("Vitamin D3 1000 IU", "Vitamin D3 5000 IU") === false);
  console.log(`${ok1}  1000 IU vs 5000 IU -> reject (different strength)`);
  const ok2 = pass(strengthGatePass("Vitamin D3 1000 IU", "Vitamin D3") === false);
  console.log(`${ok2}  a name with a strength vs one without -> reject`);
  const ok3 = pass(strengthGatePass("Vitamin D3 1000 IU", "Vitamin D3 1000 IU") === true);
  console.log(`${ok3}  identical strength -> accept`);
  const ok4 = pass(strengthGatePass("Multivitamin", "Multivitamin Complete") === true);
  console.log(`${ok4}  neither side states a strength -> accept (nothing to contradict)`);
}

console.log("\n=== combined gates ===");
{
  const vision = { brand: "Nature's Way", name: "Vitamin D3 5000 IU" };
  const wrongStrength = { brandName: "Nature's Way, Inc.", fullName: "Vitamin D3 1000 IU Softgels" };
  const rightMatch = { brandName: "Nature's Way, Inc.", fullName: "Vitamin D3 5000 IU Softgels" };
  const ok1 = pass(passesIdentityGates(vision, wrongStrength) === false);
  console.log(`${ok1}  same brand/product family, different strength -> reject`);
  const ok2 = pass(passesIdentityGates(vision, rightMatch) === true);
  console.log(`${ok2}  same brand/product family, matching strength -> accept`);
}

console.log("\n=== live: real DSLD labels match themselves ===");
try {
  for (const id of [17131, 180062]) {
    const label = await getDsldLabel(id);
    if (!label) { console.log(`  SKIP  label ${id} not found`); continue; }
    const selfMatch = passesIdentityGates({ brand: label.brand, name: label.name }, { brandName: label.brand, fullName: label.name });
    console.log(`  ${pass(selfMatch)}  [${id}] ${label.brand} — ${label.name} matches itself`);
  }
} catch (e) {
  console.log(`  SKIPPED — DSLD unreachable (${e instanceof Error ? e.message : String(e)})`);
}

console.log(failed === 0 ? "\nALL CHECKS PASSED" : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
