import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { denyUnlessClientAccess } from "@/lib/client-access";
import { normalizeProductSourceConfig } from "@/lib/product-source-config";
import { Prisma } from "@prisma/client";

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
          // { skipped, unchanged } — surfaces how much the incremental sync saved.
          log: true,
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

  const config = normalizeProductSourceConfig(body?.config);

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
      config: config ? (config as unknown as Prisma.InputJsonValue) : undefined,
    },
  });

  return NextResponse.json({ source }, { status: 201 });
}
