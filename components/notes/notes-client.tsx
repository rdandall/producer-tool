"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Plus, Sparkles, ChevronLeft, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { NotesListPanel } from "./notes-list-panel";
import { DictationPanel } from "./dictation-panel";
import { DocumentEditor } from "./document-editor";
import { SendPanel } from "./send-panel";
import { createNoteAction, updateNoteAction, createNoteVersionAction } from "@/app/actions";
import type { Note, NoteType, NoteLink, ExtractedTask, NoteAttachment, NoteStatus } from "@/lib/db/notes";

interface Project {
  id: string;
  title: string;
  client: string | null;
}

interface Props {
  initialNotes: Note[];
  projects: Project[];
  defaultDocType?: NoteType;
}

type EditorState = "idle" | "generating" | "ready";

export function NotesClient({ initialNotes, projects, defaultDocType = "brief" }: Props) {
  const [notes,            setNotes]            = useState<Note[]>(initialNotes);
  const [selectedNote,     setSelectedNote]     = useState<Note | null>(null);
  const [editorState,      setEditorState]      = useState<EditorState>("idle");
  const [isSaving,         setIsSaving]         = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // Current document state
  const [currentContent,        setCurrentContent]        = useState("");
  const [currentTitle,          setCurrentTitle]          = useState("");
  const [currentLinks,          setCurrentLinks]          = useState<NoteLink[]>([]);
  const [currentExtractedTasks, setCurrentExtractedTasks] = useState<ExtractedTask[]>([]);
  const [currentNoteId,         setCurrentNoteId]         = useState<string | null>(null);
  const [currentStatus,         setCurrentStatus]         = useState<NoteStatus>("draft");
  const [currentAttachments,    setCurrentAttachments]    = useState<NoteAttachment[]>([]);

  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mobile panel navigation
  const [mobilePanelView, setMobilePanelView] = useState<"list" | "editor" | "send">("list");

  // ── New blank note ─────────────────────────────────────────────────────────
  function handleNew() {
    setSelectedNote(null);
    setCurrentNoteId(null);
    setCurrentContent("");
    setCurrentTitle("");
    setCurrentLinks([]);
    setCurrentExtractedTasks([]);
    setCurrentStatus("draft");
    setCurrentAttachments([]);
    setEditorState("idle");
    setMobilePanelView("editor");
  }

  // ── Select existing note ───────────────────────────────────────────────────
  function handleSelectNote(note: Note) {
    setSelectedNote(note);
    setCurrentNoteId(note.id);
    setCurrentContent(note.content ?? "");
    setCurrentTitle(note.title);
    setCurrentLinks(note.links ?? []);
    setCurrentExtractedTasks(note.extracted_tasks ?? []);
    setSelectedProjectId(note.project_id);
    setCurrentStatus(note.status ?? "draft");
    setCurrentAttachments(note.attachments ?? []);
    setEditorState(note.content ? "ready" : "idle");
    setMobilePanelView("editor");

    // Lazy-load attachments for existing notes
    if (note.id) {
      fetch(`/api/notes/attachments?noteId=${note.id}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { attachments?: NoteAttachment[] } | null) => {
          if (data?.attachments) setCurrentAttachments(data.attachments);
        })
        .catch(() => {/* non-fatal */});
    }
  }

  // ── AI Generate ────────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async (rawInput: string, type: NoteType) => {
    setEditorState("generating");

    const projectContext = selectedProjectId
      ? projects.find((p) => p.id === selectedProjectId)
      : null;

    // Build attachment context: text from context/both-role attachments
    const attachmentContext = currentAttachments
      .filter((a) => (a.role === "context" || a.role === "both") && a.extracted_text)
      .map((a) => ({ filename: a.filename, text: a.extracted_text! }));

    try {
      const res = await fetch("/api/notes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawInput,
          type,
          projectContext: projectContext
            ? { title: projectContext.title, client: projectContext.client }
            : undefined,
          attachmentContext: attachmentContext.length > 0 ? attachmentContext : undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? "Generation failed");
      }

      const { title, content, extractedTasks } = await res.json() as {
        title: string;
        content: string;
        extractedTasks: ExtractedTask[];
      };

      setCurrentTitle(title);
      setCurrentContent(content);
      setCurrentExtractedTasks(extractedTasks ?? []);
      setCurrentStatus("draft");
      setEditorState("ready");

      // Save to DB
      const noteId = await createNoteAction({
        title,
        type,
        raw_input: rawInput,
        content,
        project_id: selectedProjectId,
        status: "draft",
      });
      setCurrentNoteId(noteId);

      // Re-associate existing attachments to the new note (if any were uploaded pre-generate)
      // (Currently attachments are uploaded after note exists, so this is future-proofing)

      // Update local notes list
      const newNote: Note = {
        id: noteId,
        title,
        type,
        raw_input: rawInput,
        content,
        project_id: selectedProjectId,
        links: [],
        extracted_tasks: extractedTasks ?? [],
        status: "draft",
        last_output_type: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        projects: projectContext
          ? { id: projectContext.id, title: projectContext.title, client: projectContext.client, color: "#3b82f6" }
          : null,
        attachments: [],
      };
      setNotes((prev) => [newNote, ...prev]);
      setSelectedNote(newNote);

      if (extractedTasks?.length > 0) {
        toast.success(
          `Document created · ${extractedTasks.length} task${extractedTasks.length > 1 ? "s" : ""} detected`,
          { description: "Check the right panel to push tasks" }
        );
      } else {
        toast.success("Document generated");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
      setEditorState("idle");
    }
  }, [selectedProjectId, projects, currentAttachments]);

  // ── Save content (debounced) ───────────────────────────────────────────────
  async function handleContentChange(content: string) {
    setCurrentContent(content);
    if (!currentNoteId) return;

    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    setIsSaving(true);
    saveTimeout.current = setTimeout(async () => {
      try {
        await updateNoteAction(currentNoteId, { content, status: "saved" });
        setCurrentStatus("saved");
        setNotes((prev) =>
          prev.map((n) =>
            n.id === currentNoteId
              ? { ...n, content, status: "saved", updated_at: new Date().toISOString() }
              : n
          )
        );
        // Create a snapshot on manual save
        void createNoteVersionAction(currentNoteId, currentTitle, content, "manual-save");
      } finally {
        setIsSaving(false);
      }
    }, 800);
  }

  // ── Save links ─────────────────────────────────────────────────────────────
  async function handleLinksChange(links: NoteLink[]) {
    setCurrentLinks(links);
    if (!currentNoteId) return;
    try {
      await updateNoteAction(currentNoteId, { links });
      setNotes((prev) =>
        prev.map((n) => n.id === currentNoteId ? { ...n, links } : n)
      );
    } catch {
      toast.error("Failed to save links");
    }
  }

  // ── Status change (from send panel) ───────────────────────────────────────
  async function handleStatusChange(status: NoteStatus) {
    setCurrentStatus(status);
    if (!currentNoteId) return;

    const outputType: "email" | "pdf" | "docx" | null =
      status === "sent" ? "email" : null;

    try {
      await updateNoteAction(currentNoteId, {
        status,
        ...(outputType ? { last_output_type: outputType } : {}),
      });
      setNotes((prev) =>
        prev.map((n) =>
          n.id === currentNoteId
            ? { ...n, status, updated_at: new Date().toISOString() }
            : n
        )
      );

      // Create version snapshot on send/export
      if (status === "sent" || status === "saved") {
        void createNoteVersionAction(
          currentNoteId,
          currentTitle,
          currentContent,
          status === "sent" ? "send" : "export"
        );
      }
    } catch {
      // Non-fatal — status updates are best-effort
    }
  }

  const showRightPanel = editorState === "ready" || (editorState === "idle" && !!currentNoteId);

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left panel: notes list */}
      <div className={cn(
        "flex-1 md:flex-none overflow-hidden",
        mobilePanelView !== "list" ? "hidden md:flex" : "flex"
      )}>
        <NotesListPanel
          notes={notes}
          selectedId={currentNoteId}
          onSelect={handleSelectNote}
          onNew={handleNew}
          onSearchResults={(results) => {
            // When search returns results, update the displayed list
            // (does not replace the full notes array — only list display)
            setNotes((prev) => {
              // Merge: keep any notes not in results that might be locally mutated
              const resultIds = new Set(results.map((r) => r.id));
              const local     = prev.filter((n) => !resultIds.has(n.id));
              return [...results, ...local].sort(
                (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
              );
            });
          }}
        />
      </div>

      {/* Center: dictation + editor */}
      <div className={cn(
        "flex-1 flex flex-col overflow-hidden min-w-0",
        mobilePanelView === "editor" ? "flex" : "hidden md:flex"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 h-14 border-b border-border shrink-0">
          <button
            onClick={() => setMobilePanelView("list")}
            className="md:hidden flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
            Notes
          </button>
          <div className="hidden md:flex items-center gap-3">
            <FileText className="w-4 h-4 text-primary" />
            <h1 className="text-sm font-semibold text-foreground truncate">
              {currentTitle || "Notes & Briefs"}
            </h1>
          </div>
          <h1 className="md:hidden text-sm font-semibold text-foreground truncate flex-1 text-center px-2">
            {currentTitle || "Notes & Briefs"}
          </h1>
          <div className="flex items-center gap-1.5">
            {showRightPanel && (
              <button
                onClick={() => setMobilePanelView("send")}
                className="md:hidden flex items-center gap-1 text-[11px] text-muted-foreground/50 hover:text-foreground transition-colors border border-border/40 hover:border-border px-2 py-1.5"
              >
                <Share2 className="w-3 h-3" />
                Actions
              </button>
            )}
            <button
              onClick={handleNew}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50 hover:text-foreground transition-colors border border-border/40 hover:border-border px-2.5 py-1.5"
            >
              <Plus className="w-3 h-3" />
              New
            </button>
          </div>
        </div>

        {/* Dictation panel */}
        <DictationPanel
          onGenerate={handleGenerate}
          isGenerating={editorState === "generating"}
          projectOptions={projects}
          selectedProjectId={selectedProjectId}
          onProjectChange={setSelectedProjectId}
          defaultDocType={defaultDocType}
        />

        {/* Document editor / states */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <AnimatePresence mode="wait">
            {editorState === "generating" ? (
              <motion.div
                key="generating"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col items-center justify-center h-full gap-4 py-20"
              >
                <div className="relative">
                  <Sparkles className="w-8 h-8 text-primary animate-pulse" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">Generating your document…</p>
                  <p className="text-xs text-muted-foreground/50 mt-1">
                    Claude is structuring your notes
                    {currentAttachments.some((a) => a.role !== "delivery" && a.extracted_text)
                      ? " + reading your attachments"
                      : ""}
                  </p>
                </div>
                <div className="flex gap-1.5 mt-2">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="w-1.5 h-1.5 bg-primary rounded-full"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                    />
                  ))}
                </div>
              </motion.div>
            ) : editorState === "ready" ? (
              <DocumentEditor
                key={currentNoteId ?? "editor"}
                content={currentContent}
                onChange={handleContentChange}
                isSaving={isSaving}
                status={currentStatus}
              />
            ) : notes.length === 0 ? (
              <motion.div
                key="empty-all"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center h-full gap-4 px-8 text-center"
              >
                <FileText className="w-10 h-10 text-muted-foreground/15" />
                <div>
                  <p className="text-sm font-medium text-foreground/70">No notes yet</p>
                  <p className="text-xs text-muted-foreground/40 mt-1 max-w-xs">
                    Type or dictate your raw notes above, choose a document type, and hit Generate.
                  </p>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="select-prompt"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center h-full gap-3 px-8 text-center"
              >
                <p className="text-xs text-muted-foreground/35 hidden md:block">
                  Select a note from the left, or dictate new notes above
                </p>
                <p className="text-xs text-muted-foreground/35 md:hidden">
                  Tap Notes to browse, or dictate above
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Right panel: attachments, export, links, email, tasks */}
      <AnimatePresence>
        {(editorState === "ready" || showRightPanel) && (
          <motion.div
            key="send-panel"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "flex flex-col overflow-hidden",
              mobilePanelView === "send" ? "flex" : "hidden md:flex"
            )}
          >
            {/* Mobile back to editor */}
            <div className="md:hidden flex items-center gap-2 px-4 h-11 border-b border-border shrink-0 bg-background/80 backdrop-blur-sm">
              <button
                onClick={() => setMobilePanelView("editor")}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Back to editor
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              <SendPanel
                noteId={currentNoteId ?? ""}
                title={currentTitle}
                content={currentContent}
                links={currentLinks}
                extractedTasks={currentExtractedTasks}
                onLinksChange={handleLinksChange}
                onStatusChange={handleStatusChange}
                projects={projects}
                selectedProjectId={selectedProjectId}
                attachments={currentAttachments}
                onAttachmentsChange={setCurrentAttachments}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
