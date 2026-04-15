import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const BUCKET = "note-attachments";
const MAX_TEXT_BYTES = 50_000; // ~50 KB of extracted text stored per attachment

/**
 * POST /api/notes/attachments/extract
 * Body: { attachmentId: string }
 *
 * Extracts text from an attachment and stores it in note_attachments.extracted_text.
 * Called fire-and-forget from the client after a successful upload.
 * Supported:
 *   - image/* → Claude vision OCR
 *   - text/* → direct read
 *   - Everything else → skipped (no extraction)
 */
export async function POST(req: NextRequest) {
  try {
    const rate = checkRateLimit(req, "notes.attachments.extract", 20, 60_000);
    if (!rate.ok) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const body = await req.json() as { attachmentId?: string };
    const attachmentId = body.attachmentId?.trim();
    if (!attachmentId) {
      return NextResponse.json({ error: "attachmentId is required" }, { status: 400 });
    }

    const supabase = await createClient();

    // Fetch attachment record
    const { data: attachment, error: fetchError } = await supabase
      .from("note_attachments")
      .select("*")
      .eq("id", attachmentId)
      .single();

    if (fetchError || !attachment) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    // Skip if already extracted
    if (attachment.extracted_text) {
      return NextResponse.json({ skipped: true, reason: "already extracted" });
    }

    const { mime_type, storage_path } = attachment;
    let extractedText: string | null = null;

    // ── Image → Claude vision OCR ───────────────────────────────────────────
    if (mime_type.startsWith("image/")) {
      // Download image from Storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from(BUCKET)
        .download(storage_path);

      if (downloadError || !fileData) {
        console.warn("Attachment download failed:", downloadError?.message);
        return NextResponse.json({ skipped: true, reason: "download failed" });
      }

      const arrayBuffer = await fileData.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");

      // Validate MIME type is supported by Claude vision
      const supportedImageTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
      if (!supportedImageTypes.includes(mime_type)) {
        return NextResponse.json({ skipped: true, reason: "unsupported image type for OCR" });
      }

      const msg = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mime_type as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                  data: base64,
                },
              },
              {
                type: "text",
                text: "Extract all visible text from this image. Return only the extracted text, preserving layout where possible. If there is no text, return an empty string.",
              },
            ],
          },
        ],
      });

      const textBlock = msg.content.find((b) => b.type === "text");
      extractedText = textBlock && textBlock.type === "text" ? textBlock.text.trim() : null;
    }

    // ── Plain text files → direct read ──────────────────────────────────────
    else if (mime_type.startsWith("text/")) {
      const { data: fileData, error: downloadError } = await supabase.storage
        .from(BUCKET)
        .download(storage_path);

      if (!downloadError && fileData) {
        const text = await fileData.text();
        extractedText = text.slice(0, MAX_TEXT_BYTES).trim() || null;
      }
    }

    // ── Other types — skip ───────────────────────────────────────────────────
    else {
      return NextResponse.json({ skipped: true, reason: "unsupported mime type" });
    }

    // Store extracted text (even if null — marks it as processed)
    const safeText = extractedText?.slice(0, MAX_TEXT_BYTES) ?? "";
    const { error: updateError } = await supabase
      .from("note_attachments")
      .update({ extracted_text: safeText || null })
      .eq("id", attachmentId);

    if (updateError) {
      console.error("Failed to store extracted text:", updateError.message);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      charCount: safeText.length,
    });
  } catch (err) {
    console.error("notes/attachments/extract error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Extraction failed" },
      { status: 500 }
    );
  }
}
