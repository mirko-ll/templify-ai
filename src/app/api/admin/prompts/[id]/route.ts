import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);

    // Check if user is authenticated and is admin
    if (!(session as any)?.user || !((session as any).user as any).isAdmin) {
      return NextResponse.json(
        { error: "Unauthorized - Admin access required" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const prompt = await prisma.prompt.findUnique({
      where: { id },
      include: {
        creator: {
          select: {
            name: true,
            email: true,
          },
        },
        templateGenerations: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
        _count: {
          select: {
            templateGenerations: true,
          },
        },
      },
    });

    if (!prompt) {
      return NextResponse.json(
        { error: "Prompt not found" },
        { status: 404 }
      );
    }

    // Calculate success rate
    const successfulGenerations = await prisma.templateGeneration.count({
      where: {
        promptId: id,
        wasSuccessful: true,
      },
    });

    const totalGenerations = prompt._count.templateGenerations;
    const successRate = totalGenerations > 0 ? successfulGenerations / totalGenerations : null;

    const promptWithStats = {
      ...prompt,
      usageCount: totalGenerations,
      successRate,
      recentGenerations: prompt.templateGenerations,
    };

    return NextResponse.json({
      prompt: promptWithStats,
    });

  } catch (error) {
    console.error("Error fetching prompt:", error);
    return NextResponse.json(
      { error: "Failed to fetch prompt" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);

    // Check if user is authenticated and is admin
    if (!(session as any)?.user || !((session as any).user as any).isAdmin) {
      return NextResponse.json(
        { error: "Unauthorized - Admin access required" },
        { status: 403 }
      );
    }

    const { id } = await params;
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
      version,
      templateType,
    } = body;

    // Validate required fields
    if (!name || !systemPrompt || !userPrompt) {
      return NextResponse.json(
        { error: "Missing required fields: name, systemPrompt, userPrompt" },
        { status: 400 }
      );
    }

    // Update the prompt
    const updatedPrompt = await prisma.prompt.update({
      where: { id },
      data: {
        name,
        description,
        color: color || '#6366f1',
        systemPrompt,
        userPrompt,
        designEngine: designEngine || 'CLAUDE',
        status: status || 'DRAFT',
        isDefault: isDefault || false,
        version: version || '1.0.0',
        updatedAt: new Date(),
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
      prompt: updatedPrompt,
      message: "Prompt updated successfully",
    });

  } catch (error) {
    console.error("Error updating prompt:", error);
    return NextResponse.json(
      { error: "Failed to update prompt" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);

    // Check if user is authenticated and is admin
    if (!(session as any)?.user || !((session as any).user as any).isAdmin) {
      return NextResponse.json(
        { error: "Unauthorized - Admin access required" },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Check if prompt exists
    const prompt = await prisma.prompt.findUnique({
      where: { id },
    });

    if (!prompt) {
      return NextResponse.json(
        { error: "Prompt not found" },
        { status: 404 }
      );
    }

    // Don't allow deletion of default prompts that are actively used
    if (prompt.isDefault && prompt.status === 'ACTIVE') {
      return NextResponse.json(
        { error: "Cannot delete active default prompts. Archive it first or remove default status." },
        { status: 400 }
      );
    }

    // Delete associated template generations first
    await prisma.templateGeneration.deleteMany({
      where: { promptId: id },
    });

    // Delete the prompt
    await prisma.prompt.delete({
      where: { id },
    });

    return NextResponse.json({
      message: "Prompt deleted successfully",
    });

  } catch (error) {
    console.error("Error deleting prompt:", error);
    return NextResponse.json(
      { error: "Failed to delete prompt" },
      { status: 500 }
    );
  }
}