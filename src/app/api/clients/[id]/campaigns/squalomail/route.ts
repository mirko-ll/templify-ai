import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { callTemplaitoBackend } from "@/lib/templaito-backend";
import { IntegrationProvider, IntegrationStatus } from "@prisma/client";

const PROVIDER = IntegrationProvider.SQUALOMAIL;

async function ensureClientAccess(clientId: string, userId: string) {
  const client = await prisma.client.findFirst({
    where: {
      id: clientId,
      userId,
      isArchived: false,
    },
    select: { id: true },
  });

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  return null;
}

interface ImageOverridesPayload {
  singleImageIndex?: number;
  multiImageSelections?: Record<number, number>;
}

function normalizeImageOverrides(raw: unknown): ImageOverridesPayload | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }

  const value = raw as Record<string, unknown>;
  const overrides: ImageOverridesPayload = {};

  if (
    typeof value.singleImageIndex === "number" &&
    Number.isFinite(value.singleImageIndex) &&
    value.singleImageIndex >= 0
  ) {
    overrides.singleImageIndex = value.singleImageIndex;
  }

  if (
    value.multiImageSelections &&
    typeof value.multiImageSelections === "object" &&
    !Array.isArray(value.multiImageSelections)
  ) {
    const selections: Record<number, number> = {};
    for (const [key, candidate] of Object.entries(
      value.multiImageSelections as Record<string, unknown>
    )) {
      const productIndex = Number.parseInt(key, 10);
      if (
        Number.isFinite(productIndex) &&
        typeof candidate === "number" &&
        Number.isFinite(candidate) &&
        candidate >= 0
      ) {
        selections[productIndex] = candidate;
      }
    }

    if (Object.keys(selections).length > 0) {
      overrides.multiImageSelections = selections;
    }
  }

  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

async function ensureIntegrationConnected(clientId: string) {
  const integration = await prisma.clientIntegration.findFirst({
    where: {
      clientId,
      provider: PROVIDER,
    },
    select: {
      status: true,
    },
  });

  if (!integration || integration.status !== IntegrationStatus.CONNECTED) {
    return NextResponse.json(
      { error: "SqualoMail integration is not connected for this client" },
      { status: 400 }
    );
  }

  return null;
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

  const integrationError = await ensureIntegrationConnected(id);
  if (integrationError) {
    return integrationError;
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    baseCountry,
    subject,
    preheader,
    sendDate,
    emailTemplate,
    countryResults,
    imageOverrides,
  } = body ?? {};

  if (!emailTemplate || typeof emailTemplate !== "object") {
    return NextResponse.json(
      { error: "emailTemplate payload is required" },
      { status: 400 }
    );
  }

  if (!emailTemplate.html || typeof emailTemplate.html !== "string") {
    return NextResponse.json(
      { error: "emailTemplate.html must be provided" },
      { status: 400 }
    );
  }

  if (!countryResults || typeof countryResults !== "object" || Array.isArray(countryResults)) {
    return NextResponse.json(
      { error: "countryResults must be an object keyed by country code" },
      { status: 400 }
    );
  }

  try {
    const normalizedOverrides = normalizeImageOverrides(imageOverrides);

    const payload = {
      clientId: id,
      baseCountry: baseCountry ?? null,
      subject: typeof subject === "string" ? subject : "",
      preheader: typeof preheader === "string" ? preheader : "",
      sendDate: typeof sendDate === "string" && sendDate.trim() ? sendDate : null,
      emailTemplate,
      countryResults,
      imageOverrides: normalizedOverrides,
    };

    const result = await callTemplaitoBackend({
      path: "/integrations/squalomail/campaigns",
      method: "POST",
      body: JSON.stringify(payload),
    });

    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    console.error("Failed to create SqualoMail campaign", error);
    const message =
      error instanceof Error ? error.message : "Failed to create SqualoMail campaign";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
