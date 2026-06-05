import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { denyUnlessClientAccess } from "@/lib/client-access";

async function ensureSource(clientId: string, sourceId: string) {
  return prisma.productSource.findFirst({
    where: {
      id: sourceId,
      clientId,
    },
    select: { id: true },
  });
}

function normalizeUrl(value: unknown) {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sourceId: string }> }
) {
  const session = await getServerSession(authOptions);
  const userId = ((session as any)?.user as any)?.id as string | undefined;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, sourceId } = await params;
  const access = await denyUnlessClientAccess(id, userId);
  if (access.response) return access.response;

  const source = await ensureSource(id, sourceId);
  if (!source) {
    return NextResponse.json({ error: "Product source not found" }, { status: 404 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  const url = normalizeUrl(body?.url);
  if (url) data.url = url;
  if (typeof body?.name === "string") data.name = body.name.trim() || null;
  if (typeof body?.countryCode === "string") {
    data.countryCode = body.countryCode.trim() ? body.countryCode.trim().toUpperCase() : null;
  }
  if (typeof body?.isEnabled === "boolean") data.isEnabled = body.isEnabled;
  if (typeof body?.crawlDepth === "number" && Number.isFinite(body.crawlDepth)) {
    data.crawlDepth = Math.max(1, Math.min(Math.floor(body.crawlDepth), 3));
  }
  if (body?.config && typeof body.config === "object" && !Array.isArray(body.config)) {
    data.config = body.config;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields provided" }, { status: 400 });
  }

  const updated = await prisma.productSource.update({
    where: { id: sourceId },
    data,
  });

  return NextResponse.json({ source: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; sourceId: string }> }
) {
  const session = await getServerSession(authOptions);
  const userId = ((session as any)?.user as any)?.id as string | undefined;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, sourceId } = await params;
  const access = await denyUnlessClientAccess(id, userId);
  if (access.response) return access.response;

  const source = await ensureSource(id, sourceId);
  if (!source) {
    return NextResponse.json({ error: "Product source not found" }, { status: 404 });
  }

  await prisma.productSource.update({
    where: { id: sourceId },
    data: { isEnabled: false },
  });

  return NextResponse.json({ success: true });
}
