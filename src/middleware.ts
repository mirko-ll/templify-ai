import { withAuth } from 'next-auth/middleware';

export default withAuth(
  function middleware(req) {
    // Optional: Add any custom logic here
    console.log('Middleware token:', req.nextauth.token ? 'exists' : 'missing');
  },
  {
    callbacks: {
      authorized: ({ token }) => {
        // Return true if user is authenticated, false to redirect
        return !!token;
      },
    },
    pages: {
      signIn: '/auth/signin',
    },
  }
);

export const config = {
  matcher: ['/', '/profile/:path*'],
};
