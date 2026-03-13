import { NextRequest, NextResponse } from "next/server";
import { extractTasksFromEmail } from "@/lib/email-task-extraction";
import { updateTaskSuggestionStatus } from "@/lib/db/emails";

/** POST: Extract task suggestions from an email body */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { emailId, emailContent, subject, fromEmail, projects } = body;

  if (!emailId || !emailContent) {
    return NextResponse.json({ error: "Missing emailId or emailContent" }, { status: 400 });
  }

  try {
    const inserted = await extractTasksFromEmail({
      emailId: emailId as string,
      emailContent: emailContent as string,
      subject: subject as string | null,
      fromEmail: fromEmail as string | null,
      projects: projects ?? [],
    });

    return NextResponse.json({ inserted });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Task extraction failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** PATCH: Approve or dismiss a task suggestion */
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, status } = body;

  if (!id || !["approved", "dismissed"].includes(status)) {
    return NextResponse.json({ error: "Invalid id or status" }, { status: 400 });
  }

  await updateTaskSuggestionStatus(id as string, status as "approved" | "dismissed");
  return NextResponse.json({ success: true });
}
