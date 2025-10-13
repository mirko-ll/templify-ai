import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "templaito_active_client";

async function ownsClient(userId: string, clientId: string) {
  if (!clientId) {
    return false;
  }

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

  return Boolean(client);
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = ((session as any)?.user as any)?.id as string | undefined;

  if (!userId) {
    return NextResponse.json({ clientId: null }, { status: 200 });
  }

  const cookieStore = await cookies();
  const storedId = cookieStore.get(COOKIE_NAME)?.value || null;

  if (!storedId) {
    return NextResponse.json({ clientId: null });
  }

  const valid = await ownsClient(userId, storedId);
  if (!valid) {
    const response = NextResponse.json({ clientId: null });
    response.cookies.set({ name: COOKIE_NAME, value: "", maxAge: 0, path: "/" });
    return response;
  }

  return NextResponse.json({ clientId: storedId });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = ((session as any)?.user as any)?.id as string | undefined;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const clientId = typeof body?.clientId === "string" ? body.clientId : "";
  if (!clientId) {
    return NextResponse.json(
      { error: "clientId is required" },
      { status: 400 }
    );
  }

  const valid = await ownsClient(userId, clientId);
  if (!valid) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const response = NextResponse.json({ clientId });
  response.cookies.set({
    name: COOKIE_NAME,
    value: clientId,
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    sameSite: "lax",
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set({ name: COOKIE_NAME, value: "", maxAge: 0, path: "/" });
  return response;
}

