import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export interface Contact {
  name: string | null;
  email: string;
}

export async function GET() {
  const supabase = await createClient();
  const contacts: Contact[] = [];
  const seen = new Set<string>();

  // Project contacts first — editors and clients are the most relevant recipients
  const { data: projects } = await supabase
    .from("projects")
    .select("editor_email, editor_name, client_email, client");

  for (const p of projects ?? []) {
    if (p.editor_email && !seen.has(p.editor_email.toLowerCase())) {
      seen.add(p.editor_email.toLowerCase());
      contacts.push({ name: p.editor_name || null, email: p.editor_email });
    }
    if (p.client_email && !seen.has(p.client_email.toLowerCase())) {
      seen.add(p.client_email.toLowerCase());
      contacts.push({ name: p.client || null, email: p.client_email });
    }
  }

  // Gmail senders — people who have emailed you
  const { data: emails } = await supabase
    .from("emails")
    .select("from_email, from_name")
    .eq("is_sent", false)
    .order("received_at", { ascending: false })
    .limit(500);

  for (const e of emails ?? []) {
    if (e.from_email && !seen.has(e.from_email.toLowerCase())) {
      seen.add(e.from_email.toLowerCase());
      contacts.push({ name: e.from_name || null, email: e.from_email });
    }
  }

  // Named contacts first, then alphabetical
  contacts.sort((a, b) => {
    if (a.name && !b.name) return -1;
    if (!a.name && b.name) return 1;
    return (a.name ?? a.email).localeCompare(b.name ?? b.email);
  });

  return NextResponse.json({ contacts });
}
