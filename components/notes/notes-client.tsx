"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { NotesListPanel } from "./notes-list-panel";
import { DictationPanel } from "./dictation-panel";
import { DocumentEditor } from "./document-editor";
import { SendPanel } from "./send-panel";
import { createNoteAction, updateNoteAction } from "@/app/actions";
import type { Note, NoteType, NoteLink, ExtractedTask } from "@/lib/db/notes";

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
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [editorState, setEditorState] = useState<EditorState>("idle");
  const [isSaving, setIsSaving] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // The current document state (might not be saved yet)
  const [currentContent, setCurrentContent] = useState("");
  const [currentTitle, setCurrentTitle] = useState("");
  const [currentLinks, setCurrentLinks] = useState<NoteLink[]>([]);
  const [currentExtractedTasks, setCurrentExtractedTasks] = useState<ExtractedTask[]>([]);
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);

  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── New blank note ──────────────────────────────────────────────────────
  function handleNew() {
    setSelectedNote(null);
    setCurrentNoteId(null);
    setCurrentContent("");
    setCurrentTitle("");
    setCurrentLinks([]);
    setCurrentExtractedTasks([]);
    setEditorState("idle");
  }

  // ── Select existing note ────────────────────────────────────────────────
  function handleSelectNote(note: Note) {
    setSelectedNote(note);
    setCurrentNoteId(note.id);
    setCurrentContent(note.content ?? "");
    setCurrentTitle(note.title);
    setCurrentLinks(note.links ?? []);
    setCurrentExtractedTasks(note.extracted_tasks ?? []);
    setSelectedProjectId(note.project_id);
    setEditorState(note.content ? "ready" : "idle");
  }

  // ── AI Generate ─────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async (rawInput: string, type: NoteType) => {
    setEditorState("generating");

    // Build project context if a project is selected
    const projectContext = selectedProjectId
      ? projects.find((p) => p.id === selectedProjectId)
      : null;

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
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Generation failed");
      }

      const { title, content, extractedTasks } = await res.json();

      setCurrentTitle(title);
      setCurrentContent(content);
      setCurrentExtractedTasks(extractedTasks ?? []);
      setEditorState("ready");

      // Save to DB
      const noteId = await createNoteAction({
        title,
        type,
        raw_input: rawInput,
        content,
        project_id: selectedProjectId,
      });
      setCurrentNoteId(noteId);

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
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        projects: projectContext
          ? { id: projectContext.id, title: projectContext.title, client: projectContext.client, color: "#3b82f6" }
          : null,
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
  }, [selectedProjectId, projects]);

  // ── Save content changes (debounced) ────────────────────────────────────
  async function handleContentChange(content: string) {
    setCurrentContent(content);
    if (!currentNoteId) return;

    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    setIsSaving(true);
    saveTimeout.current = setTimeout(async () => {
      try {
        await updateNoteAction(currentNoteId, { content });
        setNotes((prev) =>
          prev.map((n) =>
            n.id === currentNoteId
              ? { ...n, content, updated_at: new Date().toISOString() }
              : n
          )
        );
      } finally {
        setIsSaving(false);
      }
    }, 800);
  }

  // ── Save links ───────────────────────────────────────────────────────────
  async function handleLinksChange(links: NoteLink[]) {
    setCurrentLinks(links);
    if (!currentNoteId) return;
    try {
      await updateNoteAction(currentNoteId, { links });
      setNotes((prev) =>
        prev.map((n) =>
          n.id === currentNoteId ? { ...n, links } : n
        )
      );
    } catch {
      toast.error("Failed to save links");
    }
  }

  const showRightPanel = editorState === "ready" || (editorState === "idle" && !!currentNoteId);

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left panel: notes list */}
      <NotesListPanel
        notes={notes}
        selectedId={currentNoteId}
        onSelect={handleSelectNote}
        onNew={handleNew}
      />

      {/* Center: dictation + editor */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 h-14 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <FileText className="w-4 h-4 text-primary" />
            <h1 className="text-sm font-semibold text-foreground">
              {currentTitle || "Notes & Briefs"}
            </h1>
          </div>
          <button
            onClick={handleNew}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50 hover:text-foreground transition-colors border border-border/40 hover:border-border px-2.5 py-1.5"
          >
            <Plus className="w-3 h-3" />
            New
          </button>
        </div>

        {/* Dictation panel — always visible */}
        <DictationPanel
          onGenerate={handleGenerate}
          isGenerating={editorState === "generating"}
          projectOptions={projects}
          selectedProjectId={selectedProjectId}
          onProjectChange={setSelectedProjectId}
          defaultDocType={defaultDocType}
        />

        {/* Document editor / states */}
        <div className="flex-1 flex flex-col overflow-hidden">
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
                <p className="text-xs text-muted-foreground/35">
                  Select a note from the left, or dictate new notes above
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Right panel: export, links, email, tasks */}
      <AnimatePresence>
        {(editorState === "ready" || showRightPanel) && (
          <motion.div
            key="send-panel"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
            className="flex overflow-hidden"
          >
            <SendPanel
              noteId={currentNoteId ?? ""}
              title={currentTitle}
              content={currentContent}
              links={currentLinks}
              extractedTasks={currentExtractedTasks}
              onLinksChange={handleLinksChange}
              projects={projects}
              selectedProjectId={selectedProjectId}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
