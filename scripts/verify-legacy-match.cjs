/* Simulate matching an OLD (pre-fix) Campaign overview against the catalog.
 * Usage: node scripts/verify-legacy-match.cjs "C:/path/to/report.xlsx" */
require("dotenv").config();
const fs = require("fs");
const XLSX = require("xlsx");
const { PrismaClient } = require("@prisma/client");
const { PrismaMariaDb } = require("@prisma/adapter-mariadb");

const file = process.argv[2] || "C:/Users/User/Downloads/Campaign overview (4).xlsx";

function toUtmSlug(v) {
  return (v || "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/\./g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
function normalizeGroupKey(s) {
  return (s || "").replace(/\s+/g, " ").trim().toUpperCase();
}

function parseNames(path) {
  const wb = XLSX.read(fs.readFileSync(path), { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
  const hi = grid.findIndex(
    (r) =>
      r.map((c) => String(c ?? "").toLowerCase()).some((t) => t.includes("campaign")) &&
      r.map((c) => String(c ?? "").toLowerCase()).some((t) => t.includes("quantity") || t.includes("revenue"))
  );
  const col = grid[hi].findIndex((c) => String(c ?? "").toLowerCase().includes("campaign"));
  const set = new Set();
  for (const r of grid.slice(hi + 1)) {
    const raw = String(r[col] ?? "").trim();
    if (!raw || raw.toUpperCase() === "ALL") continue;
    set.add(raw.toLowerCase());
  }
  return [...set];
}

async function main() {
  const names = parseNames(file);
  const adapter = new PrismaMariaDb(process.env.DATABASE_URL);
  const prisma = new PrismaClient({ adapter });

  const products = await prisma.product.findMany({
    where: { groupKey: { not: null } },
    select: { groupKey: true, normalizedTitle: true, title: true },
  });

  const byUtm = new Map();
  const byKey = new Map();
  const byNormTitle = new Map();
  const byTitle = new Map();
  for (const p of products) {
    const gk = p.groupKey;
    const u = toUtmSlug(gk);
    if (u && !byUtm.has(u)) byUtm.set(u, gk);
    byKey.set(normalizeGroupKey(gk), gk);
    const nt = toUtmSlug(p.normalizedTitle || "");
    if (nt && !byNormTitle.has(nt)) byNormTitle.set(nt, gk);
    const t = toUtmSlug(p.title || "");
    if (t && !byTitle.has(t)) byTitle.set(t, gk);
  }

  // Known offer-code slugs (from groupKeys), longest first for greedy matching.
  const codeSlugs = [...byUtm.keys()].filter((s) => s.length >= 4).sort((a, b) => b.length - a.length);
  const codeSet = new Set(byUtm.keys());
  function embeddedCode(name) {
    const u = toUtmSlug(name);
    const tokens = u.split("-").filter(Boolean);
    // 1) any token that is itself a known code (prefer the longest such token)
    const tokHit = tokens
      .filter((t) => t.length >= 4 && codeSet.has(t))
      .sort((a, b) => b.length - a.length)[0];
    if (tokHit) return byUtm.get(tokHit);
    // 2) any known code appearing as a bounded substring of the slug
    for (const code of codeSlugs) {
      if (new RegExp(`(?:^|-)${code}(?:-|$)`).test(u)) return byUtm.get(code);
    }
    return null;
  }

  let cur = 0, withTitle = 0, withCode = 0;
  const stillUnmatched = [];
  for (const name of names) {
    const u = toUtmSlug(name);
    const curHit = (u && byUtm.get(u)) || byKey.get(normalizeGroupKey(name));
    const titleHit = curHit || (u && (byNormTitle.get(u) || byTitle.get(u)));
    const codeHit = titleHit || embeddedCode(name);
    if (curHit) cur++;
    if (titleHit) withTitle++;
    if (codeHit) withCode++;
    else stillUnmatched.push(name);
  }

  console.log(`file: ${file}`);
  console.log(`distinct campaign names: ${names.length}`);
  console.log(`matched — CURRENT (code/groupKey):        ${cur}/${names.length}`);
  console.log(`matched — + title/normTitle:              ${withTitle}/${names.length}`);
  console.log(`matched — + embedded offer code:          ${withCode}/${names.length}`);
  console.log(`\nstill unmatched (${stillUnmatched.length}) — sample:`);
  console.log(stillUnmatched.slice(0, 40).map((s) => "  " + s).join("\n"));

  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
