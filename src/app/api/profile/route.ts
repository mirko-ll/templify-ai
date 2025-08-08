import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { profile: true },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    return NextResponse.json({ profile: user.profile })
  } catch (error) {
    console.error("Error fetching profile:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const data = await request.json()
    const {
      phoneNumber,
      address,
      city,
      country,
      postalCode,
      companyName,
      companyWebsite,
      companyIndustry,
      jobTitle,
      companySize,
    } = data

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const profile = await prisma.profile.upsert({
      where: { userId: user.id },
      update: {
        phoneNumber: phoneNumber || null,
        address: address || null,
        city: city || null,
        country: country || null,
        postalCode: postalCode || null,
        companyName: companyName || null,
        companyWebsite: companyWebsite || null,
        companyIndustry: companyIndustry || null,
        jobTitle: jobTitle || null,
        companySize: companySize || null,
      },
      create: {
        userId: user.id,
        phoneNumber: phoneNumber || null,
        address: address || null,
        city: city || null,
        country: country || null,
        postalCode: postalCode || null,
        companyName: companyName || null,
        companyWebsite: companyWebsite || null,
        companyIndustry: companyIndustry || null,
        jobTitle: jobTitle || null,
        companySize: companySize || null,
      },
    })

    return NextResponse.json({ profile })
  } catch (error) {
    console.error("Error updating profile:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}