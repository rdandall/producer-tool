import { NextResponse } from "next/server";
import { GOOGLE_SCOPES, getGoogleOauthClient } from "@/lib/google";
import { createOauthState } from "@/lib/oauth-state";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${url.origin}/api/google/callback`;
  const state = await createOauthState("google-calendar-legacy");

  const oauth = getGoogleOauthClient(redirectUri);
  const authUrl = oauth.generateAuthUrl({
    access_type: "offline",
    scope: GOOGLE_SCOPES,
    prompt: "consent",
    include_granted_scopes: true,
    state,
  });

  return NextResponse.redirect(authUrl);
}
