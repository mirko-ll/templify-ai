import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { trackTemplateUsage, getUserProfileContext } from "@/lib/simple-analytics"

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const data = await request.json()

    // Get user profile context if user is logged in
    const userProfile = await getUserProfileContext(session?.user?.id)

    // Track template usage
    await trackTemplateUsage({
      userId: session?.user?.id,
      templateType: data.templateType,
      templateId: data.templateId,
      urlCount: data.urlCount,
      wasSuccessful: data.wasSuccessful,
      userIndustry: userProfile?.industry || undefined,
      userCompanySize: userProfile?.companySize || undefined,
      userCountry: userProfile?.country || undefined,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Tracking API error:", error)
    return NextResponse.json(
      { error: "Failed to track usage" },
      { status: 500 }
    )
  }
}