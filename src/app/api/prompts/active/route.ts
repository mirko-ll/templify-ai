import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // Fetch all active prompts
    const prompts = await prisma.prompt.findMany({
      where: {
        status: 'ACTIVE',
      },
      select: {
        id: true,
        name: true,
        description: true,
        color: true,
        systemPrompt: true,
        userPrompt: true,
        designEngine: true,
        templateType: true,
        isDefault: true,
        version: true,
        usageCount: true,
      },
      orderBy: [
        { isDefault: 'desc' }, // Default templates first
        { name: 'asc' },
      ],
    });

    return NextResponse.json({
      prompts,
      total: prompts.length,
    });

  } catch (error) {
    console.error("Error fetching active prompts:", error);
    return NextResponse.json(
      { error: "Failed to fetch prompts" },
      { status: 500 }
    );
  }
}