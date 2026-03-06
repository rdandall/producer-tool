import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getGmailAuthUrl } from "@/lib/gmail";

export async function GET() {
  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const redirectUri = `${protocol}://${host}/api/auth/gmail/callback`;

  const url = getGmailAuthUrl(redirectUri);
  return NextResponse.redirect(url);
}
