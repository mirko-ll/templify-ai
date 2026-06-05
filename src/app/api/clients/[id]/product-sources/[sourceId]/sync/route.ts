import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { denyUnlessClientAccess } from "@/lib/client-access";
import { callTemplaitoBackend } from "@/lib/templaito-backend";

export const maxDuration = 300;

export async function POST(
  _request: Request,
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

  const source = await prisma.productSource.findFirst({
    where: {
      id: sourceId,
      clientId: id,
      isEnabled: true,
    },
    select: { id: true },
  });

  if (!source) {
    return NextResponse.json({ error: "Product source not found" }, { status: 404 });
  }

  try {
    const result = await callTemplaitoBackend({
      path: `/product-sources/${sourceId}/sync`,
      method: "POST",
      body: JSON.stringify({ clientId: id }),
    });
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Product sync failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
