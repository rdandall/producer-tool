import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db/settings";

export async function GET() {
  const raw = await getSetting("email_task_filter_addresses");
  const addresses: string[] = raw ? JSON.parse(raw) : [];
  return NextResponse.json({ addresses });
}

export async function POST(req: NextRequest) {
  const { addresses } = await req.json();
  if (!Array.isArray(addresses)) {
    return NextResponse.json({ error: "addresses must be an array" }, { status: 400 });
  }
  await setSetting("email_task_filter_addresses", JSON.stringify(addresses));
  return NextResponse.json({ success: true });
}
