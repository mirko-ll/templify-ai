/**
 * Sanity check for the product grouping slug logic.
 * Run: npx tsx scripts/check-product-grouping.ts
 */
import { productGroupKey, extractProductGroupSlug } from "../src/lib/product-grouping";

const cases: Array<{ title: string; expectKey: string }> = [
  {
    title: "Vodootporni grijaći prsluk | FLAMEVEST 1+1 GRATIS",
    expectKey: "FLAMEVEST 1+1",
  },
  {
    title: "Водоустойчива загряваща жилетка без ръкави | FLAMEVEST 1+1 БЕЗПЛАТНО",
    expectKey: "FLAMEVEST 1+1",
  },
  {
    title: "Wasserdichte Heizweste | FLAMEVEST 1+1 KOSTENLOS",
    expectKey: "FLAMEVEST 1+1",
  },
  {
    title: "Some product | AQUASHINE PRO",
    expectKey: "AQUASHINE PRO",
  },
  {
    title: "No pipe product name",
    expectKey: "NO PIPE PRODUCT NAME",
  },
];

let failures = 0;
for (const c of cases) {
  const key = productGroupKey(c.title);
  const slug = extractProductGroupSlug(c.title);
  const ok = key === c.expectKey;
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  slug="${slug}"  key="${key}"  expected="${c.expectKey}"`
  );
}

// FLAMEVEST variants across countries must collapse to ONE key.
const keys = new Set([
  productGroupKey("x | FLAMEVEST 1+1 GRATIS"),
  productGroupKey("y | FLAMEVEST 1+1 БЕЗПЛАТНО"),
  productGroupKey("z | FLAMEVEST 1+1"),
]);
const grouped = keys.size === 1;
if (!grouped) failures++;
console.log(`${grouped ? "PASS" : "FAIL"}  cross-country collapse → ${keys.size} key(s)`);

console.log(failures === 0 ? "\nAll grouping checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
