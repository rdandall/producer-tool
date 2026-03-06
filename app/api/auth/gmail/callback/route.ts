import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { exchangeGmailCode } from "@/lib/gmail";
import { setSetting } from "@/lib/db/settings";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const origin = `${protocol}://${host}`;
  const redirectUri = `${origin}/api/auth/gmail/callback`;

  if (error || !code) {
    return NextResponse.redirect(`${origin}/dashboard/email?error=access_denied`);
  }

  try {
    const tokens = await exchangeGmailCode(code, redirectUri);

    if (tokens.refresh_token) {
      await setSetting("gmail_refresh_token", tokens.refresh_token);
    }
    if (tokens.access_token) {
      await setSetting("gmail_access_token", tokens.access_token);
      await setSetting(
        "gmail_token_expiry",
        String(Date.now() + tokens.expires_in * 1000)
      );
    }

    // Store the authenticated user's email address
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (userInfoRes.ok) {
      const userInfo = await userInfoRes.json();
      if (userInfo.email) await setSetting("gmail_user_email", userInfo.email);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("Gmail OAuth callback error:", msg);
    return NextResponse.redirect(
      `${origin}/dashboard/email?error=token_exchange_failed&detail=${encodeURIComponent(msg)}`
    );
  }

  return NextResponse.redirect(`${origin}/dashboard/email?connected=true`);
}
