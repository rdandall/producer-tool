import { NextResponse } from "next/server";
import { disconnectGoogleCalendar } from "@/lib/db/calendar";

export async function POST() {
  try {
    await disconnectGoogleCalendar();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("google disconnect:", error);
    return NextResponse.json({ error: "Failed to disconnect Google Calendar" }, { status: 500 });
  }
}
