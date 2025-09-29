import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!((session as any)?.user as any)?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim();

  const whereClause = {
    userId: ((session as any).user as any).id as string,
    isArchived: false,
    ...(search
      ? {
          name: {
            contains: search,
            mode: "insensitive" as const,
          },
        }
      : {}),
  };

  const clients = await prisma.client.findMany({
    where: whereClause,
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      name: true,
      description: true,
      industry: true,
      website: true,
      createdAt: true,
      updatedAt: true,
      isArchived: true,
      countryConfigs: {
        select: {
          id: true,
          countryCode: true,
          isActive: true,
        },
      },
      integrations: {
        select: {
          id: true,
          provider: true,
          status: true,
          updatedAt: true,
        },
      },
    },
  });

  return NextResponse.json({ clients });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!((session as any)?.user as any)?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let data: any;
  try {
    data = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, description, industry, website, notes } = data || {};

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json(
      { error: "Client name is required" },
      { status: 400 }
    );
  }

  const trimmedName = name.trim();

  const client = await prisma.client.create({
    data: {
      userId: ((session as any).user as any).id as string,
      name: trimmedName,
      description: typeof description === "string" ? description.trim() || null : null,
      industry: typeof industry === "string" ? industry.trim() || null : null,
      website: typeof website === "string" ? website.trim() || null : null,
      notes: typeof notes === "string" ? notes.trim() || null : null,
    },
  });

  const countries = await prisma.country.findMany({
    where: { isActive: true },
    select: { code: true },
  });

  if (countries.length > 0) {
    await prisma.clientCountryConfig.createMany({
      data: countries.map((country) => ({
        clientId: client.id,
        countryCode: country.code,
      })),
      skipDuplicates: true,
    });
  }

  const result = await prisma.client.findUnique({
    where: { id: client.id },
    select: {
      id: true,
      name: true,
      description: true,
      industry: true,
      website: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
      countryConfigs: {
        select: {
          id: true,
          countryCode: true,
          isActive: true,
        },
      },
      integrations: {
        select: {
          id: true,
          provider: true,
          status: true,
          updatedAt: true,
        },
      },
    },
  });

  return NextResponse.json({ client: result }, { status: 201 });
}
