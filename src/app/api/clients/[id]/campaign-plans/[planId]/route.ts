import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  maybeCompletePlan,
  syncCampaignPlanItems,
} from "@/lib/campaign-plan-sync";
import { denyUnlessClientAccess } from "@/lib/client-access";
import { Prisma } from "@prisma/client";

const planInclude = {
  items: {
    orderBy: { position: "asc" as const },
    include: {
      product: {
        select: { id: true, title: true, bestImageUrl: true, status: true },
      },
    },
  },
};

/** Items that have entered the generation pipeline must not be edited/replaced. */
const LOCKED_STATUSES = ["QUEUED", "GENERATING", "SCHEDULED"] as const;

function dayKey(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

async function loadPlan(planId: string, clientId: string) {
  return prisma.campaignPlan.findFirst({
    where: { id: planId, clientId },
    include: planInclude,
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; planId: string }> }
) {
  const session = await getServerSession(authOptions);
  const userId = ((session as any)?.user as any)?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, planId } = await params;
  const access = await denyUnlessClientAccess(id, userId);
  if (access.response) return access.response;

  let plan = await loadPlan(planId, id);
  if (!plan) {
    return NextResponse.json({ error: "Campaign plan not found" }, { status: 404 });
  }

  // Surface backend publish failures and recover items orphaned by a dead
  // generation runner before handing the plan to the UI.
  if (await syncCampaignPlanItems(plan.items)) {
    plan = await loadPlan(planId, id);
  }
  if (plan && (await maybeCompletePlan(plan, plan.items))) {
    plan = { ...plan, status: "COMPLETED" };
  }

  return NextResponse.json({ plan });
}

/**
 * Delete a plan and its items. Blocked while any item is in the generation
 * pipeline — scheduled campaigns would keep sending with no plan to manage
 * them from, so those days must be unscheduled first.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; planId: string }> }
) {
  const session = await getServerSession(authOptions);
  const userId = ((session as any)?.user as any)?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, planId } = await params;
  const access = await denyUnlessClientAccess(id, userId);
  if (access.response) return access.response;

  const plan = await loadPlan(planId, id);
  if (!plan) {
    return NextResponse.json({ error: "Campaign plan not found" }, { status: 404 });
  }

  const blocking = plan.items.filter((item) =>
    (LOCKED_STATUSES as readonly string[]).includes(item.status)
  ).length;
  if (blocking > 0) {
    return NextResponse.json(
      {
        error: `This plan has ${blocking} scheduled or generating ${
          blocking === 1 ? "campaign" : "campaigns"
        }. Unschedule those days before deleting the plan.`,
      },
      { status: 409 }
    );
  }

  await prisma.campaignPlan.delete({ where: { id: planId } });
  return NextResponse.json({ ok: true });
}

interface IncomingItem {
  sendDate?: unknown;
  groupKey?: unknown;
  productId?: unknown;
  productSnapshot?: unknown;
  countryCodes?: unknown;
  templateId?: unknown;
  subject?: unknown;
  preheader?: unknown;
  mailingListOverrides?: unknown;
  selectedImageUrl?: unknown;
  priceOverride?: unknown;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Normalize a { countryCode: string[] } map, dropping empty entries. */
