import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/autopilot/api";
import { fetchIntelBrands } from "@/lib/autopilot/intel";

/** oadmin's tracked competitor brands, for mapping a client's own brand and rivals. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if (auth.response) return auth.response;
  try {
    return NextResponse.json({ brands: await fetchIntelBrands() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Couldn't reach oadmin", brands: [] },
      { status: 502 }
    );
  }
}
