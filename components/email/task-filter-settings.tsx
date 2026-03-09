"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { X, Plus, Bot } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export interface KnownSender {
  email: string;
  name: string | null;
}

interface TaskFilterSettingsProps {
  addresses: string[];
  knownSenders: KnownSender[];
  onChange: (addresses: string[]) => void;
  isSaving?: boolean;
}

export function TaskFilterSettings({
  addresses,
  knownSenders,
  onChange,
  isSaving,
}: TaskFilterSettingsProps) {
  const [input, setInput] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filtered suggestions: match input against email or name, exclude already-added
  const suggestions = input.trim().length > 0
    ? knownSenders
        .filter(
          (s) =>
            !addresses.some((a) => a.toLowerCase() === s.email.toLowerCase()) &&
            (s.email.toLowerCase().includes(input.toLowerCase()) ||
              (s.name ?? "").toLowerCase().includes(input.toLowerCase()))
        )
        .slice(0, 7)
    : [];

  // Reset highlight when suggestions change
  useEffect(() => {
    setHighlightIdx(-1);
  }, [input]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        !inputRef.current?.contains(e.target as Node) &&
        !dropdownRef.current?.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const addAddress = useCallback(
    (email: string) => {
      const trimmed = email.trim().toLowerCase();
      if (!trimmed) return;
      // Basic email validation
      if (!trimmed.includes("@")) return;
      if (addresses.some((a) => a.toLowerCase() === trimmed)) return;
      onChange([...addresses, trimmed]);
      setInput("");
      setShowDropdown(false);
      setHighlightIdx(-1);
      inputRef.current?.focus();
    },
    [addresses, onChange]
  );

  const removeAddress = useCallback(
    (addr: string) => {
      onChange(addresses.filter((a) => a !== addr));
    },
    [addresses, onChange]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, suggestions.length - 1));
      setShowDropdown(true);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIdx >= 0 && suggestions[highlightIdx]) {
        addAddress(suggestions[highlightIdx].email);
      } else {
        addAddress(input);
      }
    } else if (e.key === "Escape") {
      setShowDropdown(false);
      setHighlightIdx(-1);
    } else if (e.key === "Backspace" && !input && addresses.length > 0) {
      // Remove last address on backspace when input is empty
      removeAddress(addresses[addresses.length - 1]);
    }
  };

  return (
    <div className="px-3 py-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="w-3 h-3 text-primary/70" />
          <span className="text-[11px] font-semibold text-foreground uppercase tracking-widest">
            Task Extraction
          </span>
        </div>
        {isSaving && (
          <span className="text-[9px] text-muted-foreground/40 uppercase tracking-wider">
            Saving…
          </span>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
        AI will only suggest tasks from emails sent by these addresses.
        {addresses.length === 0 && (
          <span className="text-muted-foreground/40"> Add an address to enable.</span>
        )}
      </p>

      {/* Chips */}
      <AnimatePresence>
        {addresses.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-wrap gap-1.5"
          >
            {addresses.map((addr) => (
              <motion.div
                key={addr}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="flex items-center gap-1 text-[10px] text-foreground/80 bg-primary/8 border border-primary/25 px-2 py-1"
              >
                <span className="font-mono leading-none">{addr}</span>
                <button
                  onClick={() => removeAddress(addr)}
                  className="text-muted-foreground/50 hover:text-foreground transition-colors ml-0.5"
                  title="Remove"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input + autocomplete */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => {
            if (input.trim()) setShowDropdown(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Type to search or add address…"
          className="w-full pr-8 pl-2.5 py-1.5 text-[11px] bg-sidebar-accent/30 border border-border text-foreground placeholder:text-muted-foreground/35 focus:outline-none focus:border-primary/40 transition-colors font-mono"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          onMouseDown={(e) => {
            e.preventDefault();
            addAddress(input);
          }}
          disabled={!input.trim() || !input.includes("@")}
          title="Add address"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/35 hover:text-primary disabled:opacity-20 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>

        {/* Dropdown */}
        <AnimatePresence>
          {showDropdown && suggestions.length > 0 && (
            <motion.div
              ref={dropdownRef}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.1 }}
              className="absolute top-full left-0 right-0 z-50 bg-background border border-border shadow-lg mt-px max-h-44 overflow-y-auto"
            >
              {suggestions.map((s, i) => (
                <button
                  key={s.email}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addAddress(s.email);
                  }}
                  className={cn(
                    "w-full text-left px-2.5 py-2 flex flex-col gap-0.5 transition-colors border-b border-border/30 last:border-0",
                    i === highlightIdx
                      ? "bg-primary/8 text-foreground"
                      : "hover:bg-sidebar-accent/50"
                  )}
                >
                  {s.name && (
                    <span className="text-[11px] font-medium text-foreground leading-none">
                      {s.name}
                    </span>
                  )}
                  <span
                    className={cn(
                      "text-[10px] font-mono",
                      s.name ? "text-muted-foreground" : "text-foreground"
                    )}
                  >
                    {s.email}
                  </span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <p className="text-[9px] text-muted-foreground/35 leading-relaxed">
        Press Enter to add • Backspace to remove last • ↑↓ to navigate
      </p>
    </div>
  );
}
