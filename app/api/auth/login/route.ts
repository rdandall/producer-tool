import { NextRequest, NextResponse } from "next/server";

const SITE_PASSWORD_FALLBACK = process.env.SITE_PASSWORD || "thevision";
const AUTH_COOKIE = "prdcr_auth";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function fetchSetting(key: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/app_settings?key=eq.${key}&select=value`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data[0]?.value ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const { password } = await req.json();

  // Check DB-stored password first (set via Settings page), fall back to env var
  const dbPassword = await fetchSetting("site_password");
  const sitePassword = dbPassword || SITE_PASSWORD_FALLBACK;

  if (password !== sitePassword) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get current session version from DB (default 1)
  const versionStr = await fetchSetting("session_version");
  const sessionVersion = parseInt(versionStr ?? "1", 10) || 1;
  const cookieValue = `authenticated_v${sessionVersion}`;

  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });
  return response;
}
