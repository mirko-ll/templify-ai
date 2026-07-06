import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  BROKEN_LINK_FILTERS,
  hasMarkdownLinkAttributes,
  repairMarkdownLinkAttributes,
} from "@/lib/html-links";

/**
 * Admin diagnostics for the translation link-mangling incident: campaign HTML
 * whose hrefs were rewritten into markdown ([url](url)) breaks the link and
 * gets the newsletter stopped by SqualoMail.
 *
 *  GET  ?term=xxx  — diagnose campaigns matching the term (name/subject/url)
 *  GET             — scan all stored campaign HTML for broken link attributes
 *  POST {action:"repair"} — repair un-pushed broken rows in place
 */

const DIAGNOSTIC_NEEDLES = [
  'href="[',
  "href='[",
  'src="[',
  "[http",
  "](http",
  "roundrect",
] as const;

interface CountryDiagnosis {
  id: string;
  countryCode: string;
  isPushed: boolean;
  externalId: string | null;
  htmlLength: number | null;
  broken: boolean;
  checks: Record<string, number>;
  excerpt: string | null;
  hrefs: string[];
}

interface CampaignDiagnosis {
  id: string;
  name: string;
  status: string;
  scheduledAt: string | null;
  createdAt: string;
  clientName: string | null;
  countries: CountryDiagnosis[];
}

function excerptAround(html: string, index: number, radius = 200): string {
  return html
    .slice(Math.max(0, index - radius), index + radius)
    .replace(/\s+/g, " ");
}

