import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getGmailAuthUrl } from "@/lib/gmail";
import { createOauthState } from "@/lib/oauth-state";

export async function GET() {
  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const redirectUri = `${protocol}://${host}/api/auth/gmail/callback`;
  const state = await createOauthState("gmail-auth");

  const url = getGmailAuthUrl(redirectUri, state);
  return NextResponse.redirect(url);
}
