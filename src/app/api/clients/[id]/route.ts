import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getAuthorizedClient(clientId: string, userId: string) {
  // Check if user is admin
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });

  return prisma.client.findFirst({
    where: {
      id: clientId,
      // Only filter by userId if user is not an admin
      ...(!user?.isAdmin ? { userId } : {}),
    },
    select: {
      id: true,
      name: true,
      description: true,
      industry: true,
      website: true,
      notes: true,
      isArchived: true,
      createdAt: true,
      updatedAt: true,
      countryConfigs: {
        orderBy: { countryCode: "asc" },
        select: {
          id: true,
          countryCode: true,
          isActive: true,
          mailingListId: true,
          mailingListName: true,
          senderEmail: true,
          senderName: true,
          lastSyncedAt: true,
          createdAt: true,
          updatedAt: true,
          country: {
            select: {
              code: true,
              name: true,
              isActive: true,
            },
          },
        },
      },
      integrations: {
        select: {
          id: true,
          provider: true,
          status: true,
          metadata: true,
          lastSyncedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      campaigns: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          name: true,
          status: true,
          scheduledAt: true,
          sentAt: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);

  if (!((session as any)?.user as any)?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const client = await getAuthorizedClient(
    id,
    ((session as any).user as any).id as string
  );

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  return NextResponse.json({ client });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);

  if (!((session as any)?.user as any)?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const userId = ((session as any).user as any).id as string;

  // Check if user is admin
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });

  const existing = await prisma.client.findFirst({
    where: {
      id,
      // Only filter by userId if user is not an admin
      ...(!user?.isAdmin ? { userId } : {}),
    },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, description, industry, website, notes, isArchived } = body || {};

  const data: Record<string, unknown> = {};

  if (typeof name === "string") {
    if (!name.trim()) {
      return NextResponse.json(
        { error: "Client name cannot be empty" },
        { status: 400 }
      );
    }
    data.name = name.trim();
  }

  if (typeof description === "string") {
    data.description = description.trim() || null;
  }

  if (typeof industry === "string") {
    data.industry = industry.trim() || null;
  }

  if (typeof website === "string") {
    data.website = website.trim() || null;
  }

  if (typeof notes === "string") {
    data.notes = notes.trim() || null;
  }

  if (typeof isArchived === "boolean") {
    data.isArchived = isArchived;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields provided" }, { status: 400 });
  }

  await prisma.client.update({
    where: { id },
    data,
  });

  const client = await getAuthorizedClient(
    id,
    ((session as any).user as any).id as string
  );

  return NextResponse.json({ client });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);

  if (!((session as any)?.user as any)?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const userId = ((session as any).user as any).id as string;

  // Check if user is admin
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });

  const existing = await prisma.client.findFirst({
    where: {
      id,
      // Only filter by userId if user is not an admin
      ...(!user?.isAdmin ? { userId } : {}),
    },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  await prisma.client.update({
    where: { id },
    data: { isArchived: true },
  });

  return NextResponse.json({ success: true });
}
