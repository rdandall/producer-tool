"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Paperclip, Upload, Trash2, FileText, Image, Video, File,
  ExternalLink, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatBytes, isImageMime, isVideoMime, type NoteAttachment, type AttachmentRole } from "@/lib/db/notes";

// ── Role chip ─────────────────────────────────────────────────────────────────

const ROLE_CYCLE: AttachmentRole[] = ["delivery", "context", "both"];
const ROLE_LABELS: Record<AttachmentRole, string> = {
  context:  "Context",
  delivery: "Delivery",
  both:     "Both",
};
const ROLE_COLORS: Record<AttachmentRole, string> = {
  context:  "text-amber-500/80 border-amber-500/30 bg-amber-500/5",
  delivery: "text-blue-500/80 border-blue-500/30 bg-blue-500/5",
  both:     "text-purple-500/80 border-purple-500/30 bg-purple-500/5",
};

// ── File icon ─────────────────────────────────────────────────────────────────

function FileIcon({ mimeType, className }: { mimeType: string; className?: string }) {
  if (isImageMime(mimeType)) return <Image className={cn("w-4 h-4", className)} />;
  if (isVideoMime(mimeType)) return <Video className={cn("w-4 h-4", className)} />;
  if (mimeType === "application/pdf") return <FileText className={cn("w-4 h-4 text-red-400", className)} />;
  return <File className={cn("w-4 h-4", className)} />;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  noteId: string;
  attachments: NoteAttachment[];
  onAttachmentsChange: (attachments: NoteAttachment[]) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AttachmentsSection({ noteId, attachments, onAttachmentsChange }: Props) {
  const [isDragging,    setIsDragging]    = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [deletingId,    setDeletingId]    = useState<string | null>(null);
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Upload ──────────────────────────────────────────────────────────────
  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setUploadingCount((c) => c + fileArray.length);

    for (const file of fileArray) {
      const fd = new FormData();
      fd.append("file",   file);
      fd.append("noteId", noteId);

      try {
        const res = await fetch("/api/notes/attachments", {
          method: "POST",
          body: fd,
        });

        if (!res.ok) {
          const err = await res.json() as { error?: string };
          toast.error(err.error ?? `Failed to upload ${file.name}`);
          continue;
        }

        const { attachment } = await res.json() as { attachment: NoteAttachment };
        onAttachmentsChange([...attachments, attachment]);

        // Fire-and-forget extraction (only for images and text files)
        if (attachment.mime_type.startsWith("image/") || attachment.mime_type.startsWith("text/")) {
          fetch("/api/notes/attachments/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ attachmentId: attachment.id }),
          }).catch(() => {/* ignore — extraction is best-effort */});
        }
      } catch {
        toast.error(`Failed to upload ${file.name}`);
      } finally {
        setUploadingCount((c) => Math.max(0, c - 1));
      }
    }
  }, [noteId, attachments, onAttachmentsChange]);

  // ── Delete ──────────────────────────────────────────────────────────────
  async function handleDelete(attachmentId: string) {
    if (deletingId) return;
    setDeletingId(attachmentId);
    try {
      const res = await fetch(`/api/notes/attachments?id=${attachmentId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      onAttachmentsChange(attachments.filter((a) => a.id !== attachmentId));
      toast.success("Attachment removed");
    } catch {
      toast.error("Failed to remove attachment");
    } finally {
      setDeletingId(null);
    }
  }

  // ── Role cycle ──────────────────────────────────────────────────────────
  async function cycleRole(attachment: NoteAttachment) {
    if (updatingRoleId) return;
    const currentIdx = ROLE_CYCLE.indexOf(attachment.role);
    const nextRole   = ROLE_CYCLE[(currentIdx + 1) % ROLE_CYCLE.length];

    setUpdatingRoleId(attachment.id);
    try {
      const res = await fetch(`/api/notes/attachments?id=${attachment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      if (!res.ok) throw new Error("Role update failed");
      onAttachmentsChange(
        attachments.map((a) => a.id === attachment.id ? { ...a, role: nextRole } : a)
      );
    } catch {
      toast.error("Failed to update role");
    } finally {
      setUpdatingRoleId(null);
    }
  }

  // ── Signed URL for preview/download ─────────────────────────────────────
  async function openAttachment(attachmentId: string) {
    try {
      const res = await fetch(`/api/notes/attachments?id=${attachmentId}`);
      if (!res.ok) throw new Error();
      const { url } = await res.json() as { url: string };
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Could not open attachment");
    }
  }

  // ── Drag & drop ─────────────────────────────────────────────────────────
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }
  function handleDragLeave() {
    setIsDragging(false);
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      void uploadFiles(e.dataTransfer.files);
    }
  }

  const isUploading = uploadingCount > 0;

  return (
    <div className="flex flex-col gap-0">
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative border border-dashed transition-colors cursor-pointer",
          isDragging
            ? "border-primary/60 bg-primary/5"
            : "border-border/40 hover:border-border/60 hover:bg-accent/20"
        )}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && void uploadFiles(e.target.files)}
          accept="image/*,video/*,audio/*,text/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
        />
        <div className="flex items-center gap-2 px-3 py-2.5 text-[11px] text-muted-foreground/50">
          {isUploading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              <span className="text-primary">Uploading {uploadingCount} file{uploadingCount > 1 ? "s" : ""}…</span>
            </>
          ) : (
            <>
              <Upload className="w-3.5 h-3.5 shrink-0" />
              <span>Drop files here or click to upload</span>
            </>
          )}
        </div>
      </div>

      {/* Attachment tiles */}
      <AnimatePresence initial={false}>
        {attachments.map((att) => (
          <motion.div
            key={att.id}
            layout
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: deletingId === att.id ? 0.4 : 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="group flex items-start gap-2.5 px-3 py-2.5 border-b border-border/30 hover:bg-accent/10 transition-colors"
          >
            {/* File type icon */}
            <div className="shrink-0 mt-0.5 text-muted-foreground/40">
              <FileIcon mimeType={att.mime_type} />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-medium text-foreground truncate leading-snug">
                {att.filename}
              </p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-[10px] text-muted-foreground/40">
                  {formatBytes(att.size_bytes)}
                </span>

                {/* Role chip — click to cycle */}
                <button
                  onClick={() => void cycleRole(att)}
                  disabled={updatingRoleId === att.id}
                  title="Click to change role: Context (AI only) → Delivery (sent/exported) → Both"
                  className={cn(
                    "text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 border transition-all",
                    ROLE_COLORS[att.role],
                    updatingRoleId === att.id && "opacity-40 cursor-not-allowed"
                  )}
                >
                  {ROLE_LABELS[att.role]}
                </button>

                {att.extracted_text && (
                  <span className="text-[9px] text-muted-foreground/30 italic">indexed</span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => void openAttachment(att.id)}
                className="p-1 text-muted-foreground/30 hover:text-foreground transition-colors"
                title="Open"
              >
                <ExternalLink className="w-3 h-3" />
              </button>
              <button
                onClick={() => void handleDelete(att.id)}
                disabled={!!deletingId}
                className="p-1 text-muted-foreground/30 hover:text-destructive transition-colors disabled:opacity-30"
                title="Remove"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Role legend */}
      {attachments.length > 0 && (
        <div className="px-3 py-2 flex flex-wrap gap-x-3 gap-y-0.5">
          <span className="text-[9px] text-muted-foreground/30">
            <span className="text-amber-500/60">Context</span> = AI only ·{" "}
            <span className="text-blue-500/60">Delivery</span> = sent/exported ·{" "}
            <span className="text-purple-500/60">Both</span> = AI + sent
          </span>
        </div>
      )}

      {/* Empty state */}
      {attachments.length === 0 && !isUploading && (
        <div className="flex items-center gap-1.5 px-3 py-2 text-[10px] text-muted-foreground/30">
          <Paperclip className="w-3 h-3 shrink-0" />
          No attachments yet
        </div>
      )}
    </div>
  );
}
