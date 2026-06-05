import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { denyUnlessClientAccess } from "@/lib/client-access";

function normalizeUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeConfig(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const countryTemplates =
    raw.countryCampaignUrlTemplates &&
    typeof raw.countryCampaignUrlTemplates === "object" &&
    !Array.isArray(raw.countryCampaignUrlTemplates)
      ? Object.fromEntries(
          Object.entries(raw.countryCampaignUrlTemplates as Record<string, unknown>)
            .filter(([, template]) => typeof template === "string" && template.trim())
            .map(([code, template]) => [code.trim().toUpperCase(), String(template).trim()])
        )
      : {};
  const domainTemplates =
    raw.domainCampaignUrlTemplates &&
    typeof raw.domainCampaignUrlTemplates === "object" &&
    !Array.isArray(raw.domainCampaignUrlTemplates)
      ? Object.fromEntries(
          Object.entries(raw.domainCampaignUrlTemplates as Record<string, unknown>)
            .filter(([, template]) => typeof template === "string" && template.trim())
            .map(([domain, template]) => [
              domain.trim().toLowerCase().replace(/^www\./, ""),
              String(template).trim(),
            ])
        )
      : {};

  return {
    productUrlPatterns: Array.isArray(raw.productUrlPatterns)
      ? raw.productUrlPatterns.filter((item): item is string => typeof item === "string")
      : [],
    crawlUrlPatterns: Array.isArray(raw.crawlUrlPatterns)
      ? raw.crawlUrlPatterns.filter((item): item is string => typeof item === "string")
      : [],
    excludeUrlPatterns: Array.isArray(raw.excludeUrlPatterns)
      ? raw.excludeUrlPatterns.filter((item): item is string => typeof item === "string")
      : [],
    maxPages:
      typeof raw.maxPages === "number" && Number.isFinite(raw.maxPages)
        ? Math.max(1, Math.min(Math.floor(raw.maxPages), 10000))
        : 10000,
    maxCrawlPages:
      typeof raw.maxCrawlPages === "number" && Number.isFinite(raw.maxCrawlPages)
        ? Math.max(1, Math.min(Math.floor(raw.maxCrawlPages), 300))
        : 60,
    renderMode: raw.renderMode === "browser" ? "browser" : "static",
    scrollRounds:
      typeof raw.scrollRounds === "number" && Number.isFinite(raw.scrollRounds)
        ? Math.max(0, Math.min(Math.floor(raw.scrollRounds), 20))
        : 3,
    scrollDelayMs:
      typeof raw.scrollDelayMs === "number" && Number.isFinite(raw.scrollDelayMs)
        ? Math.max(250, Math.min(Math.floor(raw.scrollDelayMs), 10000))
        : 1200,
    loadMoreSelector:
      typeof raw.loadMoreSelector === "string" ? raw.loadMoreSelector.trim() : "",
    loadMoreClickLimit:
      typeof raw.loadMoreClickLimit === "number" && Number.isFinite(raw.loadMoreClickLimit)
        ? Math.max(0, Math.min(Math.floor(raw.loadMoreClickLimit), 100))
        : 10,
    loadMoreDelayMs:
      typeof raw.loadMoreDelayMs === "number" && Number.isFinite(raw.loadMoreDelayMs)
        ? Math.max(250, Math.min(Math.floor(raw.loadMoreDelayMs), 15000))
        : 1500,
    useSitemap: typeof raw.useSitemap === "boolean" ? raw.useSitemap : true,
    sitemapUrls: Array.isArray(raw.sitemapUrls)
      ? raw.sitemapUrls.filter((item): item is string => typeof item === "string")
      : [],
    maxSitemapPages:
      typeof raw.maxSitemapPages === "number" && Number.isFinite(raw.maxSitemapPages)
        ? Math.max(1, Math.min(Math.floor(raw.maxSitemapPages), 200))
        : 30,
    campaignUrlTemplate:
      typeof raw.campaignUrlTemplate === "string"
        ? raw.campaignUrlTemplate.trim()
        : "",
    countryCampaignUrlTemplates: countryTemplates,
    domainCampaignUrlTemplates: domainTemplates,
    defaultPrice:
      typeof raw.defaultPrice === "string" ? raw.defaultPrice.trim() : "",
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const userId = ((session as any)?.user as any)?.id as string | undefined;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const access = await denyUnlessClientAccess(id, userId);
  if (access.response) return access.response;

  const sources = await prisma.productSource.findMany({
    where: { clientId: id, isEnabled: true },
    orderBy: { createdAt: "desc" },
    include: {
      syncRuns: {
        orderBy: { startedAt: "desc" },
        take: 3,
        select: {
          id: true,
          status: true,
          startedAt: true,
          finishedAt: true,
          discoveredCount: true,
          createdCount: true,
          updatedCount: true,
          missingCount: true,
          failedCount: true,
          errorMessage: true,
        },
      },
    },
  });

  return NextResponse.json({ sources });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const userId = ((session as any)?.user as any)?.id as string | undefined;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const access = await denyUnlessClientAccess(id, userId);
  if (access.response) return access.response;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const url = normalizeUrl(body?.url);
  if (!url) {
    return NextResponse.json({ error: "A valid source URL is required" }, { status: 400 });
  }

  const source = await prisma.productSource.create({
    data: {
      clientId: id,
      url,
      name: typeof body?.name === "string" && body.name.trim() ? body.name.trim() : null,
      countryCode:
        typeof body?.countryCode === "string" && body.countryCode.trim()
          ? body.countryCode.trim().toUpperCase()
          : null,
      crawlDepth:
        typeof body?.crawlDepth === "number" && Number.isFinite(body.crawlDepth)
          ? Math.max(1, Math.min(Math.floor(body.crawlDepth), 3))
          : 1,
      config: normalizeConfig(body?.config) ?? undefined,
    },
  });

  return NextResponse.json({ source }, { status: 201 });
}
