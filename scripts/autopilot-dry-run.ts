/**
 * Autopilot dry run — READ ONLY. Runs the real picking engine for one client
 * against the live Templaito DB and oadmin's competitor intel, prints the picks
 * and writes nothing anywhere.
 *
 *   TEMPLAITO_DB_URL=mysql://… OADMIN_DB_URL=mysql://… \
 *   npx tsx scripts/autopilot-dry-run.ts --client <id> --from 2026-11-09 --days 7 \
 *     --own Superzebra --rivals Soldius,Vigo,Vigoexpress,Frilla [--llm] [--json out.json]
 *
 * Both connections run inside START TRANSACTION READ ONLY and refuse anything
 * but SELECT. Intel is read with the same filter as oadmin's
 * /integrations/templaito/products export. --llm needs OPENAI_API_KEY.
 */
import { writeFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { defaultSettings, normalizeDefaults } from "../src/lib/autopilot/config";
import { freeSlots, runEngine, slotRequests } from "../src/lib/autopilot/engine";
import { intelMatchStats, matchIntel, type IntelExportRow } from "../src/lib/autopilot/intel";
import { loadEngineData, type SqlQuery } from "../src/lib/autopilot/loader";
import { learnPriceRatio } from "../src/lib/autopilot/pricing";
import { addDays, localDateOf } from "../src/lib/autopilot/time";
import { BUCKET_LABELS, BUCKETS, type EngineInput } from "../src/lib/autopilot/types";

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

async function readOnly(url: string): Promise<{ query: SqlQuery; close: () => Promise<void> }> {
  const conn = await mysql.createConnection({ uri: url, timezone: "Z" });
  await conn.query("START TRANSACTION READ ONLY");
  return {
    query: async (sql, params = []) => {
      if (!/^\s*select\b/i.test(sql)) throw new Error(`Refusing non-SELECT: ${sql.slice(0, 40)}`);
      const [rows] = await conn.query(sql, params);
      return rows as any[];
    },
    close: async () => {
      await conn.query("ROLLBACK");
      await conn.end();
    },
  };
}

async function main() {
  const templaitoUrl = process.env.TEMPLAITO_DB_URL;
  const oadminUrl = process.env.OADMIN_DB_URL;
  if (!templaitoUrl || !oadminUrl) throw new Error("Set TEMPLAITO_DB_URL and OADMIN_DB_URL");
  const clientId = arg("client", "cmpxujbyb0004xj2qzsf7pguw")!;
  const now = new Date();
  const own = arg("own", "Superzebra")!;
  const rivals = (arg("rivals", "Soldius,Vigo,Vigoexpress,Frilla") ?? "").split(",").filter(Boolean);
  const days = Number(arg("days", "7"));

  const T = await readOnly(templaitoUrl);
  const O = await readOnly(oadminUrl);
  try {
    const [plan] = await T.query(
      "SELECT strategy FROM CampaignPlan WHERE clientId = ? ORDER BY year DESC, month DESC LIMIT 1",
      [clientId]
    );
    const strategy = typeof plan?.strategy === "string" ? JSON.parse(plan.strategy) : plan?.strategy;

    const brands = await O.query(
      `SELECT id, name FROM competitorBrand WHERE source = 'tracked' AND name IN (${[own, ...rivals].map(() => "?").join(",")})`,
      [own, ...rivals]
    );
    const ownBrand = brands.find((b) => b.name === own);
    const mapping = {
      ownBrandId: ownBrand?.id ?? null,
      competitorBrandIds: brands.filter((b) => b.name !== own).map((b) => b.id),
    };
    const settings = defaultSettings(now, normalizeDefaults(strategy?.defaults), mapping);

    const brandIds = brands.map((b) => b.id);
    const rows = await O.query(
      `SELECT p.brandId, b.name AS brandName, p.productKey, p.token, p.keys, p.name, p.englishName, p.imageUrl,
              p.activeAds, p.totalAds, p.newAds7d, p.newAds30d, p.reach, p.reach7d, p.score,
              p.listedSince, p.listedSinceSource, p.firstAdAt, p.lastAdAt
         FROM competitorProduct p JOIN competitorBrand b ON b.id = p.brandId
        WHERE p.brandId IN (${brandIds.map(() => "?").join(",")})
          AND (p.activeAds > 0 OR p.listedSince >= NOW() - INTERVAL 60 DAY OR p.lastAdAt >= NOW() - INTERVAL 30 DAY)`,
      brandIds
    );
    const exportRows: IntelExportRow[] = rows.map((r) => {
      const keys = typeof r.keys === "string" ? JSON.parse(r.keys) : r.keys;
      return {
        ...r,
        score: Number(r.score) || 0,
        keys: Array.isArray(keys) ? keys.filter((k: unknown) => typeof k === "string" && /^(tok|slug|gtin):/.test(k)) : [],
      };
    });

    const data = await loadEngineData(T.query, clientId, now);
    const input: EngineInput = { now, settings, ...data, intel: matchIntel(exportRows, data.groups, mapping) };

    const today = localDateOf(now, settings.timezone);
    const from = arg("from", addDays(today, settings.rules.lockDaysBefore + 1))!;
    const slots = freeSlots(slotRequests(settings, from, days), input.sends);
    const { pools, picks, llmUsed } = await runEngine(input, slots, process.argv.includes("--llm") ? {} : { openai: null });

    console.log(`\nClient ${clientId} · now ${now.toISOString()} · rotation week 1 = ${settings.rotationStart}`);
    console.log(`Countries (${input.eligibleCountries.length}): ${input.eligibleCountries.join(" ")}`);
    console.log(`Groups ${input.groups.length} · sends ${input.sends.length} · report rows ${input.reports.length} · price ratio ${learnPriceRatio(input.priceSamples)}`);
    console.log("Intel match (products with live ads):");
    for (const s of intelMatchStats(input.intel)) console.log(`  ${s.brandName.padEnd(12)} ${s.matched}/${s.active}`);
    console.log(`Pools: ${BUCKETS.map((b) => `${BUCKET_LABELS[b]} ${pools[b].length}`).join(" · ")} · graduated ${[...pools.graduated].join(", ") || "-"}`);
    console.log(`LLM used: ${llmUsed}\n`);

    for (const pick of picks) {
      const time = pick.slot.sendAt.toLocaleTimeString("en-GB", { timeZone: settings.timezone, hour: "2-digit", minute: "2-digit" });
      const bucket = pick.bucket === pick.plannedBucket ? BUCKET_LABELS[pick.bucket] : `${BUCKET_LABELS[pick.plannedBucket]} → ${BUCKET_LABELS[pick.bucket]}`;
      const c = pick.choice;
      console.log(`${pick.slot.date} ${time}  [${bucket}]  ${c ? c.groupKey : "— EMPTY —"}${c ? `  €${pick.price ?? "?"}${pick.priceSuggested ? " (suggested)" : ""}  ${c.countryCodes.length} countries  ${c.category ?? ""}` : ""}`);
      if (c) console.log(`    ${c.title.slice(0, 90)}`);
      if (pick.reason) console.log(`    Why: ${pick.reason}`);
      for (const e of pick.events) console.log(`    ! ${e.detail}`);
      for (const alt of pick.alternatives) console.log(`    alt: ${alt.groupKey} — ${alt.reason}`);
      console.log("");
    }

    const out = arg("json");
    if (out) {
      writeFileSync(out, JSON.stringify({ settings, picks, pools: Object.fromEntries(BUCKETS.map((b) => [b, pools[b].slice(0, 30)])) }, null, 2));
      console.log(`Wrote ${out}`);
    }
  } finally {
    await T.close();
    await O.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
