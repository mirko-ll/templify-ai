import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/encryption";
import { callTemplaitoBackend } from "@/lib/templaito-backend";
import { IntegrationProvider, IntegrationStatus, Prisma } from "@prisma/client";

const PROVIDER = IntegrationProvider.SQUALOMAIL;

async function ensureClientAccess(clientId: string, userId: string) {
  // Check if user is admin
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });

  const client = await prisma.client.findFirst({
    where: {
      id: clientId,
      // Only filter by userId if user is not an admin
      ...(!user?.isAdmin ? { userId } : {}),
      isArchived: false,
    },
    select: { id: true },
  });

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  return null;
}

function sanitizeIntegration(integration: any) {
  if (!integration) {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { encryptedCredentials, ...rest } = integration;
  return rest;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const userId = ((session as any)?.user as any)?.id as string | undefined;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const denial = await ensureClientAccess(id, userId);
  if (denial) {
    return denial;
  }

  const refresh = new URL(request.url).searchParams.get("refresh") === "1";

  const integration = await prisma.clientIntegration.findFirst({
    where: {
      clientId: id,
      provider: PROVIDER,
    },
  });

  if (!integration) {
    return NextResponse.json({ integration: null });
  }

  if (refresh && integration.encryptedCredentials) {
    try {
      const apiKey = decryptSecret(integration.encryptedCredentials);
      if (apiKey) {
        const validation = await callTemplaitoBackend<{ lists?: unknown; account?: unknown }>(
          {
            path: "/integrations/squalomail/lists",
            method: "POST",
            body: JSON.stringify({ apiKey }),
          }
        );

        const existingMetadata =
          integration.metadata && typeof integration.metadata === "object" && !Array.isArray(integration.metadata)
            ? (integration.metadata as Record<string, unknown>)
            : {};

        await prisma.clientIntegration.update({
          where: { id: integration.id },
          data: {
            metadata: {
              ...existingMetadata,
              lists: validation.lists ?? null,
              account: validation.account ?? null,
            },
            lastSyncedAt: new Date(),
          },
        });

        const updated = await prisma.clientIntegration.findUnique({
          where: { id: integration.id },
        });

        return NextResponse.json({ integration: sanitizeIntegration(updated) });
      }
    } catch (error) {
      console.error("Failed to refresh Squalomail lists", error);
    }
  }

  return NextResponse.json({ integration: sanitizeIntegration(integration) });
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
  const denial = await ensureClientAccess(id, userId);
  if (denial) {
    return denial;
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { apiKey } = body || {};

  if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
    return NextResponse.json(
      { error: "SqualoMail API key is required" },
      { status: 400 }
    );
  }

  try {
    const validation = await callTemplaitoBackend<{
      token?: string;
      lists?: unknown;
      account?: unknown;
    }>({
      path: "/integrations/squalomail/validate",
      method: "POST",
      body: JSON.stringify({ apiKey: apiKey.trim() }),
    });

    const encrypted = encryptSecret(validation.token ?? apiKey.trim());

    const integration = await prisma.clientIntegration.upsert({
      where: {
        clientId_provider: {
          clientId: id,
          provider: PROVIDER,
        },
      },
      create: {
        clientId: id,
        provider: PROVIDER,
        status: IntegrationStatus.CONNECTED,
        encryptedCredentials: encrypted,
        metadata: {
          account: validation.account ?? null,
          lists: validation.lists ?? null,
        },
        lastSyncedAt: new Date(),
      },
      update: {
        status: IntegrationStatus.CONNECTED,
        encryptedCredentials: encrypted,
        metadata: {
          account: validation.account ?? null,
          lists: validation.lists ?? null,
        },
        lastSyncedAt: new Date(),
      },
    });

    return NextResponse.json({ integration: sanitizeIntegration(integration) });
  } catch (error) {
    console.error("Failed to validate Squalomail integration", error);
    return NextResponse.json(
      { error: "Failed to validate SqualoMail API key" },
      { status: 502 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const userId = ((session as any)?.user as any)?.id as string | undefined;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const denial = await ensureClientAccess(id, userId);
  if (denial) {
    return denial;
  }

  await prisma.clientIntegration.updateMany({
    where: {
      clientId: id,
      provider: PROVIDER,
    },
    data: {
      status: IntegrationStatus.DISCONNECTED,
      encryptedCredentials: null,
      metadata: Prisma.JsonNull,
      lastSyncedAt: new Date(),
    },
  });

  return NextResponse.json({ success: true });
}






