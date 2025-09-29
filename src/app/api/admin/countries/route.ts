import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function isAdmin(session: unknown) {
  return Boolean(((session as any)?.user as any)?.isAdmin);
}

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const countries = await prisma.country.findMany({
    orderBy: {
      name: "asc",
    },
  });

  return NextResponse.json({ countries });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { code, name, isActive } = body || {};

  if (!code || typeof code !== "string" || code.trim().length !== 2) {
    return NextResponse.json(
      { error: "Country code (ISO Alpha-2) is required" },
      { status: 400 }
    );
  }

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json(
      { error: "Country name is required" },
      { status: 400 }
    );
  }

  if (isActive !== undefined && typeof isActive !== "boolean") {
    return NextResponse.json(
      { error: "isActive must be a boolean" },
      { status: 400 }
    );
  }

  const normalizedCode = code.trim().toUpperCase();
  const normalizedName = name.trim();

  const country = await prisma.country.upsert({
    where: { code: normalizedCode },
    update: {
      name: normalizedName,
      ...(isActive === undefined ? {} : { isActive }),
    },
    create: {
      code: normalizedCode,
      name: normalizedName,
      isActive: isActive ?? true,
    },
  });

  return NextResponse.json({ country });
}
