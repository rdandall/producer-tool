"use client";

import { useState, useEffect, useTransition } from "react";
import { motion } from "framer-motion";
import { X, Link2, Plus, ExternalLink } from "lucide-react";
import { updateTaskAction, deleteTaskAction } from "@/app/actions";
import { TaskCheckbox } from "./task-checkbox";
import type { TaskWithProject, TaskLink } from "@/lib/db/tasks";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Project {
  id: string;
  title: string;
  client: string | null;
}

interface Props {
  task: TaskWithProject;
  projects: Project[];
  onClose: () => void;
}

const PRIORITY_LABELS = { high: "High", medium: "Medium", low: "Low" };

const fieldClass =
  "w-full text-sm bg-background border border-border px-3 py-2 text-foreground " +
  "placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary transition-colors";

const smallFieldClass =
  "w-full text-xs bg-background border border-border px-2 py-1.5 text-foreground " +
  "placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary transition-colors";

export function TaskDetailPanel({ task, projects, onClose }: Props) {
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();

  const [title, setTitle] = useState(task.title);
  const [priority, setPriority] = useState(task.priority);
  const [projectId, setProjectId] = useState(task.project_id ?? "");
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [assignedTo, setAssignedTo] = useState(task.assigned_to ?? "");
  const [links, setLinks] = useState<TaskLink[]>(task.links ?? []);
  const [addingLink, setAddingLink] = useState(false);
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");

  useEffect(() => {
    setTitle(task.title);
    setPriority(task.priority);
    setProjectId(task.project_id ?? "");
    setDueDate(task.due_date ?? "");
    setAssignedTo(task.assigned_to ?? "");
    setLinks(task.links ?? []);
    setAddingLink(false);
    setNewLinkLabel("");
    setNewLinkUrl("");
  }, [task.id]);

  function handleSave() {
    if (!title.trim()) return;
    startTransition(async () => {
      try {
        await updateTaskAction(task.id, {
          title: title.trim(),
          priority,
          project_id: projectId || null,
          due_date: dueDate || null,
          assigned_to: assignedTo.trim() || null,
          links,
        });
        toast.success("Task saved");
      } catch {
        toast.error("Failed to save task");
      }
    });
  }

  function handleDelete() {
    startDeleteTransition(async () => {
      try {
        await deleteTaskAction(task.id);
        toast.success("Task deleted");
        onClose();
      } catch {
        toast.error("Failed to delete task");
      }
    });
  }

  function confirmAddLink() {
    if (!newLinkUrl.trim()) return;
    const label = newLinkLabel.trim() || newLinkUrl.trim();
    setLinks((prev) => [...prev, { label, url: newLinkUrl.trim() }]);
    setNewLinkLabel("");
    setNewLinkUrl("");
    setAddingLink(false);
  }

  function removeLink(i: number) {
    setLinks((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateLink(i: number, field: "label" | "url", value: string) {
    setLinks((prev) =>
      prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l))
    );
  }

  return (
    <motion.div
      initial={{ x: "100%", opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "100%", opacity: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 35 }}
      className="w-[360px] shrink-0 border-l border-border flex flex-col bg-background overflow-y-auto"
    >
      {/* Header */}
      <div className="flex items-start gap-3 px-5 py-4 border-b border-border">
        <div className="pt-0.5 shrink-0">
          <TaskCheckbox taskId={task.id} completed={task.completed} />
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={cn(
            "flex-1 text-sm font-medium bg-transparent border-none outline-none text-foreground",
            "placeholder:text-muted-foreground/40 leading-snug",
            task.completed && "line-through text-muted-foreground"
          )}
          placeholder="Task title"
        />
        <button
          onClick={onClose}
          className="shrink-0 text-muted-foreground/30 hover:text-foreground transition-colors"
          aria-label="Close panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Priority indicator strip */}
      <div
        className={cn(
          "h-0.5 shrink-0",
          priority === "high" && "bg-destructive",
          priority === "medium" && "bg-amber-400",
          priority === "low" && "bg-border"
        )}
      />

      {/* Fields */}
      <div className="p-5 space-y-5 flex-1">
        {/* Project */}
        <div>
          <label className="label-xs">Project</label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className={fieldClass}
          >
            <option value="">— None —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.client ? `${p.client} — ${p.title}` : p.title}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Priority */}
          <div>
            <label className="label-xs">Priority</label>
            <select
              value={priority}
              onChange={(e) =>
                setPriority(e.target.value as typeof priority)
              }
              className={fieldClass}
            >
              {(["high", "medium", "low"] as const).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </div>

          {/* Due date */}
          <div>
            <label className="label-xs">Due Date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={fieldClass}
            />
          </div>
        </div>

        {/* Assignee */}
        <div>
          <label className="label-xs">Assigned To</label>
          <input
            type="text"
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            placeholder="Name or email"
            className={fieldClass}
          />
        </div>

        {/* Divider */}
        <div className="border-t border-border/60" />

        {/* Resources */}
        <div>
          <label className="label-xs mb-3 block">Resources</label>

          {links.length > 0 && (
            <div className="space-y-2 mb-3">
              {links.map((link, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Link2 className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0" />
                  <div className="flex-1 min-w-0 grid grid-cols-2 gap-1">
                    <input
                      value={link.label}
                      onChange={(e) => updateLink(i, "label", e.target.value)}
                      placeholder="Label"
                      className={smallFieldClass}
                    />
                    <input
                      value={link.url}
                      onChange={(e) => updateLink(i, "url", e.target.value)}
                      placeholder="https://…"
                      className={smallFieldClass}
                    />
                  </div>
                  {link.url && (
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground/30 hover:text-foreground transition-colors shrink-0"
                      title="Open link"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  <button
                    onClick={() => removeLink(i)}
                    className="text-muted-foreground/30 hover:text-destructive transition-colors shrink-0"
                    aria-label="Remove link"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {addingLink ? (
            <div className="border border-border p-3 space-y-2">
              <input
                autoFocus
                value={newLinkLabel}
                onChange={(e) => setNewLinkLabel(e.target.value)}
                placeholder="Label (e.g. Frame.io review)"
                className={smallFieldClass}
              />
              <input
                value={newLinkUrl}
                onChange={(e) => setNewLinkUrl(e.target.value)}
                placeholder="https://…"
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmAddLink();
                  if (e.key === "Escape") {
                    setAddingLink(false);
                    setNewLinkLabel("");
                    setNewLinkUrl("");
                  }
                }}
                className={smallFieldClass}
              />
              <div className="flex gap-2">
                <button
                  onClick={confirmAddLink}
                  className="text-xs px-2.5 py-1 bg-foreground text-background hover:opacity-80 transition-opacity"
                >
                  Add
                </button>
                <button
                  onClick={() => {
                    setAddingLink(false);
                    setNewLinkLabel("");
                    setNewLinkUrl("");
                  }}
                  className="text-xs px-2 py-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAddingLink(true)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground/40 hover:text-foreground transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add link
            </button>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-border flex items-center justify-between gap-3">
        <button
          onClick={handleDelete}
          disabled={isDeleting}
          className="text-xs text-muted-foreground/40 hover:text-destructive transition-colors disabled:opacity-40"
        >
          {isDeleting ? "Deleting…" : "Delete task"}
        </button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isPending || !title.trim()}
          className="text-xs h-8"
        >
          {isPending ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </motion.div>
  );
}
