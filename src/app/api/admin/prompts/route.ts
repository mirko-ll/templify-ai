import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    // Check if user is authenticated and is admin
    if (!(session as any)?.user || !((session as any).user as any).isAdmin) {
      return NextResponse.json(
        { error: "Unauthorized - Admin access required" },
        { status: 403 }
      );
    }

    // Fetch all prompts with creator information
    const prompts = await prisma.prompt.findMany({
      include: {
        creator: {
          select: {
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            templateGenerations: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Calculate success rate for each prompt
    const promptsWithStats = await Promise.all(
      prompts.map(async (prompt) => {
        // Get success rate from template generations
        const generations = await prisma.templateGeneration.findMany({
          where: { promptId: prompt.id },
          select: { wasSuccessful: true },
        });

        const successRate = generations.length > 0
          ? generations.filter(g => g.wasSuccessful).length / generations.length
          : null;

        return {
          ...prompt,
          usageCount: prompt._count.templateGenerations,
          successRate,
        };
      })
    );

    return NextResponse.json({
      prompts: promptsWithStats,
      total: prompts.length,
      active: prompts.filter(p => p.status === 'ACTIVE').length,
      draft: prompts.filter(p => p.status === 'DRAFT').length,
      archived: prompts.filter(p => p.status === 'ARCHIVED').length,
    });

  } catch (error) {
    console.error("Error fetching prompts:", error);
    return NextResponse.json(
      { error: "Failed to fetch prompts" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    // Check if user is authenticated and is admin
    if (!(session as any)?.user || !((session as any).user as any).isAdmin) {
      return NextResponse.json(
        { error: "Unauthorized - Admin access required" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      name,
      description,
      color,
      systemPrompt,
      userPrompt,
      designEngine,
      status,
      isDefault,
      templateType,
    } = body;

    // Validate required fields
    if (!name || !systemPrompt || !userPrompt) {
      return NextResponse.json(
        { error: "Missing required fields: name, systemPrompt, userPrompt" },
        { status: 400 }
      );
    }

    // Create the prompt
    const prompt = await prisma.prompt.create({
      data: {
        name,
        description,
        color: color || '#6366f1',
        systemPrompt,
        userPrompt,
        designEngine: designEngine || 'CLAUDE',
        status: status || 'DRAFT',
        isDefault: isDefault || false,
        createdBy: ((session as any).user as any).id,
        templateType: templateType || 'SINGLE_PRODUCT',
      },
      include: {
        creator: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json({
      prompt,
      message: "Prompt created successfully",
    });

  } catch (error) {
    console.error("Error creating prompt:", error);
    return NextResponse.json(
      { error: "Failed to create prompt" },
      { status: 500 }
    );
  }
}