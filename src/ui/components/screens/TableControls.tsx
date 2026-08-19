"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";

import { LAYER } from "@/src/ui/lib/layers";

/**
 * The search box and filter dropdowns above the data tables.
 *
 * Both are controls over a server query, not over what is on screen: the table
 * holds one page at a time, so filtering the rendered rows would search a
 * twenty-five row window and call it a result. Everything here reports a value
 * upwards and the query re-runs.
 */

/** Long enough that a burst of typing is one query, short enough to feel live. */
const SEARCH_DEBOUNCE_MS = 250;

/**
 * A search box that reports its value on a delay.
 *
 * The input itself stays immediate — it is local state, so typing never waits
 * for the server — while `onChange` fires once the typing stops. Without that
 * every keystroke is a query, and each one scans the import.
 */
export function TableSearchInput({
  value,
  onChange,
  placeholder,
  clearLabel,
  variant = "boxed",
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  clearLabel: string;
  /**
   * "boxed" sits above a table, where it needs an edge of its own to read as a
   * control. "underline" sits at the head of a reading column — Ask Sonae's
   * conversation list and the chat logs that mirror it — where a second border
   * inside the panel is the thing that makes a screen look busy.
   */
  variant?: "boxed" | "underline";
}) {
  const [draft, setDraft] = useState(value);
  const [lastValue, setLastValue] = useState(value);

  // The parent clears the box when the tab changes; the draft has to follow it
  // down, or the old tab's text sits in an input that no longer filters. Done
  // during render rather than in an effect so the input never paints a value
  // the query has already dropped.
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(value);
  }

  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => onChange(draft), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, value, onChange]);

  return (
    <div
      className={
        variant === "underline"
          ? "flex-1 min-w-[220px] flex items-center gap-2.5 pl-0 pr-1 pb-2 border-b border-border-dim text-secondary focus-within:text-foreground focus-within:border-brand/50 transition-colors"
          : "flex-1 min-w-[220px] flex items-center gap-3 px-3 py-2 bg-background border border-border-dim rounded-[10px] text-secondary focus-within:text-foreground focus-within:border-brand/50 transition-all"
      }
    >
      <Search className={variant === "underline" ? "w-3.5 h-3.5 shrink-0" : "w-[18px] h-[18px] shrink-0"} />
      <input
        type="search"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={`bg-transparent border-none outline-none w-full placeholder:text-muted [&::-webkit-search-cancel-button]:appearance-none ${
          variant === "underline" ? "text-[13px]" : "text-[14px]"
        }`}
      />
      {draft !== "" && (
        <button
          type="button"
          onClick={() => setDraft("")}
          aria-label={clearLabel}
          className="shrink-0 text-muted hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

/**
 * A single-select dropdown over values taken from the data.
 *
 * It carries its own filter box once the list is long, because one of these
 * lists is every account name in the import — a few hundred entries, which is
 * a scroll, not a choice. Below that threshold the box is noise.
 */
const FILTER_BOX_THRESHOLD = 10;

/** Room the panel needs below the trigger before it flips above it instead. */
const MENU_MAX_HEIGHT = 340;

export function TableFilterSelect({
  label,
  options,
  value,
  onChange,
  allLabel,
  filterPlaceholder,
  noMatchesLabel,
}: {
  label: string;
  options: string[];
  value: string | null;
  onChange: (next: string | null) => void;
  allLabel: string;
  filterPlaceholder: string;
  noMatchesLabel: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [needle, setNeedle] = useState("");
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Reopening should offer the whole list again, not the last search into it.
  const close = () => {
    setIsOpen(false);
    setNeedle("");
  };

  // The panel is fixed to the viewport, so it needs the trigger's place in it.
  // Right-hand offset rather than left, because the panel is anchored to the
  // trigger's right edge and is wider than the trigger.
  const measure = useCallback(() => {
    const trigger = containerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom;
    // Falling off the bottom of the window is the one case worth handling:
    // these bars sit near the top, but the research row's copy can push them
    // down on a short screen.
    const flip = below < MENU_MAX_HEIGHT && rect.top > below;
    setAnchor({
      top: flip ? rect.top - MENU_MAX_HEIGHT - 4 : rect.bottom + 4,
      right: window.innerWidth - rect.right,
    });
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) return;
    measure();
  }, [isOpen, measure]);

  useEffect(() => {
    if (!isOpen) return;

    // The panel no longer lives inside the trigger, so "outside" is now both
    // of them. Without the menu in this test, mousedown inside the list closes
    // it and unmounts the option before its click can land — the dropdown
    // would look like it ignored every choice.
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setIsOpen(false);
      setNeedle("");
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        setNeedle("");
      }
    }
    // Fixed panels do not travel with the page, so an unfollowed scroll leaves
    // the list hanging beside a trigger that has moved on.
    function handleReflow() {
      measure();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleReflow, true);
    window.addEventListener("resize", handleReflow);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleReflow, true);
      window.removeEventListener("resize", handleReflow);
    };
  }, [isOpen, measure]);

  const visible = needle
    ? options.filter((option) => option.toLowerCase().includes(needle.toLowerCase()))
    : options;

  const select = (next: string | null) => {
    onChange(next);
    close();
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => (isOpen ? close() : setIsOpen(true))}
        disabled={options.length === 0}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={[
          "flex items-center gap-2 px-3 py-2 rounded-[10px] border text-[13px] transition-colors disabled:opacity-40",
          value
            ? "bg-brand/10 border-brand/50 text-foreground"
            : "bg-background border-border-dim text-secondary hover:text-foreground",
        ].join(" ")}
      >
        <span className="text-muted">{label}</span>
        <span className="max-w-[160px] truncate">{value ?? allLabel}</span>
        <ChevronDown className="w-4 h-4 shrink-0" />
      </button>

      {isOpen &&
        anchor &&
        // Rendered into the body rather than beside the trigger. The bar around
        // it is blurred, which makes it a stacking context, so a panel left
        // inside could never rise above the sibling bars further down the page
        // however large its z-index — it opened underneath the rows below it.
        // Out here it competes with them directly, at a layer chosen for it.
        //
        // Anchored to the trigger's right edge, not its left. These sit at the
        // right-hand end of the control bar, and a panel wider than its button
        // opening rightwards runs off the screen — which it did, clipping the
        // longer group names. Opening leftwards there is always room for.
        createPortal(
          <div
            ref={menuRef}
            style={{ top: anchor.top, right: anchor.right }}
            className={`fixed ${LAYER.PAGE_MENU} min-w-[240px] max-w-[340px] bg-sidebar border border-border-dim rounded-[12px] shadow-lg backdrop-blur-xl overflow-hidden`}
          >
            {options.length > FILTER_BOX_THRESHOLD && (
              <div className="p-2 border-b border-border-dim">
                <input
                  type="text"
                  autoFocus
                  value={needle}
                  onChange={(event) => setNeedle(event.target.value)}
                  placeholder={filterPlaceholder}
                  aria-label={filterPlaceholder}
                  className="w-full px-2 py-1.5 bg-background border border-border-dim rounded-[8px] text-[13px] outline-none focus:border-brand/50"
                />
              </div>
            )}

            <ul role="listbox" className="max-h-[280px] overflow-y-auto py-1">
              <li>
                <Option selected={value === null} onSelect={() => select(null)}>
                  {allLabel}
                </Option>
              </li>
              {visible.map((option) => (
                <li key={option}>
                  <Option selected={option === value} onSelect={() => select(option)}>
                    {option}
                  </Option>
                </li>
              ))}
              {visible.length === 0 && (
                <li className="px-3 py-2 text-[13px] text-muted">{noMatchesLabel}</li>
              )}
            </ul>
          </div>,
          document.body
        )}
    </div>
  );
}

function Option({
  children,
  selected,
  onSelect,
}: {
  children: React.ReactNode;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={[
        "w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors",
        selected ? "text-foreground bg-foreground/5" : "text-secondary hover:bg-foreground/5",
      ].join(" ")}
    >
      <Check className={`w-3.5 h-3.5 shrink-0 ${selected ? "opacity-100" : "opacity-0"}`} />
      <span className="truncate">{children}</span>
    </button>
  );
}
