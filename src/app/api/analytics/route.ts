import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { trackTemplateUsage } from "@/lib/simple-analytics"
import { Prisma } from "@prisma/client"

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const data = await request.json()

    // Get user profile context if available
    let userProfile = null
    if (((session as any)?.user as any)?.email) {
      try {
        const { prisma } = await import("@/lib/prisma")
        const user = await prisma.user.findUnique({
          where: { email: ((session as any).user as any).email },
          include: { profile: true },
        })
        userProfile = user?.profile
      } catch (error) {
        console.error("Failed to fetch user profile for analytics:", error)
      }
    }

    // Track template usage
    await trackTemplateUsage({
      userId: ((session as any)?.user as any)?.id,
      templateType: data.templateType,
      templateId: data.templateId,
      urlCount: data.urlCount,
      wasSuccessful: data.wasSuccessful,
      userIndustry: userProfile?.companyIndustry || undefined,
      userCompanySize: userProfile?.companySize || undefined,
      userCountry: userProfile?.country || undefined,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Analytics API error:", error)
    return NextResponse.json(
      { error: "Failed to track analytics event" },
      { status: 500 }
    )
  }
}

// GET endpoint for retrieving analytics data (for admin/analytics dashboard)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    // Only allow authenticated users to view analytics (you might want admin-only access)
    if (!(session as any)?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId")
    const templateType = searchParams.get("templateType")
    const wasSuccessful = searchParams.get("wasSuccessful")
    const limit = parseInt(searchParams.get("limit") || "100")
    const offset = parseInt(searchParams.get("offset") || "0")

    const { prisma } = await import("@/lib/prisma")

    const whereClause: Prisma.TemplateUsageWhereInput = {}
    if (userId) whereClause.userId = userId
    if (templateType) whereClause.templateType = templateType
    if (wasSuccessful !== null) whereClause.wasSuccessful = wasSuccessful === "true"

    // Since we changed to TemplateUsage model, update this
    const events = await prisma.templateUsage.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            profile: {
              select: {
                companyName: true,
                companyIndustry: true,
                companySize: true,
                country: true,
              },
            },
          },
        },
      },
    })

    return NextResponse.json({ events })
  } catch (error) {
    console.error("Analytics GET API error:", error)
    return NextResponse.json(
      { error: "Failed to retrieve analytics data" },
      { status: 500 }
    )
  }
}