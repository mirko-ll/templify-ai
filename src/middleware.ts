import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware() {

    // Add cache-control headers to prevent caching issues
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'no-store, must-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');

    return response;
  },
  {
    callbacks: {
      authorized: ({ token }) => {

        // Double-check token validity
        if (token) {
          // Check if token is expired
          const tokenExp = token.exp;
          if (tokenExp && typeof tokenExp === 'number' && Date.now() >= tokenExp * 1000) {
            return false;
          }
        }

        return !!token;
      },
    },
    pages: {
      signIn: '/auth/signin',
    },
  }
);

export const config = {
  matcher: ['/app/:path*', '/profile/:path*'],
};
