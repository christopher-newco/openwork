import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = [
  "/",
  "/api/auth/sign-in/email",
  "/api/auth/sign-up/email",
  "/api/auth/sign-in/social",
  "/api/auth/email-otp/send-verification-otp",
  "/api/auth/email-otp/verify-email",
  "/sso/",
];

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") {
    return true;
  }

  return PUBLIC_PATHS.some(path => {
    if (path.endsWith("/")) {
      return pathname.startsWith(path);
    }
    return pathname === path;
  });
}

function hasAuthToken(request: NextRequest): boolean {
  // Check for auth token in cookies
  const authCookie = request.cookies.get("auth-token");
  if (authCookie?.value) {
    return true;
  }

  // Check Authorization header
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return true;
  }

  return false;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Allow static files and API routes
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Check if user is authenticated
  if (!hasAuthToken(request)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("mode", "sign-in");
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*|api/auth).*)",
  ],
};
