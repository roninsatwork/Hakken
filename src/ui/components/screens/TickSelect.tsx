"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/src/ui/lib/utils";
import { LAYER } from "@/src/ui/lib/layers";
import { Button } from "./Button";
import { Checkbox } from "./Checkbox";

/**
 * A dropdown of tick boxes: `Select`'s chip, which opens a panel to tick any
 * mix of its choices (Anthony, 2026-10-20, drawn on the page-conversion
 * canvas and approved: "go with channels, I want it as per the design" —
 * Conversions and Channels on a chart's toolbar). The chip says what is
 * ticked: every one, up to two by name, "3 of 10", or none.
 *
 * "Select all" and "Deselect all" head the panel (Anthony, 2026-10-20: "can
 * we add select all and deselect all options to the dropdowns"), so one choice
 * is two clicks: deselect all, then tick it. Nothing ticked is allowed; the
 * screen says what to tick. It closes on Escape (back to the chip), on a click
 * outside it, and on the chip again. Grey when narrowed, as every filter chip
 * (never the brand colour).
 */
export function TickSelect({ label, choices, ticked, onChange, everyWord, changed }: {
  label: string;
  choices: ReadonlyArray<{ key: string; label: string }>;
  ticked: readonly string[];
  onChange: (next: string[]) => void;
  /** What the chip says when every choice is ticked: "Every channel". */
  everyWord: string;
  /**
   * Whether the chip is drawn grey, as `Select`'s `changed`: a chart's toolbar
   * passes false, so its chips look the same whatever is ticked. Without it,
   * grey whenever not every choice is ticked.
   */
  changed?: boolean;
}) {
  const t = useTranslations("ui.tickSelect");
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (wrapper.current && !wrapper.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const names = choices.filter((choice) => ticked.includes(choice.key)).map((choice) => choice.label);
  const every = ticked.length === choices.length;
  const words = every ? everyWord : names.length === 0 ? t("none") : names.length <= 2 ? names.join(", ") : t("some", { count: names.length, total: choices.length });
  const narrowed = changed ?? !every;
  const toggle = (key: string, on: boolean) => {
    const next = on ? [...ticked, key] : ticked.filter((one) => one !== key);
    // In the choices' own order, whatever order they were ticked in.
    onChange(choices.map((choice) => choice.key).filter((one) => next.includes(one)));
  };

  return (
    <div ref={wrapper} className="relative inline-flex">
      {/* The kit's outline button, drawn as `Select`'s chip. */}
      <Button
        variant="outline"
        ref={button}
        data-part="filter"
        data-part-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((before) => !before)}
        className={cn(
          "inline-flex h-[38px] items-center gap-1.5 whitespace-nowrap rounded-[10px] border px-3 py-0 text-[13px] font-normal text-foreground hover:text-foreground",
          narrowed ? "border-secondary/40 bg-hover" : "border-border-dim bg-background hover:bg-hover/40",
        )}
      >
        <span className="min-w-0 truncate"><span className="text-secondary">{label}:</span> {words}</span>
        <ChevronDown className={cn("pointer-events-none h-4 w-4", narrowed ? "text-foreground" : "text-muted")} aria-hidden="true" />
      </Button>
      {open ? (
        <div id={panelId} role="group" aria-label={label} className={cn("absolute left-0 top-full mt-1 flex w-max min-w-[220px] flex-col gap-2 rounded-[10px] border border-border-dim bg-card p-3 shadow-lg", LAYER.PAGE_MENU)}>
          <div className="-mx-1 -mt-1 flex items-center gap-1 border-b border-border-dim pb-2">
            <Button variant="ghost" className="rounded-[8px] px-2 py-1 text-[13px]" disabled={every} onClick={() => onChange(choices.map((choice) => choice.key))}>{t("selectAll")}</Button>
            <Button variant="ghost" className="rounded-[8px] px-2 py-1 text-[13px]" disabled={ticked.length === 0} onClick={() => onChange([])}>{t("deselectAll")}</Button>
          </div>
          {choices.map((choice) => (
            <Checkbox key={choice.key} label={choice.label} checked={ticked.includes(choice.key)} onChange={(on) => toggle(choice.key, on)} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