function diagnoseCountryRow(row: {
  id: string;
  countryCode: string;
  isPushed: boolean;
  externalId: string | null;
  preparedHtml: string | null;
}): CountryDiagnosis {
  const html = row.preparedHtml;
  const base = {
    id: row.id,
    countryCode: row.countryCode,
    isPushed: row.isPushed,
    externalId: row.externalId,
  };

  if (!html) {
    return {
      ...base,
      htmlLength: null,
      broken: false,
      checks: {},
      excerpt: null,
      hrefs: [],
    };
  }

  const checks: Record<string, number> = {};
  for (const needle of DIAGNOSTIC_NEEDLES) {
    checks[needle] = html.indexOf(needle);
  }

  // Show context around the most telling marker: a markdown link target if
  // present, otherwise the Outlook VML button.
  let excerpt: string | null = null;
  if (checks["](http"] >= 0) {
    excerpt = excerptAround(html, checks["](http"]);
  } else if (checks["roundrect"] >= 0) {
    excerpt = excerptAround(html, checks["roundrect"], 280);
  }

  const hrefs = [...html.matchAll(/href\s*=\s*("([^"]*)"|'([^']*)')/gi)]
    .map((match) => match[2] ?? match[3] ?? "")
    .filter((value) => value && !value.startsWith("mailto:") && !value.startsWith("#"));

  return {
    ...base,
    htmlLength: html.length,
    broken: hasMarkdownLinkAttributes(html),
    checks,
    excerpt,
    hrefs: [...new Set(hrefs)].slice(0, 10),
  };
}

const campaignSelect = {
  id: true,
  name: true,
  status: true,
  scheduledAt: true,
  createdAt: true,
  client: { select: { name: true } },
} as const;

function toCampaignDiagnosis(
  campaign: {
    id: string;
    name: string;
    status: string;
    scheduledAt: Date | null;
    createdAt: Date;
    client: { name: string | null } | null;
  },
  countries: CountryDiagnosis[]
): CampaignDiagnosis {
  return {
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    scheduledAt: campaign.scheduledAt?.toISOString() ?? null,
    createdAt: campaign.createdAt.toISOString(),
    clientName: campaign.client?.name ?? null,
    countries,
  };
}

function requireAdmin(session: unknown): boolean {
  return Boolean(
    (session as any)?.user && ((session as any).user as any).isAdmin
  );
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!requireAdmin(session)) {
      return NextResponse.json(
        { error: "Unauthorized - Admin access required" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const term = searchParams.get("term")?.trim();

    if (term) {
      // Targeted diagnosis: latest campaigns matching the term, all rows shown
      // whether broken or not (a clean result is also an answer).
      const campaigns = await prisma.campaign.findMany({
        where: {
          OR: [
            { name: { contains: term } },
            { subject: { contains: term } },
            { productUrl: { contains: term } },
            { productNickname: { contains: term } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          ...campaignSelect,
          countryTargets: {
            select: {
              id: true,
              countryCode: true,
              isPushed: true,
              externalId: true,
              preparedHtml: true,
            },
          },
        },
      });

      return NextResponse.json({
        mode: "diagnose",
        term,
        campaigns: campaigns.map((campaign) =>
          toCampaignDiagnosis(
            campaign,
            campaign.countryTargets.map(diagnoseCountryRow)
          )
        ),
      });
    }

    // Full scan: only rows whose stored HTML matches a broken-link pattern.
    const brokenRows = await prisma.campaignCountry.findMany({
      where: { OR: BROKEN_LINK_FILTERS },
      select: {
        id: true,
        countryCode: true,
        isPushed: true,
        externalId: true,
        preparedHtml: true,
        campaign: { select: campaignSelect },
      },
    });

    const byCampaign = new Map<
      string,
      { campaign: (typeof brokenRows)[number]["campaign"]; countries: CountryDiagnosis[] }
    >();
    for (const row of brokenRows) {
      const entry = byCampaign.get(row.campaign.id) ?? {
        campaign: row.campaign,
        countries: [],
      };
      entry.countries.push(diagnoseCountryRow(row));
      byCampaign.set(row.campaign.id, entry);
    }

    const campaignIds = [...byCampaign.keys()];
    const plannerItems = campaignIds.length
      ? await prisma.campaignPlanItem.findMany({
          where: { campaignId: { in: campaignIds } },
          select: {
            id: true,
            campaignId: true,
            status: true,
            sendDate: true,
            plan: { select: { year: true, month: true } },
          },
        })
      : [];

    return NextResponse.json({
      mode: "scan",
      campaigns: [...byCampaign.values()].map(({ campaign, countries }) =>
        toCampaignDiagnosis(campaign, countries)
      ),
      plannerItems: plannerItems.map((item) => ({
        id: item.id,
        campaignId: item.campaignId,
        status: item.status,
        sendDate: item.sendDate?.toISOString() ?? null,
        plan: `${item.plan.year}-${String(item.plan.month).padStart(2, "0")}`,
      })),
    });
  } catch (error) {
    console.error("Broken-links diagnostics failed:", error);
    return NextResponse.json(
      { error: "Diagnostics failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!requireAdmin(session)) {
      return NextResponse.json(
        { error: "Unauthorized - Admin access required" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    if (body?.action !== "repair") {
      return NextResponse.json(
        { error: "Unknown action - expected {\"action\":\"repair\"}" },
        { status: 400 }
      );
    }

    const brokenRows = await prisma.campaignCountry.findMany({
      where: { OR: BROKEN_LINK_FILTERS },
      select: {
        id: true,
        countryCode: true,
        isPushed: true,
        externalId: true,
        preparedHtml: true,
        campaign: { select: { id: true, name: true } },
      },
    });

    let repaired = 0;
    const stillBroken: string[] = [];
    const pushedBroken: Array<{
      campaignId: string;
      campaignName: string;
      countryCode: string;
      externalId: string | null;
    }> = [];

    for (const row of brokenRows) {
      if (row.isPushed) {
        // Already at SqualoMail with dead links — repairing our copy doesn't
        // fix their newsletter; surface it for manual delete + regenerate.
        pushedBroken.push({
          campaignId: row.campaign.id,
          campaignName: row.campaign.name,
          countryCode: row.countryCode,
          externalId: row.externalId,
        });
      }
      if (!row.preparedHtml) continue;
      const fixed = repairMarkdownLinkAttributes(row.preparedHtml);
      if (fixed !== row.preparedHtml) {
        await prisma.campaignCountry.update({
          where: { id: row.id },
          data: { preparedHtml: fixed },
        });
        repaired += 1;
      }
      if (hasMarkdownLinkAttributes(fixed)) {
        stillBroken.push(row.id);
      }
    }

    return NextResponse.json({ repaired, stillBroken, pushedBroken });
  } catch (error) {
    console.error("Broken-links repair failed:", error);
    return NextResponse.json({ error: "Repair failed" }, { status: 500 });
  }
}
