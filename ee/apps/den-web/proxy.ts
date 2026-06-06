import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const POSTHOG_PROXY_PATH = "/ow";
const POSTHOG_API_HOST = "us.i.posthog.com";
const POSTHOG_ASSETS_HOST = "us-assets.i.posthog.com";

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
  // Check for better-auth session cookie (with __Secure- prefix for HTTPS)
  const secureSessionCookie = request.cookies.get("__Secure-better-auth.session_token");
  if (secureSessionCookie?.value) {
    return true;
  }

  // Check for better-auth session cookie (without prefix for HTTP/development)
  const sessionCookie = request.cookies.get("better-auth.session_token");
  if (sessionCookie?.value) {
    return true;
  }

  // Also check legacy auth-token cookie for backwards compatibility
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

export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  const { pathname } = url;

  // Handle PostHog proxy
  if (pathname.startsWith(POSTHOG_PROXY_PATH)) {
    const hostname = pathname.startsWith(`${POSTHOG_PROXY_PATH}/static/`)
      ? POSTHOG_ASSETS_HOST
      : POSTHOG_API_HOST;
    const requestHeaders = new Headers(request.headers);

    requestHeaders.set("host", hostname);
    requestHeaders.delete("cookie");

    url.protocol = "https";
    url.hostname = hostname;
    url.port = "443";
    url.pathname = pathname.replace(/^\/ow/, "") || "/";

    return NextResponse.rewrite(url, {
      request: {
        headers: requestHeaders
      }
    });
  }

  // Handle authentication
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
    const redirectUrl = url.clone();
    redirectUrl.pathname = "/";
    redirectUrl.searchParams.set("mode", "sign-in");
    redirectUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/ow/:path*",
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
