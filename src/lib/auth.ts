// @ts-ignore
import { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "./prisma"
import { getServerSession } from "next-auth/next"

// Extended session type
export interface ExtendedSession {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    isAdmin?: boolean;
  }
}

// Helper to get typed session
export const getTypedSession = async (): Promise<ExtendedSession | null> => {
  return await getServerSession(authOptions) as ExtendedSession | null;
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    // @ts-ignore
    session: async ({ session, token }) => {
      if (session?.user) {
        (session.user as any).id = token.sub!;
        (session.user as any).isAdmin = token.isAdmin as boolean;
      }
      return session
    },
    // @ts-ignore
    jwt: async ({ user, token }) => {
      if (user) {
        (token as any).uid = user.id
        // Fetch user's admin status from database
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { isAdmin: true }
        })
        ;(token as any).isAdmin = dbUser?.isAdmin || false
      }
      return token
    },
  },
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/auth/signin",
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
}