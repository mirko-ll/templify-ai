// Why each product was picked. The LLM may choose any entry of a slot's
// shortlist (every entry already passes the hard rules) and writes the reason
// from the numbers we give it; the result is re-validated, and any failure
// falls back to the deterministic first entry with a templated reason.

import OpenAI from "openai";
import { OPENAI_FAST_EFFORT, OPENAI_FAST_MODEL } from "@/lib/ai-models";
import { blockReason, reserve, shortlistFor, type PickContext } from "./pick";
import { learnPriceRatio, priceFor, pricePick } from "./pricing";
import { BUCKET_LABELS, type FinalPick, type ShortlistEntry, type SlotPick } from "./types";

const ALTERNATIVES = 3;

const euro = (n: unknown) =>
  typeof n === "number" ? `€${Math.round(n).toLocaleString("en-US")}` : "€?";
const compact = (n: unknown) => {
  if (typeof n !== "number") return "?";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
};
const monthName = (ym: unknown) =>
  typeof ym === "string"
    ? new Date(`${ym}-01T00:00:00Z`).toLocaleString("en-GB", { month: "short", timeZone: "UTC" })
    : "?";
const monthYear = (iso: unknown) =>
  typeof iso === "string"
    ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" })
    : "?";
const dayName = (iso: unknown) =>
  typeof iso === "string"
    ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
    : "?";

type BrandSignal = { name: string; own?: boolean; activeAds: number; reach7d: number };
type RivalSignal = { brand: string; listedSince: string | null; firstAdAt: string | null; activeAds: number };

function brandsText(brands: unknown, max = 2): string | null {
  if (!Array.isArray(brands) || !brands.length) return null;
  return (brands as BrandSignal[])
    .slice(0, max)
    .map((b) => `${b.own ? "you" : b.name}: ${b.activeAds} active ads, ${compact(b.reach7d)} reach/7d`)
    .join("; ");
}

/** "Vigo launched it 28 Oct (12 ads)" when the listing is new, else when its first ads started. */
function rivalText(r: RivalSignal, now: Date): string {
  const listedRecently = r.listedSince && now.getTime() - Date.parse(`${r.listedSince}T00:00:00Z`) <= 30 * 86_400_000;
  return listedRecently || !r.firstAdAt
    ? `${r.brand} launched it ${dayName(r.listedSince)} (${r.activeAds} ads)`
    : `${r.brand} started ads on it ${dayName(r.firstAdAt)} (${r.activeAds} ads)`;
}

/** Plain-language reason built only from the entry's signals (no LLM). */
export function templateReason(entry: ShortlistEntry, now: Date = new Date()): string {
  const s = entry.signals as Record<string, any>;
  switch (entry.bucket) {
    case "BEST_SELLER": {
      const parts = [`Best seller: ${euro(s.profit?.[0])} profit in ${monthName(s.months?.[0])}`];
      if (s.sendsLatestMonth) parts[0] += ` from ${s.sendsLatestMonth} send${s.sendsLatestMonth === 1 ? "" : "s"}`;
      if (s.rankLatest) parts.push(`#${s.rankLatest} that month`);
      if (s.profit?.[1]) parts.push(`${euro(s.profit[1])} in ${monthName(s.months?.[1])}`);
      if (s.graduated) parts.push("graduated from new products");
      return `${parts.join(" · ")}.`;
    }
    case "NEW_PRODUCT": {
      const parts: string[] = [];
      if (s.relaunched) {
        parts.push(`Relaunched: your first ad started ${dayName(s.ownFirstAdAt)} (in the shop since ${monthYear(s.inShopSince)})`);
      } else if (s.firstSeenAt) {
        parts.push(
          `New in the shop since ${dayName(s.firstSeenAt)}${s.ownFirstAdAt ? ` · your first ad ${dayName(s.ownFirstAdAt)}` : ""}`
        );
      }
      const rivals = (s.rivals ?? []) as RivalSignal[];
      if (rivals.length) {
        parts.push(
          rivals
            .slice(0, 2)
            .map((r) => rivalText(r, now))
            .join("; ")
        );
      }
      if (s.ownActiveAds) parts.push(`${s.ownActiveAds} active ads`);
      if (!s.timesSent) parts.push("never emailed");
      return `${parts.join(" · ") || "New product"}.`;
    }
    case "FB_WINNER": {
      const brands = brandsText(s.brands);
      const several = Array.isArray(s.brands) && s.brands.length > 1;
      return `FB winner: ${brands ?? `${s.totalActiveAds} active ads`}${several ? ` · ${s.brands.length} brands advertise it, ${compact(s.totalReach7d)} reach in 7 days` : ""}.`;
    }
    case "DISCOVERY": {
      const parts = ["Discovery: never emailed"];
      if (s.inShopSince) parts.push(`in the shop since ${monthYear(s.inShopSince)}`);
      if (s.inStockCountries) parts.push(`in stock in ${s.inStockCountries} of ${s.eligibleCountries} countries`);
      if (s.category) {
        parts.push(
          s.categoryGapDays === null || s.categoryGapDays === undefined
            ? `no ${s.category} email yet`
            : s.categoryGapDays >= 14
              ? `no ${s.category} email in ${s.categoryGapDays} days`
              : `${s.category}`
        );
      }
      if (s.pastAds) parts.push(`${s.pastAds} past FB ads`);
      return `${parts.join(" · ")}.`;
    }
    case "SEASONAL": {
      const parts = [`In season (${(s.seasonTags ?? []).join(", ")})`];
      if (s.profit?.[0]) parts.push(`${euro(s.profit[0])} profit in ${monthName(s.months?.[0])}`);
      // Say whose ads they are — the total mixes the shop's own and competitors'.
      const brands = brandsText(s.brands);
      if (brands) parts.push(brands);
      else if (s.totalActiveAds) parts.push(`${s.totalActiveAds} active FB ads`);
      return `${parts.join(" · ")}.`;
    }
  }
}

