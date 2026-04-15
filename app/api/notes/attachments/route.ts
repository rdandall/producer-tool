import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { defaultRoleForMime } from "@/lib/db/notes";

const BUCKET = "note-attachments";
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB per file
const ALLOWED_MIME_PREFIXES = [
  "image/",
  "video/",
  "audio/",
  "text/",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument",
  "application/vnd.ms-",
];

function isMimeAllowed(mime: string): boolean {
  return ALLOWED_MIME_PREFIXES.some((p) => mime.startsWith(p));
}

// ── POST /api/notes/attachments — upload a file ──────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const rate = checkRateLimit(req, "notes.attachments.upload", 30, 60_000);
    if (!rate.ok) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const formData = await req.formData();
    const file    = formData.get("file") as File | null;
    const noteId  = (formData.get("noteId") as string | null)?.trim();
    const roleRaw = (formData.get("role") as string | null)?.trim();

    if (!file || !noteId) {
      return NextResponse.json({ error: "file and noteId are required" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File exceeds 25 MB limit" }, { status: 413 });
    }
    if (!isMimeAllowed(file.type)) {
      return NextResponse.json({ error: `File type '${file.type}' is not supported` }, { status: 415 });
    }

    const role = (roleRaw === "context" || roleRaw === "delivery" || roleRaw === "both")
      ? roleRaw
      : defaultRoleForMime(file.type);

    const supabase = await createClient();

    // Verify note exists and belongs to this user's workspace
    const { data: noteRow, error: noteError } = await supabase
      .from("notes")
      .select("id")
      .eq("id", noteId)
      .single();
    if (noteError || !noteRow) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    // Sanitize filename
    const safeName = file.name.replace(/[^a-zA-Z0-9._\-]/g, "_").slice(0, 200);
    const uuid = crypto.randomUUID();
    const storagePath = `${noteId}/${uuid}-${safeName}`;

    // Upload to Supabase Storage
    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, arrayBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError.message);
      // Provide a helpful error if the bucket doesn't exist yet
      if (uploadError.message.includes("Bucket not found") || uploadError.message.includes("bucket")) {
        return NextResponse.json(
          {
            error:
              "Storage bucket 'note-attachments' not found. Create it in Supabase Dashboard → Storage → New bucket (private, name: note-attachments).",
          },
          { status: 500 }
        );
      }
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // Insert attachment record
    const { data: attachment, error: dbError } = await supabase
      .from("note_attachments")
      .insert({
        note_id:      noteId,
        storage_path: storagePath,
        filename:     file.name.slice(0, 255),
        mime_type:    file.type,
        size_bytes:   file.size,
        role,
      })
      .select("*")
      .single();

    if (dbError) {
      // Clean up storage if DB insert failed
      await supabase.storage.from(BUCKET).remove([storagePath]);
      throw new Error(dbError.message);
    }

    return NextResponse.json({ attachment });
  } catch (err) {
    console.error("notes/attachments POST error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}

// ── DELETE /api/notes/attachments?id=... — remove an attachment ──────────────
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const attachmentId = searchParams.get("id")?.trim();
    if (!attachmentId) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const supabase = await createClient();

    // Fetch the attachment record to get the storage path
    const { data: attachment, error: fetchError } = await supabase
      .from("note_attachments")
      .select("storage_path")
      .eq("id", attachmentId)
      .single();

    if (fetchError || !attachment) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    // Remove from Storage
    const { error: storageError } = await supabase.storage
      .from(BUCKET)
      .remove([attachment.storage_path]);

    if (storageError) {
      console.warn("Storage remove warning:", storageError.message);
      // Continue — orphaned storage file is better than orphaned DB record
    }

    // Remove from DB
    const { error: dbError } = await supabase
      .from("note_attachments")
      .delete()
      .eq("id", attachmentId);

    if (dbError) throw new Error(dbError.message);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("notes/attachments DELETE error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Delete failed" },
      { status: 500 }
    );
  }
}

// ── PATCH /api/notes/attachments?id=... — update role ───────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const attachmentId = searchParams.get("id")?.trim();
    if (!attachmentId) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const body = await req.json() as { role?: string };
    const role = body.role;
    if (role !== "context" && role !== "delivery" && role !== "both") {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("note_attachments")
      .update({ role })
      .eq("id", attachmentId);

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("notes/attachments PATCH error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Update failed" },
      { status: 500 }
    );
  }
}

// ── GET /api/notes/attachments — two modes:
//   ?id=...     → return signed URL for a single attachment
//   ?noteId=... → return all attachments for a note ─────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const attachmentId = searchParams.get("id")?.trim();
    const noteId       = searchParams.get("noteId")?.trim();

    const supabase = await createClient();

    // ── List attachments for a note ──────────────────────────────────────
    if (noteId && !attachmentId) {
      const { data, error } = await supabase
        .from("note_attachments")
        .select("*")
        .eq("note_id", noteId)
        .order("created_at", { ascending: true });

      if (error) throw new Error(error.message);
      return NextResponse.json({ attachments: data ?? [] });
    }

    // ── Get signed URL for single attachment ─────────────────────────────
    if (!attachmentId) {
      return NextResponse.json({ error: "id or noteId is required" }, { status: 400 });
    }

    const { data: attachment, error: fetchError } = await supabase
      .from("note_attachments")
      .select("storage_path, filename, mime_type")
      .eq("id", attachmentId)
      .single();

    if (fetchError || !attachment) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    const { data: signedData, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(attachment.storage_path, 3600); // 1-hour URL

    if (signError || !signedData) {
      throw new Error(signError?.message ?? "Failed to create signed URL");
    }

    return NextResponse.json({
      url:       signedData.signedUrl,
      filename:  attachment.filename,
      mime_type: attachment.mime_type,
    });
  } catch (err) {
    console.error("notes/attachments GET error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
