"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Link2, Plus, Trash2, CheckSquare,
  ChevronDown, ChevronUp, ExternalLink, Send, FileText, FileType, Paperclip,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createTaskAction } from "@/app/actions";
import { toast } from "sonner";
import type { NoteLink, ExtractedTask, NoteAttachment, NoteStatus } from "@/lib/db/notes";
import { ContactAutocomplete, type Contact } from "./contact-autocomplete";
import { useLiveDictation } from "@/hooks/use-live-dictation";
import { AttachmentsSection } from "./attachments-section";

interface Props {
  noteId: string;
  title: string;
  content: string;
  links: NoteLink[];
  extractedTasks: ExtractedTask[];
  onLinksChange: (links: NoteLink[]) => void;
  onStatusChange?: (status: NoteStatus) => void;
  projects: { id: string; title: string; client: string | null }[];
  selectedProjectId: string | null;
  attachments: NoteAttachment[];
  onAttachmentsChange: (attachments: NoteAttachment[]) => void;
}

type Section = "attachments" | "export" | "links" | "email" | "tasks";

export function SendPanel({
  noteId,
  title,
  content,
  links,
  extractedTasks,
  onLinksChange,
  onStatusChange,
  projects,
  selectedProjectId,
  attachments,
  onAttachmentsChange,
}: Props) {
  void projects;

  const [openSections, setOpenSections] = useState<Set<Section>>(
    new Set(["export", "tasks"])
  );
  const [isExporting, setIsExporting] = useState<"pdf" | "docx" | null>(null);

  // Email state
  const [emailRecipients, setEmailRecipients] = useState<Contact[]>([]);
  const [emailSubject,    setEmailSubject]    = useState("");
  const [emailNote,       setEmailNote]       = useState("");
  const [isSendingEmail,  setIsSendingEmail]  = useState(false);
  const [emailSent,       setEmailSent]       = useState(false);
  const {
    cancelDictation,
    isFinalizing,
    isLiveFormatting,
    isRecording,
    toggleDictation,
  } = useLiveDictation({
    value: emailNote,
    onChange: setEmailNote,
    contextType: "email-body",
    minLiveIntervalMs: 900,
  });

  // Link state
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [newLinkUrl,   setNewLinkUrl]   = useState("");
  const [addingLink,   setAddingLink]   = useState(false);

  // Task state
  const [pushedTaskIds,  setPushedTaskIds]  = useState<Set<number>>(new Set());
  const [pushingTaskIdx, setPushingTaskIdx] = useState<number | null>(null);

  function toggleSection(section: Section) {
    if (section === "email" && openSections.has("email")) {
      cancelDictation();
    }
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }

  // ── Export ────────────────────────────────────────────────────────────────
  async function handleExport(format: "pdf" | "docx") {
    if (!content || isExporting) return;
    setIsExporting(format);
    try {
      const res = await fetch("/api/notes/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, title, format, links, noteId }),
      });

      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = format === "pdf"
        ? `${title?.replace(/[^a-z0-9]/gi, "-") ?? "document"}.html`
        : `${title?.replace(/[^a-z0-9]/gi, "-") ?? "document"}.docx`;
      a.click();
      URL.revokeObjectURL(url);

      // Mark status as saved after first export (if not already sent)
      onStatusChange?.("saved");

      toast.success(
        format === "pdf"
          ? "HTML exported — open in browser and print to PDF"
          : "Word document downloaded"
      );
    } catch {
      toast.error("Export failed");
    } finally {
      setIsExporting(null);
    }
  }

  // ── Links ─────────────────────────────────────────────────────────────────
  function addLink() {
    if (!newLinkUrl.trim()) return;
    const updated = [
      ...links,
      { label: newLinkLabel.trim() || newLinkUrl.trim(), url: newLinkUrl.trim() },
    ];
    onLinksChange(updated);
    setNewLinkLabel("");
    setNewLinkUrl("");
    setAddingLink(false);
  }

  function removeLink(idx: number) {
    onLinksChange(links.filter((_, i) => i !== idx));
  }

  // ── Email ─────────────────────────────────────────────────────────────────
  async function sendEmail() {
    if (emailRecipients.length === 0 || !content || isSendingEmail) return;
    setIsSendingEmail(true);

    // Only pass delivery/both attachment IDs
    const deliveryAttachmentIds = attachments
      .filter((a) => a.role === "delivery" || a.role === "both")
      .map((a) => a.id);

    try {
      const toAddresses = emailRecipients.map((c) => c.email);
      const res = await fetch("/api/notes/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: toAddresses,
          subject: emailSubject.trim() || `PRDCR: ${title}`,
          content,
          title,
          links,
          personalNote: emailNote.trim(),
          noteId,
          attachmentIds: deliveryAttachmentIds,
        }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? "Send failed");
      }

      setEmailSent(true);
      onStatusChange?.("sent");

      const label = toAddresses.length === 1 ? toAddresses[0] : `${toAddresses.length} recipients`;
      toast.success(`Sent to ${label}`);
      setTimeout(() => setEmailSent(false), 4000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Email failed");
    } finally {
      setIsSendingEmail(false);
    }
  }

  // ── Push task ─────────────────────────────────────────────────────────────
  async function pushTask(task: ExtractedTask, idx: number) {
    if (pushedTaskIds.has(idx) || pushingTaskIdx === idx) return;
    setPushingTaskIdx(idx);
    try {
      const fd = new FormData();
      fd.set("title",    task.title);
      fd.set("priority", task.priority);
      if (selectedProjectId) fd.set("project_id", selectedProjectId);
      if (task.dueHint) {
        const lower = task.dueHint.toLowerCase();
        if (lower.includes("today")) {
          fd.set("due_date", new Date().toISOString().split("T")[0]);
        } else if (lower.includes("tomorrow")) {
          const d = new Date(); d.setDate(d.getDate() + 1);
          fd.set("due_date", d.toISOString().split("T")[0]);
        } else if (lower.includes("friday")) {
          const d = new Date();
          while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
          fd.set("due_date", d.toISOString().split("T")[0]);
        } else if (lower.includes("monday")) {
          const d = new Date();
          while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
          fd.set("due_date", d.toISOString().split("T")[0]);
        } else if (lower.includes("end of week")) {
          const d = new Date();
          while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
          fd.set("due_date", d.toISOString().split("T")[0]);
        }
      }
      await createTaskAction(fd);
      setPushedTaskIds((prev) => new Set([...prev, idx]));
      toast.success(`Task added: "${task.title}"`);
    } catch {
      toast.error("Failed to create task");
    } finally {
      setPushingTaskIdx(null);
    }
  }

  const hasContent        = !!content;
  const deliveryCount     = attachments.filter((a) => a.role === "delivery" || a.role === "both").length;
  const hasAttachments    = attachments.length > 0;

  return (
    <div className="w-full md:w-72 shrink-0 border-l border-border overflow-auto">

      {/* Attachments Section */}
      <SectionHeader
        title={`Attachments${hasAttachments ? ` (${attachments.length})` : ""}`}
        section="attachments"
        isOpen={openSections.has("attachments")}
        onToggle={toggleSection}
        icon={<Paperclip className="w-3 h-3" />}
      />
      <AnimatePresence initial={false}>
        {openSections.has("attachments") && (
          <SectionBody noPadding>
            <AttachmentsSection
              noteId={noteId}
              attachments={attachments}
              onAttachmentsChange={onAttachmentsChange}
            />
          </SectionBody>
        )}
      </AnimatePresence>

      {/* Export Section */}
      <SectionHeader
        title="Export"
        section="export"
        isOpen={openSections.has("export")}
        onToggle={toggleSection}
      />
      <AnimatePresence initial={false}>
        {openSections.has("export") && (
          <SectionBody>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleExport("pdf")}
                disabled={!hasContent || isExporting === "pdf"}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2.5 text-[12px] font-medium border transition-all",
                  hasContent
                    ? "border-border text-foreground hover:bg-accent hover:border-foreground/20"
                    : "border-border/30 text-muted-foreground/30 cursor-not-allowed"
                )}
              >
                <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
                <div className="text-left">
                  <p className="font-medium">Export as PDF</p>
                  <p className="text-[10px] text-muted-foreground/50 font-normal">
                    {isExporting === "pdf" ? "Preparing…" : "HTML → print to PDF"}
                  </p>
                </div>
              </button>

              <button
                onClick={() => handleExport("docx")}
                disabled={!hasContent || isExporting === "docx"}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2.5 text-[12px] font-medium border transition-all",
                  hasContent
                    ? "border-border text-foreground hover:bg-accent hover:border-foreground/20"
                    : "border-border/30 text-muted-foreground/30 cursor-not-allowed"
                )}
              >
                <FileType className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <div className="text-left">
                  <p className="font-medium">Export as DOCX</p>
                  <p className="text-[10px] text-muted-foreground/50 font-normal">
                    {isExporting === "docx" ? "Preparing…" : "Open in Word or Google Docs"}
                  </p>
                </div>
              </button>
            </div>
          </SectionBody>
        )}
      </AnimatePresence>

      {/* Links Section */}
      <SectionHeader
        title={`Links${links.length > 0 ? ` (${links.length})` : ""}`}
        section="links"
        isOpen={openSections.has("links")}
        onToggle={toggleSection}
      />
      <AnimatePresence initial={false}>
        {openSections.has("links") && (
          <SectionBody>
            {links.length > 0 && (
              <div className="flex flex-col gap-1 mb-3">
                {links.map((link, idx) => (
                  <div key={idx} className="flex items-center gap-2 group border border-border/40 px-2.5 py-1.5">
                    <Link2 className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium text-foreground truncate">{link.label}</p>
                      <p className="text-[10px] text-muted-foreground/40 truncate">{link.url}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 text-muted-foreground/30 hover:text-foreground transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      <button
                        onClick={() => removeLink(idx)}
                        className="p-1 text-muted-foreground/30 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <AnimatePresence>
              {addingLink ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex flex-col gap-1.5"
                >
                  <input
                    value={newLinkLabel}
                    onChange={(e) => setNewLinkLabel(e.target.value)}
                    placeholder="Label (e.g. Frame.io Link)"
                    className="text-[11px] bg-transparent border border-border px-2.5 py-1.5 focus:outline-none focus:border-primary text-foreground placeholder:text-muted-foreground/30 transition-colors"
                  />
                  <input
                    value={newLinkUrl}
                    onChange={(e) => setNewLinkUrl(e.target.value)}
                    placeholder="URL"
                    onKeyDown={(e) => e.key === "Enter" && addLink()}
                    className="text-[11px] bg-transparent border border-border px-2.5 py-1.5 focus:outline-none focus:border-primary text-foreground placeholder:text-muted-foreground/30 transition-colors"
                  />
                  <div className="flex gap-1.5">
                    <button
                      onClick={addLink}
                      className="flex-1 text-[11px] font-medium py-1.5 bg-primary text-primary-foreground transition-colors"
                    >
                      Add Link
                    </button>
                    <button
                      onClick={() => { setAddingLink(false); setNewLinkLabel(""); setNewLinkUrl(""); }}
                      className="px-3 text-[11px] text-muted-foreground border border-border hover:border-foreground/30 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </motion.div>
              ) : (
                <button
                  onClick={() => setAddingLink(true)}
                  className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50 hover:text-foreground transition-colors py-1"
                >
                  <Plus className="w-3 h-3" />
                  Add link
                </button>
              )}
            </AnimatePresence>
          </SectionBody>
        )}
      </AnimatePresence>

      {/* Email Section */}
      <SectionHeader
        title="Send via Email"
        section="email"
        isOpen={openSections.has("email")}
        onToggle={toggleSection}
      />
      <AnimatePresence initial={false}>
        {openSections.has("email") && (
          <SectionBody>
            <div className="flex flex-col gap-2">
              <div>
                <label className="label-xs">To</label>
                <ContactAutocomplete
                  value={emailRecipients}
                  onChange={setEmailRecipients}
                />
              </div>

              <div>
                <label className="label-xs">Subject</label>
                <input
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder={`PRDCR: ${title || "Document"}`}
                  className="w-full text-[12px] bg-transparent border border-border px-2.5 py-1.5 focus:outline-none focus:border-primary text-foreground placeholder:text-muted-foreground/30 transition-colors"
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label className="label-xs mb-0">Personal note (optional)</label>
                  <div className="flex items-center gap-2">
                    {(isLiveFormatting || isFinalizing) && (
                      <span className="text-[10px] text-muted-foreground/60">
                        {isFinalizing ? "Final polish…" : "Tidying…"}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={toggleDictation}
                      disabled={isFinalizing}
                      className={cn(
                        "flex items-center gap-1 text-[10px] px-2 py-0.5 border transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
                        isRecording
                          ? "border-red-400/60 text-red-400 bg-red-400/5"
                          : "border-border/40 text-muted-foreground/50 hover:text-foreground"
                      )}
                    >
                      {isRecording ? "Stop" : "Dictate"}
                    </button>
                  </div>
                </div>
                <textarea
                  value={emailNote}
                  onChange={(e) => setEmailNote(e.target.value)}
                  readOnly={isRecording || isFinalizing}
                  placeholder="Hey James, see the brief below…"
                  rows={2}
                  className={cn(
                    "w-full text-[12px] bg-transparent border border-border px-2.5 py-1.5 focus:outline-none focus:border-primary text-foreground placeholder:text-muted-foreground/30 transition-colors resize-none",
                    (isRecording || isFinalizing) && "cursor-not-allowed text-foreground/80"
                  )}
                />
              </div>

              {/* Attachment summary for email */}
              {deliveryCount > 0 && (
                <p className="text-[10px] text-muted-foreground/50">
                  {deliveryCount} attachment{deliveryCount > 1 ? "s" : ""} will be included
                  {deliveryCount > 1 ? " (large files sent as links)" : ""}
                </p>
              )}

              <button
                onClick={sendEmail}
                disabled={emailRecipients.length === 0 || !hasContent || isSendingEmail || emailSent}
                className={cn(
                  "flex items-center justify-center gap-2 py-2 text-[12px] font-semibold transition-all",
                  emailRecipients.length > 0 && hasContent && !isSendingEmail
                    ? emailSent
                      ? "bg-green-500/20 text-green-600 border border-green-500/30"
                      : "bg-primary text-primary-foreground hover:-translate-y-px shadow-sm"
                    : "bg-muted text-muted-foreground/30 cursor-not-allowed"
                )}
              >
                <Send className="w-3.5 h-3.5" />
                {isSendingEmail ? "Sending…" : emailSent ? "Sent!" : "Send Document"}
              </button>
            </div>
          </SectionBody>
        )}
      </AnimatePresence>

      {/* Extracted Tasks Section */}
      {extractedTasks.length > 0 && (
        <>
          <SectionHeader
            title={`Detected Tasks (${extractedTasks.length})`}
            section="tasks"
            isOpen={openSections.has("tasks")}
            onToggle={toggleSection}
            accent
          />
          <AnimatePresence initial={false}>
            {openSections.has("tasks") && (
              <SectionBody>
                <p className="text-[10px] text-muted-foreground/40 mb-3">
                  Tasks detected in your notes. Push them to the Tasks section.
                </p>
                <div className="flex flex-col gap-2">
                  {extractedTasks.map((task, idx) => {
                    const isPushed  = pushedTaskIds.has(idx);
                    const isPushing = pushingTaskIdx === idx;
                    return (
                      <div
                        key={idx}
                        className={cn(
                          "flex items-start gap-2 p-2.5 border transition-all",
                          isPushed ? "border-primary/30 bg-primary/5" : "border-border/50 hover:border-border"
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium text-foreground leading-snug">
                            {task.title}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {task.assignedTo && (
                              <span className="text-[10px] text-muted-foreground/60">
                                → {task.assignedTo}
                              </span>
                            )}
                            {task.dueHint && (
                              <span className="text-[10px] text-muted-foreground/40 italic">
                                {task.dueHint}
                              </span>
                            )}
                            <span className={cn(
                              "text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5",
                              task.priority === "high"   && "bg-destructive/10 text-destructive",
                              task.priority === "medium" && "bg-amber-500/10 text-amber-600",
                              task.priority === "low"    && "bg-border/60 text-muted-foreground"
                            )}>
                              {task.priority}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => pushTask(task, idx)}
                          disabled={isPushed || isPushing}
                          className={cn(
                            "shrink-0 flex items-center gap-1 px-2 py-1 text-[10px] font-semibold transition-all",
                            isPushed
                              ? "text-primary bg-primary/10"
                              : isPushing
                              ? "text-muted-foreground/40"
                              : "text-muted-foreground/50 hover:text-primary hover:bg-primary/5 border border-transparent hover:border-primary/20"
                          )}
                          title={isPushed ? "Added to Tasks" : "Add to Tasks"}
                        >
                          <CheckSquare className="w-3 h-3" />
                          {isPushed ? "Added" : isPushing ? "…" : "Push"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </SectionBody>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function SectionHeader({
  title, section, isOpen, onToggle, accent, icon,
}: {
  title: string;
  section: Section;
  isOpen: boolean;
  onToggle: (s: Section) => void;
  accent?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={() => onToggle(section)}
      className={cn(
        "w-full flex items-center justify-between px-4 py-3 border-b border-border/50 hover:bg-accent/20 transition-colors",
        accent && "border-l-2 border-l-primary pl-3.5"
      )}
    >
      <div className="flex items-center gap-1.5">
        {icon && <span className="text-muted-foreground/40">{icon}</span>}
        <span className={cn(
          "text-[10px] uppercase tracking-[0.12em] font-semibold",
          accent ? "text-primary" : "text-muted-foreground/60"
        )}>
          {title}
        </span>
      </div>
      {isOpen
        ? <ChevronUp className="w-3 h-3 text-muted-foreground/40" />
        : <ChevronDown className="w-3 h-3 text-muted-foreground/40" />
      }
    </button>
  );
}

function SectionBody({
  children,
  noPadding = false,
}: {
  children: React.ReactNode;
  noPadding?: boolean;
}) {
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="overflow-hidden"
    >
      <div className={cn("border-b border-border/30", !noPadding && "px-4 py-3")}>
        {children}
      </div>
    </motion.div>
  );
}
