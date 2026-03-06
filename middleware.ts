import { NextRequest, NextResponse } from "next/server";

const AUTH_COOKIE = "prdcr_auth";
const AUTH_VALUE = "authenticated";

// Routes that bypass password protection
const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/google",
  "/api/auth/gmail",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow Next.js internals, static files
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/api/auth/google") ||
    pathname.startsWith("/api/auth/gmail") ||
    pathname === "/login" ||
    pathname === "/api/auth/login"
  ) {
    return NextResponse.next();
  }

  // Check auth cookie
  const auth = req.cookies.get(AUTH_COOKIE);
  if (auth?.value === AUTH_VALUE) {
    return NextResponse.next();
  }

  // Redirect to login, preserving destination
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
