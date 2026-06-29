/**
 * Dev-time correctness guard (ARCHITECTURE §7.1). Run with `bun run check:roundtrip`.
 *
 * Replaces formal tests for the MVP. It asserts:
 *   1. Round-trip: export(import(x)) is deep-equal to x for every valid fixture.
 *   2. Ajv passes on the valid fixtures.
 *   3. Ajv fails (with useful errors) on the broken fixture.
 * Exits non-zero on any unexpected result.
 */
import {
  buildValidators,
  exportSurface,
  getCatalog,
  importSurface,
  validate,
  type A2UIExport,
} from "../src/index";

// Bun provides `process`; schema stays dependency-free (no @types/node).
declare const process: { exit(code?: number): never };

import basic from "./fixtures/01-basic.json";
import composite from "./fixtures/02-composite.json";
import bound from "./fixtures/03-bound.json";
import slots from "./fixtures/04-slots.json";
import broken from "./fixtures/99-broken.json";

const validFixtures: Array<{ name: string; data: A2UIExport }> = [
  { name: "01-basic", data: basic as A2UIExport },
  { name: "02-composite", data: composite as A2UIExport },
  { name: "03-bound", data: bound as A2UIExport },
  { name: "04-slots", data: slots as A2UIExport },
];

/** Canonical JSON (recursively key-sorted) for order-insensitive deep compare. */
function canonical(value: unknown): string {
  const seen = new WeakSet();
  const sort = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v as object)) return "[circular]";
    seen.add(v as object);
    if (Array.isArray(v)) return v.map(sort);
    const obj = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) out[k] = sort(obj[k]);
    return out;
  };
  return JSON.stringify(sort(value), null, 2);
}

function firstDiff(a: string, b: string): string {
  const al = a.split("\n");
  const bl = b.split("\n");
  for (let i = 0; i < Math.max(al.length, bl.length); i++) {
    if (al[i] !== bl[i]) {
      return `  line ${i + 1}:\n    expected: ${al[i] ?? "<eof>"}\n    actual:   ${bl[i] ?? "<eof>"}`;
    }
  }
  return "  (whole-document diff)";
}

let failures = 0;
const catalog = getCatalog();
const validators = buildValidators();

console.log(`\n● Catalog: ${catalog.catalogId}`);
console.log(`  components: ${catalog.order.length}, validators: ${Object.keys(validators.byName).length}`);
if (catalog.warnings.length) {
  console.log("  warnings:");
  for (const w of catalog.warnings) console.log(`    - ${w}`);
}

console.log("\n● Round-trip: export(import(x)) === x");
for (const { name, data } of validFixtures) {
  const out = exportSurface(importSurface(data), catalog.catalogId);
  const expected = canonical(data);
  const actual = canonical(out);
  if (expected === actual) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.log(`  ✗ ${name} — round-trip diff:`);
    console.log(firstDiff(expected, actual));
  }
}

console.log("\n● Validation: valid fixtures pass");
for (const { name, data } of validFixtures) {
  const res = validate(data, validators);
  if (res.ok) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.log(`  ✗ ${name} unexpectedly failed:`);
    for (const e of res.errors) console.log(`      ${e.component}#${e.componentId}: ${e.message}`);
  }
}

console.log("\n● Validation: broken fixture fails with useful errors");
{
  const res = validate(broken as A2UIExport, validators);
  if (!res.ok && res.errors.length > 0) {
    console.log("  ✓ 99-broken rejected:");
    for (const e of res.errors) console.log(`      ${e.component}#${e.componentId}: ${e.message}`);
  } else {
    failures++;
    console.log("  ✗ 99-broken was NOT rejected (expected a validation error)");
  }
}

if (failures > 0) {
  console.error(`\n✗ roundtrip-guard: ${failures} check(s) failed\n`);
  process.exit(1);
}
console.log("\n✓ roundtrip-guard: all checks passed\n");
