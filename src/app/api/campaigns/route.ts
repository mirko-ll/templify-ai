import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth/next";
import { CampaignStatus } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ACTIVE_CLIENT_COOKIE = "templaito_active_client";

function parsePage(value: string | null, fallback = 1): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function parseLimit(value: string | null, fallback = 50): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, 100);
}

async function verifyClientOwnership(userId: string, clientId: string) {
  return prisma.client.findFirst({
    where: {
      id: clientId,
      userId,
      isArchived: false,
    },
    select: {
      id: true,
      name: true,
      description: true,
    },
  });
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = ((session as any)?.user as any)?.id as string | undefined;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const searchParams = url.searchParams;
  const requestedClientId = searchParams.get("clientId");
  const statusParam = searchParams.get("status");
  const limit = parseLimit(searchParams.get("limit"));
  const page = parsePage(searchParams.get("page"));
  const skip = Math.max(0, (page - 1) * limit);

  const cookieStore = await cookies();
  const cookieClientId = cookieStore.get(ACTIVE_CLIENT_COOKIE)?.value || null;
  const targetClientId = requestedClientId || cookieClientId;

  const sanitizedStatus = statusParam?.trim().toUpperCase() ?? null;
  let statusFilter: CampaignStatus | undefined;
  if (sanitizedStatus) {
    const allowed = new Set(Object.values(CampaignStatus));
    if (!allowed.has(sanitizedStatus as CampaignStatus)) {
      return NextResponse.json(
        { error: `Unsupported status filter: ${sanitizedStatus}` },
        { status: 400 }
      );
    }
    statusFilter = sanitizedStatus as CampaignStatus;
  }

  if (!targetClientId) {
    return NextResponse.json({
      clientId: null,
      client: null,
      campaigns: [],
      pagination: {
        page,
        limit,
        totalCount: 0,
        totalPages: 0,
      },
      filters: {
        status: sanitizedStatus ?? null,
      },
    });
  }

  const client = await verifyClientOwnership(userId, targetClientId);
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const [campaigns, totalCount] = await Promise.all([
    prisma.campaign.findMany({
      where: {
        clientId: client.id,
        status: statusFilter,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: limit,
      skip,
      include: {
        countryTargets: {
          include: {
            country: {
              select: {
                code: true,
                name: true,
              },
            },
          },
        },
      },
    }),
    prisma.campaign.count({
      where: {
        clientId: client.id,
        status: statusFilter,
      },
    }),
  ]);

  const payload = campaigns.map((campaign) => ({
    id: campaign.id,
    name: campaign.name,
    description: campaign.description,
    status: campaign.status,
    scheduledAt: campaign.scheduledAt ? campaign.scheduledAt.toISOString() : null,
    sentAt: campaign.sentAt ? campaign.sentAt.toISOString() : null,
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
    countryTargets: campaign.countryTargets.map((target) => ({
      id: target.id,
      countryCode: target.countryCode,
      countryName: target.country?.name ?? null,
      mailingListId: target.mailingListId,
      externalId: target.externalId,
    })),
  }));

  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  return NextResponse.json({
    clientId: client.id,
    client,
    campaigns: payload,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages,
    },
    filters: {
      status: statusFilter ?? null,
    },
  });
}

