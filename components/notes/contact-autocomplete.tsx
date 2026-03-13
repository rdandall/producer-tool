"use client";

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Contact {
  name: string | null;
  email: string;
}

interface ContactAutocompleteProps {
  value: Contact[];
  onChange: (contacts: Contact[]) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getAvatarColor(str: string): string {
  const palette = ["#3b82f6", "#8b5cf6", "#10b981", "#ec4899", "#f97316", "#06b6d4", "#84cc16", "#ef4444"];
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0x7fffffff;
  return palette[h % palette.length];
}

export function ContactAutocomplete({ value, onChange }: ContactAutocompleteProps) {
  const [inputValue, setInputValue] = useState("");
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [fetched, setFetched] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchContacts = useCallback(async () => {
    if (fetched) return;
    setFetched(true);
    try {
      const res = await fetch("/api/contacts");
      if (!res.ok) return;
      const { contacts } = await res.json();
      setAllContacts(contacts ?? []);
    } catch {
      // non-critical
    }
  }, [fetched]);

  // Filter by query, exclude already-selected
  const filtered = (() => {
    const selectedEmails = new Set(value.map((c) => c.email.toLowerCase()));
    const pool = allContacts.filter((c) => !selectedEmails.has(c.email.toLowerCase()));
    if (!inputValue.trim()) return pool.slice(0, 8);
    const q = inputValue.toLowerCase();
    return pool
      .filter((c) => c.email.toLowerCase().includes(q) || (c.name ?? "").toLowerCase().includes(q))
      .slice(0, 8);
  })();

  function addContact(contact: Contact) {
    const already = value.some((v) => v.email.toLowerCase() === contact.email.toLowerCase());
    if (already) return;
    onChange([...value, contact]);
    setInputValue("");
    setActiveIdx(-1);
    setIsOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function tryAddInputAsEmail() {
    const trimmed = inputValue.trim().replace(/,\s*$/, "");
    if (!EMAIL_RE.test(trimmed)) return false;
    addContact({ name: null, email: trimmed });
    return true;
  }

  function removeContact(email: string) {
    onChange(value.filter((c) => c.email !== email));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((prev) => (filtered.length ? Math.min(prev + 1, filtered.length - 1) : -1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((prev) => Math.max(prev - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIdx >= 0 && filtered[activeIdx]) {
        addContact(filtered[activeIdx]);
      } else {
        tryAddInputAsEmail();
      }
    } else if (e.key === "Tab") {
      if (activeIdx >= 0 && filtered[activeIdx]) {
        e.preventDefault();
        addContact(filtered[activeIdx]);
      } else if (EMAIL_RE.test(inputValue.trim())) {
        e.preventDefault();
        tryAddInputAsEmail();
      }
    } else if (e.key === "," || e.key === " ") {
      if (EMAIL_RE.test(inputValue.trim())) {
        e.preventDefault();
        tryAddInputAsEmail();
      }
    } else if (e.key === "Backspace" && !inputValue && value.length > 0) {
      onChange(value.slice(0, -1));
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setActiveIdx(-1);
    }
  }

  // Close on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setIsOpen(false);
        setActiveIdx(-1);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const showDropdown = isOpen && filtered.length > 0;

  return (
    <div ref={containerRef} className="relative">
      {/* Chip input box */}
      <div
        className="w-full min-h-[36px] flex flex-wrap gap-1 border border-border px-2 py-1.5 cursor-text focus-within:border-primary/60 transition-colors"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((contact) => {
          const label = contact.name ?? contact.email;
          const color = getAvatarColor(contact.email);
          return (
            <span
              key={contact.email}
              className="inline-flex items-center gap-1 text-[11px] bg-sidebar-accent/60 border border-border/50 px-1.5 py-0.5 max-w-[180px] group"
            >
              <span
                className="w-3 h-3 shrink-0 flex items-center justify-center text-[8px] font-bold text-white"
                style={{ backgroundColor: color }}
              >
                {label.charAt(0).toUpperCase()}
              </span>
              <span className="truncate">{label}</span>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  removeContact(contact.email);
                }}
                className="text-muted-foreground/40 hover:text-foreground transition-colors shrink-0"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          );
        })}

        <input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setActiveIdx(-1);
            setIsOpen(true);
          }}
          onFocus={() => {
            fetchContacts();
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? "editor@example.com" : ""}
          className="flex-1 min-w-[100px] text-[12px] bg-transparent focus:outline-none text-foreground placeholder:text-muted-foreground/30 py-0"
        />
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute left-0 right-0 top-full mt-0.5 bg-background/96 backdrop-blur-xl border border-border/60 shadow-xl z-50 overflow-hidden">
          {filtered.map((contact, idx) => {
            const label = contact.name ?? contact.email;
            const color = getAvatarColor(contact.email);
            const isActive = idx === activeIdx;

            return (
              <button
                key={contact.email}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  addContact(contact);
                }}
                onMouseEnter={() => setActiveIdx(idx)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors",
                  isActive ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/50"
                )}
              >
                <div
                  className="w-6 h-6 shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
                  style={{ backgroundColor: color }}
                >
                  {label.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  {contact.name && (
                    <p className="text-[12px] font-medium text-foreground truncate leading-tight">
                      {contact.name}
                    </p>
                  )}
                  <p
                    className={cn(
                      "truncate leading-tight",
                      contact.name
                        ? "text-[10px] text-muted-foreground/60"
                        : "text-[12px] text-foreground"
                    )}
                  >
                    {contact.email}
                  </p>
                </div>
              </button>
            );
          })}
          {inputValue.trim() && !EMAIL_RE.test(inputValue.trim()) && filtered.length === 0 && (
            <p className="px-3 py-2 text-[11px] text-muted-foreground/40">
              No contacts found — type a full email to add
            </p>
          )}
        </div>
      )}
    </div>
  );
}
