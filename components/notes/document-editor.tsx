"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Check, Edit3, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { renderSimpleMarkdownToHtml } from "@/lib/markdown";

interface Props {
  content: string;
  onChange: (content: string) => void;
  isSaving: boolean;
}

export function DocumentEditor({ content, onChange, isSaving }: Props) {
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const [editValue, setEditValue] = useState(content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync external content changes (e.g., after AI generation)
  useEffect(() => {
    setEditValue(content);
    setMode("preview");
  }, [content]);

  // Auto-resize textarea
  useEffect(() => {
    if (mode === "edit" && textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [editValue, mode]);

  function switchToEdit() {
    setMode("edit");
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  function handleSave() {
    onChange(editValue);
    setMode("preview");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Escape") {
      setEditValue(content); // revert
      setMode("preview");
    }
  }

  if (!content) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex-1 flex flex-col overflow-hidden"
    >
      {/* Document toolbar */}
      <div className="flex items-center justify-between px-6 py-2.5 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMode("preview")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium transition-colors",
              mode === "preview"
                ? "bg-accent text-foreground"
                : "text-muted-foreground/40 hover:text-foreground"
            )}
          >
            <Eye className="w-3 h-3" />
            Preview
          </button>
          <button
            onClick={switchToEdit}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium transition-colors",
              mode === "edit"
                ? "bg-accent text-foreground"
                : "text-muted-foreground/40 hover:text-foreground"
            )}
          >
            <Edit3 className="w-3 h-3" />
            Edit
          </button>
        </div>

        <div className="flex items-center gap-2">
          {isSaving && (
            <span className="text-[10px] text-muted-foreground/40">Saving…</span>
          )}
          {mode === "edit" && (
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold bg-primary text-primary-foreground hover:-translate-y-px transition-all shadow-sm"
            >
              <Check className="w-3 h-3" />
              Save
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-8 py-8">
        {mode === "preview" ? (
          <div
            className="prose-notes max-w-2xl cursor-text"
            onClick={switchToEdit}
            dangerouslySetInnerHTML={{ __html: renderSimpleMarkdownToHtml(content) }}
          />
        ) : (
          <textarea
            ref={textareaRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full max-w-2xl bg-transparent text-[13px] font-mono leading-relaxed text-foreground resize-none focus:outline-none border border-border/30 p-4 focus:border-primary transition-colors min-h-[400px]"
            placeholder="Start writing..."
            spellCheck
          />
        )}
      </div>

      {/* Edit hint */}
      {mode === "preview" && (
        <div className="px-8 pb-4 shrink-0">
          <p className="text-[10px] text-muted-foreground/25">
            Click anywhere in the document to edit · Cmd+S to save · Esc to cancel
          </p>
        </div>
      )}
    </motion.div>
  );
}
