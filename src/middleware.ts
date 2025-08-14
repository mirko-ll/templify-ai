import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    console.log('Middleware token:', req.nextauth.token ? 'exists' : 'missing');
    console.log('Request URL:', req.url);
    
    // Add cache-control headers to prevent caching issues
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'no-store, must-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    
    return response;
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        console.log('Authorization check - token exists:', !!token);
        console.log('Path being accessed:', req.nextUrl.pathname);
        
        // Double-check token validity
        if (token) {
          // Check if token is expired
          const tokenExp = token.exp;
          if (tokenExp && typeof tokenExp === 'number' && Date.now() >= tokenExp * 1000) {
            console.log('Token expired, denying access');
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
