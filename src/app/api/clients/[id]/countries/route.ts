import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

function serialize(config: any) {
  return {
    id: config.id,
    clientId: config.clientId,
    countryCode: config.countryCode,
    isActive: config.isActive,
    mailingListId: config.mailingListId,
    mailingListName: config.mailingListName,
    senderEmail: config.senderEmail,
    senderName: config.senderName,
    lastSyncedAt: config.lastSyncedAt,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
    country: config.country
      ? {
        code: config.country.code,
        name: config.country.name,
        isActive: config.country.isActive,
      }
      : null,
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
  const denial = await ensureClientAccess(id, userId);
  if (denial) {
    return denial;
  }

  const countries = await prisma.country.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    select: { code: true },
  });

  let configs = await prisma.clientCountryConfig.findMany({
    where: { clientId: id },
    orderBy: { countryCode: "asc" },
    include: { country: true },
  });

  const existingCodes = new Set(configs.map((config) => config.countryCode));
  const missingCountries = countries.filter((country) => !existingCodes.has(country.code));

  if (missingCountries.length > 0) {
    await prisma.clientCountryConfig.createMany({
      data: missingCountries.map((country) => ({
        clientId: id,
        countryCode: country.code,
      })),
      skipDuplicates: true,
    });

    configs = await prisma.clientCountryConfig.findMany({
      where: { clientId: id },
      orderBy: { countryCode: "asc" },
      include: { country: true },
    });
  }

  return NextResponse.json({
    countries: configs.map(serialize),
  });
}

export async function PATCH(
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

  const updates = Array.isArray(body?.updates) ? body.updates : [];
  if (updates.length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  try {
    await prisma.$transaction(
      updates.map((item: any) => {
        const { countryCode } = item || {};

        if (!countryCode || typeof countryCode !== "string") {
          throw new Error("countryCode is required for each update");
        }

        const data: Record<string, unknown> = {};

        if (typeof item.isActive === "boolean") {
          data.isActive = item.isActive;
        }

        if (item.mailingListId !== undefined) {
          if (item.mailingListId && typeof item.mailingListId !== "string") {
            throw new Error("mailingListId must be a string");
          }
          data.mailingListId = item.mailingListId ? item.mailingListId.trim() : null;
        }

        if (item.mailingListName !== undefined) {
          if (item.mailingListName && typeof item.mailingListName !== "string") {
            throw new Error("mailingListName must be a string");
          }
          data.mailingListName = item.mailingListName
            ? item.mailingListName.trim()
            : null;
        }

        if (item.senderEmail !== undefined) {
          if (item.senderEmail && typeof item.senderEmail !== "string") {
            throw new Error("senderEmail must be a string");
          }
          data.senderEmail = item.senderEmail ? item.senderEmail.trim() : null;
        }

        if (item.senderName !== undefined) {
          if (item.senderName && typeof item.senderName !== "string") {
            throw new Error("senderName must be a string");
          }
          data.senderName = item.senderName ? item.senderName.trim() : null;
        }

        if (item.resetSyncedAt) {
          data.lastSyncedAt = null;
        }

        return prisma.clientCountryConfig.updateMany({
          where: {
            clientId: id,
            countryCode,
          },
          data,
        });
      })
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update country settings";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const configs = await prisma.clientCountryConfig.findMany({
    where: { clientId: id },
    orderBy: { countryCode: "asc" },
    include: { country: true },
  });

  return NextResponse.json({
    countries: configs.map(serialize),
  });
}



