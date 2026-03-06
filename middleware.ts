import { NextRequest, NextResponse } from "next/server";

const AUTH_COOKIE = "prdcr_auth";
const AUTH_PREFIX = "authenticated_v";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Fetch current session version from DB. Defaults to 1 on any failure. */
async function getSessionVersion(): Promise<number> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/app_settings?key=eq.session_version&select=value`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        cache: "no-store",
      }
    );
    if (!res.ok) return 1;
    const data = await res.json();
    return parseInt(data[0]?.value ?? "1", 10) || 1;
  } catch {
    return 1;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Bypass: static assets, OAuth callbacks, login
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/api/auth/google") ||
    pathname.startsWith("/api/auth/gmail") ||
    pathname === "/login" ||
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/logout"
  ) {
    return NextResponse.next();
  }

  const cookieValue = req.cookies.get(AUTH_COOKIE)?.value ?? "";

  // If cookie doesn't start with the versioned prefix, kick to login
  if (!cookieValue.startsWith(AUTH_PREFIX)) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("from", pathname);
    const res = NextResponse.redirect(loginUrl);
    res.cookies.delete(AUTH_COOKIE);
    return res;
  }

  // Validate cookie version against DB version
  const cookieVersion = parseInt(cookieValue.slice(AUTH_PREFIX.length), 10) || 0;
  const currentVersion = await getSessionVersion();

  if (cookieVersion < currentVersion) {
    // Session invalidated — kick to login with message
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("from", pathname);
    loginUrl.searchParams.set("reason", "session_ended");
    const res = NextResponse.redirect(loginUrl);
    res.cookies.delete(AUTH_COOKIE);
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
