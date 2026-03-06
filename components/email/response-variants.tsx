"use client";

import { useRef, useCallback } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type VariantType = "punchy" | "balanced" | "detailed";

export interface Variants {
  punchy: string;
  balanced: string;
  detailed: string;
}

interface ResponseVariantsProps {
  variants: Variants;
  activeVariant: VariantType;
  generating: boolean;
  regenLoading: VariantType | null;
  onVariantChange: (type: VariantType, value: string) => void;
  onActiveVariantChange: (type: VariantType) => void;
  onRegen: (type: VariantType) => void;
  /** Called by parent when a smart insert needs to inject text at cursor */
  insertRef: React.MutableRefObject<((text: string) => void) | null>;
}

const VARIANT_META: Record<VariantType, { label: string; hint: string }> = {
  punchy: { label: "Punchy", hint: "Short & direct" },
  balanced: { label: "Balanced", hint: "Standard" },
  detailed: { label: "Detailed", hint: "Thorough" },
};

const VARIANT_ORDER: VariantType[] = ["punchy", "balanced", "detailed"];

export function ResponseVariants({
  variants,
  activeVariant,
  generating,
  regenLoading,
  onVariantChange,
  onActiveVariantChange,
  onRegen,
  insertRef,
}: ResponseVariantsProps) {
  // One ref per textarea
  const textareaRefs = useRef<Record<VariantType, HTMLTextAreaElement | null>>({
    punchy: null,
    balanced: null,
    detailed: null,
  });

  // Expose insert function to parent via ref
  const insertText = useCallback(
    (text: string) => {
      const el = textareaRefs.current[activeVariant];
      const currentValue = variants[activeVariant];

      if (!el) {
        // Fallback: append to end
        onVariantChange(activeVariant, currentValue + (currentValue ? "\n\n" : "") + text);
        return;
      }

      const start = el.selectionStart ?? currentValue.length;
      const end = el.selectionEnd ?? start;
      const separator = start > 0 && currentValue[start - 1] !== "\n" ? "\n\n" : "";
      const newValue =
        currentValue.slice(0, start) + separator + text + currentValue.slice(end);

      onVariantChange(activeVariant, newValue);

      // Restore cursor after React re-render
      requestAnimationFrame(() => {
        el.setSelectionRange(
          start + separator.length + text.length,
          start + separator.length + text.length
        );
        el.focus();
      });
    },
    [activeVariant, variants, onVariantChange]
  );

  // Keep parent's insertRef up to date
  insertRef.current = insertText;

  if (generating) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-xs">Generating responses in your voice...</span>
        </div>
        {VARIANT_ORDER.map((type) => (
          <div key={type} className="space-y-1.5">
            <div className="h-3 w-16 bg-sidebar-accent animate-pulse" />
            <div className="h-24 bg-sidebar-accent/50 animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Tab selector */}
      <div className="flex border-b border-border">
        {VARIANT_ORDER.map((type) => {
          const meta = VARIANT_META[type];
          const isActive = activeVariant === type;
          return (
            <button
              key={type}
              onClick={() => {
                onActiveVariantChange(type);
                requestAnimationFrame(() => textareaRefs.current[type]?.focus());
              }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 -mb-px transition-colors",
                isActive
                  ? "border-primary text-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {meta.label}
              <span
                className={cn(
                  "text-[10px] transition-opacity",
                  isActive ? "text-muted-foreground opacity-100" : "opacity-0"
                )}
              >
                {meta.hint}
              </span>
            </button>
          );
        })}
      </div>

      {/* Active textarea */}
      {VARIANT_ORDER.map((type) => {
        const isVisible = activeVariant === type;
        const isRegen = regenLoading === type;

        return (
          <div key={type} className={cn("relative", !isVisible && "hidden")}>
            <textarea
              ref={(el) => {
                textareaRefs.current[type] = el;
              }}
              value={variants[type]}
              onChange={(e) => onVariantChange(type, e.target.value)}
              onFocus={() => onActiveVariantChange(type)}
              placeholder={
                type === "punchy"
                  ? "Short, direct reply..."
                  : type === "balanced"
                  ? "Standard professional reply..."
                  : "Comprehensive reply..."
              }
              disabled={isRegen}
              rows={10}
              className={cn(
                "w-full resize-none text-xs text-foreground bg-sidebar-accent/30 border border-border p-3 focus:outline-none focus:border-primary/50 transition-colors placeholder:text-muted-foreground/40 leading-relaxed font-mono",
                isRegen && "opacity-50"
              )}
            />

            {/* Regen button */}
            <button
              onClick={() => onRegen(type)}
              disabled={isRegen}
              className="absolute top-2 right-2 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground border border-border/60 bg-sidebar px-2 py-1 transition-colors disabled:opacity-50"
              title={`Regenerate ${type} variant`}
            >
              {isRegen ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              Regen
            </button>
          </div>
        );
      })}
    </div>
  );
}
