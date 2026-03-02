import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getGoogleAuthUrl } from "@/lib/google-calendar";

export async function GET() {
  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const redirectUri = `${protocol}://${host}/api/auth/google/callback`;

  const url = getGoogleAuthUrl(redirectUri);
  return NextResponse.redirect(url);
}
