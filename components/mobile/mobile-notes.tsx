"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Plus, ChevronLeft, Share2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { DictationPanel } from "@/components/notes/dictation-panel";
import { DocumentEditor } from "@/components/notes/document-editor";
import { SendPanel } from "@/components/notes/send-panel";
import { createNoteAction, updateNoteAction } from "@/app/actions";
import type { Note, NoteType, NoteLink, ExtractedTask, NoteAttachment } from "@/lib/db/notes-types";

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

type MobilePanel = "list" | "editor" | "send";

export function MobileNotes({ initialNotes, projects, defaultDocType = "brief" }: Props) {
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [panel, setPanel] = useState<MobilePanel>("list");
  const [editorState, setEditorState] = useState<"idle" | "generating" | "ready">("idle");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const [currentContent, setCurrentContent] = useState("");
  const [currentTitle, setCurrentTitle] = useState("");
  const [currentLinks, setCurrentLinks] = useState<NoteLink[]>([]);
  const [currentExtractedTasks, setCurrentExtractedTasks] = useState<ExtractedTask[]>([]);
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
  const [currentAttachments, setCurrentAttachments] = useState<NoteAttachment[]>([]);

  function handleNew() {
    setSelectedNote(null);
    setCurrentNoteId(null);
    setCurrentContent("");
    setCurrentTitle("");
    setCurrentLinks([]);
    setCurrentExtractedTasks([]);
    setEditorState("idle");
    setPanel("editor");
  }

  function handleSelectNote(note: Note) {
    setSelectedNote(note);
    setCurrentNoteId(note.id);
    setCurrentContent(note.content ?? "");
    setCurrentTitle(note.title);
    setCurrentLinks(note.links ?? []);
    setCurrentExtractedTasks(note.extracted_tasks ?? []);
    setSelectedProjectId(note.project_id);
    setEditorState(note.content ? "ready" : "idle");
    setPanel("editor");
  }

  const handleGenerate = useCallback(
    async (rawInput: string, type: NoteType) => {
      setEditorState("generating");
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
            projectTitle: projectContext?.title,
            clientName: projectContext?.client,
          }),
        });

        if (!res.ok) throw new Error("Generation failed");
        const data = await res.json();

        setCurrentTitle(data.title);
        setCurrentContent(data.content);
        setCurrentLinks(data.links ?? []);
        setCurrentExtractedTasks(data.extracted_tasks ?? []);
        setEditorState("ready");

        // Auto-save
        if (currentNoteId) {
          await updateNoteAction(currentNoteId, {
            title: data.title,
            content: data.content,
            links: data.links,
            extracted_tasks: data.extracted_tasks,
          });
        } else {
          const noteId = await createNoteAction({
            title: data.title,
            content: data.content,
            type,
            project_id: selectedProjectId,
          });
          if (noteId) {
            setCurrentNoteId(noteId);
            // Update links/tasks on the newly created note
            if (data.links || data.extracted_tasks) {
              await updateNoteAction(noteId, {
                links: data.links,
                extracted_tasks: data.extracted_tasks,
              });
            }
          }
        }

        toast.success("Document generated");
      } catch {
        toast.error("Generation failed");
        setEditorState("idle");
      }
    },
    [currentNoteId, selectedProjectId, projects]
  );

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString([], { month: "short", day: "numeric" });

  // ── List view ──
  if (panel === "list") {
    return (
      <div className="flex flex-col h-full">
        <div className="shrink-0 px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 bg-background/80 backdrop-blur-xl border-b border-border/30">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-black tracking-tight">Notes</h1>
            <button
              onClick={handleNew}
              className="w-8 h-8 flex items-center justify-center bg-primary text-primary-foreground rounded-full"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {notes.length > 0 ? (
            notes.map((note, i) => (
              <button
                key={note.id}
                onClick={() => handleSelectNote(note)}
                className={cn(
                  "w-full flex items-start gap-3 px-5 py-3.5 text-left active:bg-accent/20 transition-colors",
                  i !== 0 && "border-t border-border/20"
                )}
              >
                <FileText className="w-4 h-4 text-muted-foreground/40 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-foreground truncate">
                    {note.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-muted-foreground/60 capitalize">
                      {note.type?.replace("-", " ") ?? "note"}
                    </span>
                    <span className="text-[10px] text-muted-foreground/40">
                      {formatDate(note.updated_at ?? note.created_at)}
                    </span>
                  </div>
                </div>
              </button>
            ))
          ) : (
            <div className="py-12 text-center">
              <FileText className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-[13px] text-muted-foreground">No notes yet</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Editor view ──
  if (panel === "editor") {
    return (
      <div className="flex flex-col h-full">
        <div className="shrink-0 flex items-center gap-2 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] bg-background/80 backdrop-blur-xl border-b border-border/30">
          <button
            onClick={() => setPanel("list")}
            className="w-8 h-8 flex items-center justify-center text-muted-foreground"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="text-[13px] font-semibold truncate flex-1">
            {currentTitle || "New Note"}
          </h2>
          {editorState === "ready" && (
            <button
              onClick={() => setPanel("send")}
              className="w-8 h-8 flex items-center justify-center text-muted-foreground"
            >
              <Share2 className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-auto">
          {editorState === "idle" || editorState === "generating" ? (
            <DictationPanel
              onGenerate={handleGenerate}
              isGenerating={editorState === "generating"}
              defaultDocType={defaultDocType}
              projectOptions={projects}
              selectedProjectId={selectedProjectId}
              onProjectChange={setSelectedProjectId}
            />
          ) : (
            <DocumentEditor
              content={currentContent}
              onChange={setCurrentContent}
              isSaving={false}
            />
          )}
        </div>
      </div>
    );
  }

  // ── Send/export view ──
  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center gap-2 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] bg-background/80 backdrop-blur-xl border-b border-border/30">
        <button
          onClick={() => setPanel("editor")}
          className="w-8 h-8 flex items-center justify-center text-muted-foreground"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-[13px] font-semibold">Export & Share</h2>
      </div>

      <div className="flex-1 overflow-auto">
        <SendPanel
          noteId={currentNoteId ?? ""}
          title={currentTitle}
          content={currentContent}
          links={currentLinks}
          extractedTasks={currentExtractedTasks}
          onLinksChange={setCurrentLinks}
          projects={projects}
          selectedProjectId={selectedProjectId}
          attachments={currentAttachments}
          onAttachmentsChange={setCurrentAttachments}
        />
      </div>
    </div>
  );
}
