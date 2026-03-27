import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { exchangeGoogleCode } from "@/lib/google-calendar";
import { setSetting } from "@/lib/db/settings";
import { consumeOauthState } from "@/lib/oauth-state";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const state = searchParams.get("state");

  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const origin = `${protocol}://${host}`;
  const redirectUri = `${origin}/api/auth/google/callback`;

  if (error || !code) {
    return NextResponse.redirect(
      `${origin}/dashboard/calendar?error=access_denied`
    );
  }

  const stateOk = await consumeOauthState("google-calendar-auth", state);
  if (!stateOk) {
    return NextResponse.redirect(`${origin}/dashboard/calendar?error=invalid_oauth_state`);
  }

  try {
    const tokens = await exchangeGoogleCode(code, redirectUri);

    // Always store refresh token (prompt: "consent" ensures one is always returned)
    if (tokens.refresh_token) {
      await setSetting("google_refresh_token", tokens.refresh_token);
    }
    // Cache access token + expiry to avoid unnecessary refreshes
    if (tokens.access_token) {
      await setSetting("google_access_token", tokens.access_token);
      await setSetting(
        "google_token_expiry",
        String(Date.now() + tokens.expires_in * 1000)
      );
    }
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    return NextResponse.redirect(
      `${origin}/dashboard/calendar?error=token_exchange_failed`
    );
  }

  return NextResponse.redirect(`${origin}/dashboard/calendar?connected=true`);
}
