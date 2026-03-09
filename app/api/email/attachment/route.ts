import { NextRequest, NextResponse } from "next/server";
import { getValidGmailToken } from "@/lib/gmail";

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export async function GET(req: NextRequest) {
  const token = await getValidGmailToken();
  if (!token) {
    return NextResponse.json({ error: "Not connected to Gmail" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const messageId = searchParams.get("messageId");
  const attachmentId = searchParams.get("attachmentId");
  const filename = searchParams.get("filename") ?? "attachment";
  const mimeType = searchParams.get("mimeType") ?? "application/octet-stream";

  if (!messageId || !attachmentId) {
    return NextResponse.json({ error: "Missing messageId or attachmentId" }, { status: 400 });
  }

  const res = await fetch(
    `${GMAIL_BASE}/messages/${messageId}/attachments/${attachmentId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) {
    return NextResponse.json({ error: "Failed to fetch attachment" }, { status: 502 });
  }

  const data = await res.json();
  const base64 = (data.data as string).replace(/-/g, "+").replace(/_/g, "/");
  const buffer = Buffer.from(base64, "base64");

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": mimeType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
