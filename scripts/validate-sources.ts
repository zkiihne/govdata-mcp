/**
 * Validate every sources/<id>/source.json against the schema.
 * Exit non-zero on any failure so it can gate a build / CI step.
 *
 *   npx tsx scripts/validate-sources.ts
 */
import { loadSources } from "../src/catalog/loader.js";

const { specs, errors } = loadSources();

for (const s of specs) {
  console.log(`  ok  ${s.id.padEnd(20)} ${s.tier}/${s.status}`);
}

if (errors.length > 0) {
  console.error(`\n✗ ${errors.length} invalid source(s):`);
  for (const e of errors) {
    console.error(`  FAIL ${e.sourceDir}: ${e.error}`);
  }
  process.exit(1);
}

console.log(`\n✓ ${specs.length} source(s) valid.`);