function normalizeListOverrides(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string[]> = {};
  for (const [code, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue;
    const ids = value.filter(
      (v): v is string => typeof v === "string" && v.trim().length > 0
    );
    if (ids.length > 0) out[code.toUpperCase()] = ids;
  }
  return out;
}

/**
 * Replace the plan's shared defaults and editable items.
 *
 * Items already in the generation pipeline (QUEUED/GENERATING/SCHEDULED) are
 * preserved untouched; everything else is rebuilt from the request body. A day
 * can hold several products — items are keyed by (day, product), so an incoming
 * product that's already locked for that day is skipped, but other products on
 * the same day are still (re)created.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; planId: string }> }
) {
  const session = await getServerSession(authOptions);
  const userId = ((session as any)?.user as any)?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, planId } = await params;
  const access = await denyUnlessClientAccess(id, userId);
  if (access.response) return access.response;

  const existing = await loadPlan(planId, id);
  if (!existing) {
    return NextResponse.json({ error: "Campaign plan not found" }, { status: 404 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const defaults = {
    templateId: str(body?.defaults?.templateId),
    subject: typeof body?.defaults?.subject === "string" ? body.defaults.subject : "",
    preheader:
      typeof body?.defaults?.preheader === "string" ? body.defaults.preheader : "",
    sendTime:
      typeof body?.defaults?.sendTime === "string" && /^\d{2}:\d{2}$/.test(body.defaults.sendTime)
        ? body.defaults.sendTime
        : "09:00",
    senderName:
      typeof body?.defaults?.senderName === "string" ? body.defaults.senderName : "",
    mailingListOverrides: normalizeListOverrides(body?.defaults?.mailingListOverrides),
  };

  const lockedItems = existing.items.filter((item) =>
    (LOCKED_STATUSES as readonly string[]).includes(item.status)
  );
  // A locked product is identified by its day + product, so other products on
  // the same day can still be edited.
  const lockedKeys = new Set(
    lockedItems
      .map((item) => {
        const day = dayKey(item.sendDate);
        return day ? `${day}::${item.groupKey ?? ""}` : null;
      })
      .filter(Boolean) as string[]
  );

  // Failed days keep their FAILED status (and error) through rebuilds —
  // otherwise the pre-generate save resets them to PLANNED and
  // "regenerate failed" finds nothing to retry.
  const failedByKey = new Map<string, string | null>();
  for (const item of existing.items) {
    if (item.status !== "FAILED") continue;
    const day = dayKey(item.sendDate);
    if (day) failedByKey.set(`${day}::${item.groupKey ?? ""}`, item.errorMessage);
  }

  const incoming = Array.isArray(body?.items) ? (body.items as IncomingItem[]) : [];
  const prepared = incoming
    .map((item) => {
      const sendDate = item.sendDate ? new Date(item.sendDate as string) : null;
      if (!sendDate || Number.isNaN(sendDate.getTime())) return null;
      const groupKey = str(item.groupKey);
      const dedupeKey = `${sendDate.toISOString().slice(0, 10)}::${groupKey ?? ""}`;
      if (lockedKeys.has(dedupeKey)) return null; // product already scheduled that day
      const countryCodes = Array.isArray(item.countryCodes)
        ? item.countryCodes.filter(
            (c: unknown): c is string => typeof c === "string"
          )
        : [];
      return {
        sendDate,
        dedupeKey,
        groupKey,
        productId: str(item.productId),
        productSnapshot:
          item.productSnapshot && typeof item.productSnapshot === "object"
            ? (item.productSnapshot as Prisma.InputJsonValue)
            : undefined,
        countryCodes: countryCodes as Prisma.InputJsonValue,
        templateId: str(item.templateId),
        subject: typeof item.subject === "string" ? item.subject : null,
        preheader: typeof item.preheader === "string" ? item.preheader : null,
        mailingListOverrides:
          item.mailingListOverrides === null
            ? null
            : item.mailingListOverrides !== undefined
              ? (normalizeListOverrides(item.mailingListOverrides) as Prisma.InputJsonValue)
              : null,
        selectedImageUrl: str(item.selectedImageUrl),
        priceOverride: str(item.priceOverride),
      };
    })
    .filter(Boolean) as Array<{
    sendDate: Date;
    dedupeKey: string;
    groupKey: string | null;
    productId: string | null;
    productSnapshot: Prisma.InputJsonValue | undefined;
    countryCodes: Prisma.InputJsonValue;
    templateId: string | null;
    subject: string | null;
    preheader: string | null;
    mailingListOverrides: Prisma.InputJsonValue | null;
    selectedImageUrl: string | null;
    priceOverride: string | null;
  }>;

  // De-dupe to one row per (day, product) — last write wins — then order by
  // send time for stable positions.
  const byKey = new Map<string, (typeof prepared)[number]>();
  for (const item of prepared) byKey.set(item.dedupeKey, item);
  const ordered = Array.from(byKey.values()).sort(
    (a, b) => a.sendDate.getTime() - b.sendDate.getTime()
  );

  const editableIds = existing.items
    .filter((item) => !(LOCKED_STATUSES as readonly string[]).includes(item.status))
    .map((item) => item.id);

  await prisma.$transaction([
    prisma.campaignPlanItem.deleteMany({
      where: { planId, id: { in: editableIds.length ? editableIds : ["__none__"] } },
    }),
    ...ordered.map((item, index) =>
      prisma.campaignPlanItem.create({
        data: {
          planId,
          type: "MANUAL",
          status: failedByKey.has(item.dedupeKey) ? "FAILED" : "PLANNED",
          errorMessage: failedByKey.get(item.dedupeKey) ?? null,
          position: lockedItems.length + index,
          sendDate: item.sendDate,
          groupKey: item.groupKey,
          productId: item.productId,
          productSnapshot: item.productSnapshot,
          countryCodes: item.countryCodes,
          templateId: item.templateId,
          subject: item.subject,
          preheader: item.preheader,
          mailingListOverrides:
            item.mailingListOverrides === null ? undefined : item.mailingListOverrides,
          selectedImageUrl: item.selectedImageUrl,
          priceOverride: item.priceOverride,
        },
      })
    ),
    prisma.campaignPlan.update({
      where: { id: planId },
      data: { strategy: { defaults } as Prisma.InputJsonValue },
    }),
  ]);

  const plan = await loadPlan(planId, id);
  return NextResponse.json({ plan });
}
