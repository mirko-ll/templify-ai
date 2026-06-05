import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function getAccessibleClient(clientId: string, userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });

  return prisma.client.findFirst({
    where: {
      id: clientId,
      ...(!user?.isAdmin ? { userId } : {}),
      isArchived: false,
    },
    select: {
      id: true,
      name: true,
      userId: true,
    },
  });
}

export async function denyUnlessClientAccess(clientId: string, userId: string) {
  const client = await getAccessibleClient(clientId, userId);
  if (!client) {
    return {
      client: null,
      response: NextResponse.json({ error: "Client not found" }, { status: 404 }),
    };
  }

  return { client, response: null };
}
