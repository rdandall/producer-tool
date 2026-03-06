"use client";

import { Plus, Sparkles } from "lucide-react";

interface SmartInsert {
  label: string;
  text: string;
}

interface SmartInsertsSidebarProps {
  inserts: SmartInsert[];
  onInsert: (text: string) => void;
  generating?: boolean;
}

export function SmartInsertsSidebar({
  inserts,
  onInsert,
  generating,
}: SmartInsertsSidebarProps) {
  if (generating) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-muted-foreground animate-pulse" />
          <span className="text-xs text-muted-foreground">Generating inserts...</span>
        </div>
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-7 bg-sidebar-accent/50 animate-pulse"
            style={{ width: `${60 + i * 8}%` }}
          />
        ))}
      </div>
    );
  }

  if (!inserts.length) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Smart Inserts
        </span>
        <span className="text-[10px] text-muted-foreground/60">
          — click to inject at cursor
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {inserts.map((insert, i) => (
          <button
            key={i}
            onClick={() => onInsert(insert.text)}
            title={insert.text}
            className="flex items-center gap-1 px-2 py-1 text-xs border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors group"
          >
            <Plus className="w-3 h-3 group-hover:text-primary transition-colors" />
            {insert.label}
          </button>
        ))}
      </div>
    </div>
  );
}
