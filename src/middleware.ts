import { withAuth } from "next-auth/middleware"

export default withAuth(
  function middleware() {
    // Add any additional middleware logic here
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        // Protect the main app page - require authentication
        if (req.nextUrl.pathname === "/" || req.nextUrl.pathname.startsWith("/profile")) {
          return !!token
        }
        // Allow access to auth pages and API routes
        return true
      },
    },
  }
)

export const config = {
  matcher: [
    "/",
  ],
}