/** An LLM reason must carry real figures; one without any digit gets the facts prepended. */
function withFacts(reason: string, entry: ShortlistEntry, now: Date): string {
  return /\d/.test(reason) ? reason : `${templateReason(entry, now)} ${reason}`;
}

/** Is `entry` still allowed in `pick`'s slot given the final picks made so far? */
function stillValid(ctx: PickContext, pick: SlotPick, entry: ShortlistEntry): boolean {
  const group = ctx.groupByKey.get(entry.groupKey);
  return !!group && !blockReason(ctx, group, pick.slot, pick.bucket);
}

interface LlmSlotChoice {
  slot: string;
  choice: string;
  reason: string;
  alternatives?: Record<string, string>;
}

function slotId(pick: SlotPick) {
  return `${pick.slot.date}#${pick.slot.slotIndex}`;
}

/** Ask the LLM to choose within each shortlist. Returns null if unavailable or malformed. */
async function llmChoose(
  ctx: PickContext,
  picks: SlotPick[],
  client: OpenAI | null
): Promise<Map<string, LlmSlotChoice> | null> {
  if (!client) return null;
  const tz = ctx.input.settings.timezone;
  const { noRepeatDays } = ctx.input.settings.rules;
  const payload = picks
    .filter((p) => p.shortlist.length > 1)
    .map((p) => ({
      slot: slotId(p),
      date: p.slot.date,
      weekday: new Date(`${p.slot.date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" }),
      time: p.slot.sendAt.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" }),
      bucket: BUCKET_LABELS[p.bucket],
      fallbackNote: p.events.map((e) => e.detail).join("; ") || undefined,
      options: p.shortlist.map((o, i) => ({
        rank: i + 1,
        groupKey: o.groupKey,
        title: o.title,
        category: o.category,
        countries: o.countryCodes.length,
        facts: templateReason(o, ctx.input.now),
      })),
    }));
  if (!payload.length) return new Map();

  const prompt = `You plan a shop's promotional emails (one product per email, two emails a day). For each slot below, choose ONE option from that slot's "options".

Every option already passes the shop's rules (stock, season, no repeat within ${noRepeatDays} days), so never avoid an option because it was emailed before: re-sending winners is intended.
- Best seller slots: keep rank 1 (the highest profit) unless another option is clearly better for that date.
- Other slots: options are ranked by score; you may pick a lower rank for a better fit — what suits the date (e.g. Christmas, winter items in November) and variety (not the same kind of product as the slot just before or after).

The reason is shown to the shop owner. Write 1–2 short sentences in English that QUOTE AT LEAST TWO FIGURES from that option's "facts" (e.g. "€1,709 profit in Oct", "80 active ads", "1.5M reach in 7 days", "new since 30 Oct"), then say why it fits this slot. Use only figures that appear in the facts; never invent or round them differently. Write naturally, like a colleague's note — no quotation marks around figures, and vary the wording between slots. Don't mention earlier emails.

A "Relaunched" product is an older one the shop has just started advertising: present it as a comeback, not as brand new.
A "Discovery" slot tries a good catalog product that has never been emailed: say what makes it worth a first try (stocked widely, a category the emails have skipped lately, fits the season) — no sales figures exist for it.
Always say whose ads a figure is: "your ads" for the shop's own, or the competitor's name (e.g. "Soldius has 42 ads on it") — never just "42 ads". A product only a competitor advertises is one the shop sells but doesn't advertise yet; you can say so.

Choose a different product for every slot.

Slots:
${JSON.stringify(payload)}

Return ONLY valid JSON: {"slots":[{"slot":"<slot>","choice":"<groupKey>","reason":"<why>","alternatives":{"<groupKey of each other option>":"<one short line with a figure, why it is a good backup>"}}]}`;

  // One retry: a single timeout or malformed answer shouldn't cost the night's reasons.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await client.responses.create({
        model: OPENAI_FAST_MODEL,
        reasoning: { effort: OPENAI_FAST_EFFORT },
        input: prompt,
      });
      const text = response.output_text?.trim() ?? "";
      const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
      const map = new Map<string, LlmSlotChoice>();
      for (const row of json?.slots ?? []) {
        if (row && typeof row.slot === "string" && typeof row.choice === "string" && typeof row.reason === "string") {
          map.set(row.slot, row as LlmSlotChoice);
        }
      }
      return map;
    } catch (error) {
      console.error(
        `[autopilot] LLM reasons failed (attempt ${attempt}/2)${attempt === 2 ? " — using templates" : ""}:`,
        error instanceof Error ? error.message : error
      );
    }
  }
  return null;
}

export interface FinalizeOptions {
  /** Pass null to skip the LLM (dry runs, tests, missing key). */
  openai?: OpenAI | null;
}

export function defaultOpenAI(): OpenAI | null {
  return process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
}

/**
 * Turn planned slots into final picks: LLM (or deterministic) choice per slot,
 * re-validated in send order against the picks before it, plus reasons for the
 * choice and its alternatives, and the email price.
 */
export async function finalizePicks(
  ctx: PickContext,
  picks: SlotPick[],
  opts: FinalizeOptions = {}
): Promise<{ picks: FinalPick[]; llmUsed: boolean }> {
  const client = opts.openai === undefined ? defaultOpenAI() : opts.openai;
  const llm = await llmChoose(ctx, picks, client);
  const ratio = ctx.input.settings.rules.priceRatio ?? learnPriceRatio(ctx.input.priceSamples);

  // planSlots reserved each of these slots' deterministic pick; drop those and re-reserve the final ones.
  const finalizing = new Set(picks.map((p) => p.slot.sendAt.getTime()));
  ctx.sends = ctx.sends.filter((s) => !(s.reserved && finalizing.has(s.sendAt.getTime())));

  const chosen: Array<{ pick: SlotPick; answer: LlmSlotChoice | undefined; choice: ShortlistEntry | null; usedLlm: boolean }> = [];
  for (const pick of picks) {
    const answer = llm?.get(slotId(pick));
    const preferred = answer ? pick.shortlist.find((o) => o.groupKey === answer.choice) : undefined;
    const ordered = preferred ? [preferred, ...pick.shortlist.filter((o) => o !== preferred)] : pick.shortlist;
    const choice = ordered.find((o) => stillValid(ctx, pick, o)) ?? null;
    if (choice) reserve(ctx, pick.slot, choice);
    chosen.push({ pick, answer, choice, usedLlm: !!(answer && choice && choice === preferred) });
  }

  // Alternatives are checked once every slot of the run has its final pick, so a
  // product chosen for a nearby slot isn't offered as a backup that would break the rules.
  const out: FinalPick[] = chosen.map(({ pick, answer, choice, usedLlm }) => {
    const group = choice ? ctx.groupByKey.get(choice.groupKey) : undefined;
    const pricing = choice ? pricePick(ctx.input, choice, group?.refPriceEur ?? null, ratio, { allowTest: true }) : null;
    // Drawn from the whole bucket with every final pick reserved (this slot's own
    // pick included, so it can't be its own backup).
    const alternatives = shortlistFor(ctx, pick.bucket, pick.slot, ALTERNATIVES)
      .map((o) => {
        const altPrice = priceFor(ctx.input, o.groupKey, o.baseKey, ctx.groupByKey.get(o.groupKey)?.refPriceEur ?? null, ratio);
        return {
          ...o,
          reason: answer?.alternatives?.[o.groupKey] || templateReason(o, ctx.input.now),
          price: altPrice.price,
          priceSuggested: altPrice.suggested,
        };
      });
    return {
      ...pick,
      choice,
      reason: choice ? (usedLlm ? withFacts(answer!.reason, choice, ctx.input.now) : templateReason(choice, ctx.input.now)) : null,
      alternatives,
      price: pricing?.price ?? null,
      priceSuggested: pricing?.suggested ?? false,
      pricing,
    };
  });
  return { picks: out, llmUsed: !!llm && llm.size > 0 };
}
