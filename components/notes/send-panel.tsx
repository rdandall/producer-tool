"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Link2, Plus, Trash2, CheckSquare,
  ChevronDown, ChevronUp, ExternalLink, Send, FileText, FileType,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createTaskAction } from "@/app/actions";
import { toast } from "sonner";
import type { NoteLink, ExtractedTask } from "@/lib/db/notes";
import { ContactAutocomplete, type Contact } from "./contact-autocomplete";

interface Props {
  noteId: string;
  title: string;
  content: string;
  links: NoteLink[];
  extractedTasks: ExtractedTask[];
  onLinksChange: (links: NoteLink[]) => void;
  projects: { id: string; title: string; client: string | null }[];
  selectedProjectId: string | null;
}

type Section = "export" | "links" | "email" | "tasks";

export function SendPanel({
  noteId,
  title,
  content,
  links,
  extractedTasks,
  onLinksChange,
  projects,
  selectedProjectId,
}: Props) {
  const [openSections, setOpenSections] = useState<Set<Section>>(
    new Set(["export", "tasks"])
  );
  const [isExporting, setIsExporting] = useState<"pdf" | "docx" | null>(null);

  // Email state
  const [emailRecipients, setEmailRecipients] = useState<Contact[]>([]);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailNote, setEmailNote] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  // Link state
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [addingLink, setAddingLink] = useState(false);

  // Task state
  const [pushedTaskIds, setPushedTaskIds] = useState<Set<number>>(new Set());
  const [pushingTaskIdx, setPushingTaskIdx] = useState<number | null>(null);

  function toggleSection(section: Section) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }

  // ── Export ──────────────────────────────────────────────────────────────
  async function handleExport(format: "pdf" | "docx") {
    if (!content || isExporting) return;
    setIsExporting(format);
    try {
      const res = await fetch("/api/notes/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, title, format, links }),
      });

      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = format === "pdf"
        ? `${title?.replace(/[^a-z0-9]/gi, "-") ?? "document"}.html`
        : `${title?.replace(/[^a-z0-9]/gi, "-") ?? "document"}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(format === "pdf" ? "HTML exported — open in browser and print to PDF" : "Word document downloaded");
    } catch {
      toast.error("Export failed");
    } finally {
      setIsExporting(null);
    }
  }

  // ── Links ───────────────────────────────────────────────────────────────
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

  // ── Email ───────────────────────────────────────────────────────────────
  async function sendEmail() {
    if (emailRecipients.length === 0 || !content || isSendingEmail) return;
    setIsSendingEmail(true);
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
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Send failed");
      }
      setEmailSent(true);
      const label = toAddresses.length === 1 ? toAddresses[0] : `${toAddresses.length} recipients`;
      toast.success(`Sent to ${label}`);
      setTimeout(() => setEmailSent(false), 4000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Email failed");
    } finally {
      setIsSendingEmail(false);
    }
  }

  // ── Push task to Tasks section ────────────────────────────────────────
  async function pushTask(task: ExtractedTask, idx: number) {
    if (pushedTaskIds.has(idx) || pushingTaskIdx === idx) return;
    setPushingTaskIdx(idx);
    try {
      const fd = new FormData();
      fd.set("title", task.title);
      fd.set("priority", task.priority);
      if (task.assignedTo) fd.set("assigned_to", task.assignedTo); // not in FormData signature, handled by updateTask
      if (selectedProjectId) fd.set("project_id", selectedProjectId);
      // Due date: parse hint
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

  const hasContent = !!content;

  return (
    <div className="w-full md:w-72 shrink-0 border-l border-border overflow-auto">
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
            {/* Existing links */}
            {links.length > 0 && (
              <div className="flex flex-col gap-1 mb-3">
                {links.map((link, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 group border border-border/40 px-2.5 py-1.5"
                  >
                    <Link2 className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium text-foreground truncate">
                        {link.label}
                      </p>
                      <p className="text-[10px] text-muted-foreground/40 truncate">
                        {link.url}
                      </p>
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

            {/* Add link form */}
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
                <label className="label-xs">Personal note (optional)</label>
                <textarea
                  value={emailNote}
                  onChange={(e) => setEmailNote(e.target.value)}
                  placeholder="Hey James, see the brief below…"
                  rows={2}
                  className="w-full text-[12px] bg-transparent border border-border px-2.5 py-1.5 focus:outline-none focus:border-primary text-foreground placeholder:text-muted-foreground/30 transition-colors resize-none"
                />
              </div>

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
                    const isPushed = pushedTaskIds.has(idx);
                    const isPushing = pushingTaskIdx === idx;

                    return (
                      <div
                        key={idx}
                        className={cn(
                          "flex items-start gap-2 p-2.5 border transition-all",
                          isPushed
                            ? "border-primary/30 bg-primary/5"
                            : "border-border/50 hover:border-border"
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
                            <span
                              className={cn(
                                "text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5",
                                task.priority === "high" && "bg-destructive/10 text-destructive",
                                task.priority === "medium" && "bg-amber-500/10 text-amber-600",
                                task.priority === "low" && "bg-border/60 text-muted-foreground"
                              )}
                            >
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

// ── Shared sub-components ───────────────────────────────────────────────────
function SectionHeader({
  title, section, isOpen, onToggle, accent,
}: {
  title: string;
  section: Section;
  isOpen: boolean;
  onToggle: (s: Section) => void;
  accent?: boolean;
}) {
  return (
    <button
      onClick={() => onToggle(section)}
      className={cn(
        "w-full flex items-center justify-between px-4 py-3 border-b border-border/50 hover:bg-accent/20 transition-colors",
        accent && "border-l-2 border-l-primary pl-3.5"
      )}
    >
      <span className={cn(
        "text-[10px] uppercase tracking-[0.12em] font-semibold",
        accent ? "text-primary" : "text-muted-foreground/60"
      )}>
        {title}
      </span>
      {isOpen
        ? <ChevronUp className="w-3 h-3 text-muted-foreground/40" />
        : <ChevronDown className="w-3 h-3 text-muted-foreground/40" />
      }
    </button>
  );
}

function SectionBody({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-border/30">
        {children}
      </div>
    </motion.div>
  );
}
