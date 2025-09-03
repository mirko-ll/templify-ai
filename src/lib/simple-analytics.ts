import { prisma } from "./prisma"

export interface TemplateUsageData {
  userId?: string
  templateType: string
  templateId: string
  urlCount: number
  wasSuccessful: boolean
  userIndustry?: string
  userCompanySize?: string
  userCountry?: string
}

export async function trackTemplateUsage(data: TemplateUsageData) {
  try {
    await prisma.templateUsage.create({
      data: {
        userId: data.userId || null,
        templateType: data.templateType,
        templateId: data.templateId,
        urlCount: data.urlCount,
        wasSuccessful: data.wasSuccessful,
        userIndustry: data.userIndustry || null,
        userCompanySize: data.userCompanySize || null,
        userCountry: data.userCountry || null,
      },
    })
  } catch (error) {
    console.error("Failed to track template usage:", error)
    // Don't throw error to avoid breaking user experience
  }
}

// Helper function to get user profile context
export async function getUserProfileContext(userId?: string) {
  if (!userId) return null

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    })

    return user?.profile ? {
      industry: user.profile.companyIndustry,
      companySize: user.profile.companySize,
      country: user.profile.country,
    } : null
  } catch (error) {
    console.error("Failed to get user profile context:", error)
    return null
  }
}