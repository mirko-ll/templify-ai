/**
 * Copy one client's data from the live Templaito DB into a LOCAL database, for
 * testing (e.g. the Autopilot). The source is opened READ ONLY; the target must
 * be localhost and is wiped table by table before the copy.
 *
 *   SOURCE_DB_URL=mysql://…live…/templaito \
 *   npx tsx scripts/copy-client-to-local.ts --client cmpxujbyb0004xj2qzsf7pguw
 *
 * The target is DATABASE_URL from .env (run `npx prisma db push` there first).
 * SqualoMail credentials are NOT copied: the integration row keeps its lists
 * but is DISCONNECTED, so a local run can never create or send newsletters.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

function arg(name: string, fallback?: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const BATCH = 500;

async function main() {
  const sourceUrl = process.env.SOURCE_DB_URL;
  const targetUrl = process.env.DATABASE_URL;
  const clientId = arg("client", "cmpxujbyb0004xj2qzsf7pguw")!;
  if (!sourceUrl || !targetUrl) throw new Error("Set SOURCE_DB_URL (live) and DATABASE_URL (local, from .env)");
  const targetHost = new URL(targetUrl).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(targetHost)) {
    throw new Error(`Refusing to write to ${targetHost}: the target must be a local database`);
  }

  const source = await mysql.createConnection({ uri: sourceUrl, timezone: "Z", dateStrings: false });
  await source.query("START TRANSACTION READ ONLY");
  const target = await mysql.createConnection({ uri: targetUrl, timezone: "Z" });
  await target.query("SET FOREIGN_KEY_CHECKS = 0");

  const select = async (sql: string, params: unknown[] = []) => {
    if (!/^\s*select\b/i.test(sql)) throw new Error("source is read-only");
    const [rows] = await source.query(sql, params);
    return rows as Record<string, unknown>[];
  };

  async function copy(table: string, where: string, params: unknown[] = [], transform?: (row: Record<string, unknown>) => Record<string, unknown>) {
    const [columns] = (await target.query(`SHOW COLUMNS FROM \`${table}\``)) as any;
    const targetCols = new Set<string>(columns.map((c: any) => c.Field));
    const jsonCols = new Set<string>(columns.filter((c: any) => /json/i.test(c.Type)).map((c: any) => c.Field));
    const rows = (await select(`SELECT * FROM \`${table}\` WHERE ${where}`, params)).map((r) => (transform ? transform(r) : r));
    await target.query(`DELETE FROM \`${table}\``);
    if (!rows.length) return console.log(`${table.padEnd(26)} 0`);
    const cols = Object.keys(rows[0]).filter((c) => targetCols.has(c));
    for (let i = 0; i < rows.length; i += BATCH) {
      const values = rows.slice(i, i + BATCH).map((row) =>
        cols.map((c) => (jsonCols.has(c) && row[c] !== null && typeof row[c] !== "string" ? JSON.stringify(row[c]) : row[c]))
      );
      await target.query(`INSERT INTO \`${table}\` (${cols.map((c) => `\`${c}\``).join(",")}) VALUES ?`, [values]);
    }
    console.log(`${table.padEnd(26)} ${rows.length}`);
  }

  const C = [clientId];
  const [client] = await select("SELECT userId FROM Client WHERE id = ?", C);
  if (!client) throw new Error(`Client ${clientId} not found`);

  // Admins (+ the owner) so you can sign in locally with your usual Google account.
  await copy("User", "isAdmin = 1 OR id = ?", [client.userId]);
  await copy("Account", "userId IN (SELECT id FROM User WHERE isAdmin = 1 OR id = ?)", [client.userId]);
  await copy("Country", "1 = 1");
  await copy("Prompt", "1 = 1");
  await copy("Client", "id = ?", C);
  await copy("ClientCountryConfig", "clientId = ?", C);
  await copy("ClientIntegration", "clientId = ?", C, (row) => ({
    ...row,
    encryptedCredentials: "",
    status: "DISCONNECTED",
  }));
  await copy("ProductSource", "clientId = ?", C);
  await copy("Product", "clientId = ?", C);
  await copy("ProductListing", "clientId = ?", C);
  await copy("ProductImage", "`rank` < 6 AND productId IN (SELECT id FROM Product WHERE clientId = ?)", C);
  // The first run (the Autopilot's "new client" guard) plus the last two weeks.
  await copy(
    "ProductSyncRun",
    "clientId = ? AND (startedAt >= NOW() - INTERVAL 14 DAY OR startedAt = (SELECT MIN(startedAt) FROM ProductSyncRun WHERE clientId = ?))",
    [clientId, clientId]
  );
  await copy("ProductPerformanceReport", "clientId = ?", C);
  await copy("ProductPerformanceEntry", "clientId = ?", C);
  await copy("CampaignPlan", "clientId = ?", C);
  await copy("CampaignPlanItem", "planId IN (SELECT id FROM CampaignPlan WHERE clientId = ?)", C);
  await copy("Campaign", "clientId = ?", C);
  await copy("CampaignCountry", "campaignId IN (SELECT id FROM Campaign WHERE clientId = ?)", C);
  // Local test state from earlier runs — the copy starts the Autopilot fresh.
  for (const table of ["AutopilotSlot", "AutopilotCandidate", "CompetitorSignal", "AutopilotRun", "AutopilotConfig"]) {
    await target.query(`DELETE FROM \`${table}\``);
  }

  await target.query("SET FOREIGN_KEY_CHECKS = 1");
  await source.query("ROLLBACK");
  await source.end();
  await target.end();
  console.log("\nDone. Local copy is ready.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
