import withAuth from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  (req) => {
    const token = req.nextauth.token;


    if (!token) {
      return NextResponse.redirect(new URL('/auth/signin', req.url));
    }

    return NextResponse.rewrite(new URL(req.url));
  },
);

export const config = {
  // restricted routes
  matcher: [
    '/',
    '/profile/:path*',
  ],
};
