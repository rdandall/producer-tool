import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getGoogleOauthClient } from "@/lib/google";
import { upsertGoogleConnection } from "@/lib/db/calendar";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${url.origin}/dashboard/calendar?error=missing_code`);
  }

  try {
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${url.origin}/api/google/callback`;
    const oauth = getGoogleOauthClient(redirectUri);
    const { tokens } = await oauth.getToken(code);
    if (!tokens.access_token) {
      throw new Error("No access token returned from Google");
    }

    oauth.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: "v2", auth: oauth });
    const profile = await oauth2.userinfo.get();

    await upsertGoogleConnection({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      scope: tokens.scope || null,
      token_type: tokens.token_type || null,
      expiry_date: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
      email: profile.data.email || null,
    });

    return NextResponse.redirect(`${url.origin}/dashboard/calendar?connected=1`);
  } catch (error) {
    console.error("google callback:", error);
    return NextResponse.redirect(`${url.origin}/dashboard/calendar?error=oauth_failed`);
  }
}
