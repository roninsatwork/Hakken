"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Button } from "@/src/ui/components/screens/Button";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { FieldLabel, fieldClassName } from "@/src/ui/components/screens/SettingsCard";
import { useEngineLabel } from "@/src/ui/components/seo/engineLabel";
import { LAYER } from "@/src/ui/lib/layers";
import { cn } from "@/src/ui/lib/utils";

/**
 * Which AI engines a question is put to.
 *
 * Picking fewer engines is the cheapest lever in the citations feature: every
 * engine is a paid answer on every collection. Your prompts picks them for a
 * new prompt, and changes them for one it asks, with one dropdown
 * (`EnginePicker`). The engines' names live in
 * `src/ui/components/seo/engineLabel.ts`, shared with the client's screens,
 * and are re-exported here so the admin screens read them as they always have.
 */
export { useEngineLabel } from "@/src/ui/components/seo/engineLabel";

/**
 * The engines a new question will be put to.
 *
 * Holds the *exclusions* rather than the selection: absent means "all of
 * them", which is what the mutation does with an empty list too, and it lets
 * the engine list arrive from the server without an effect seeding state.
 */
export function useEngineChoice() {
  const all = useQuery(api.websiteCanonical.listEngines, {}) ?? [];
  const [dropped, setDropped] = useState<string[]>([]);
  const chosen = all.filter((engine) => !dropped.includes(engine));
  const toggle = (engine: string) => {
    setDropped((current) => (
      current.includes(engine) ? current.filter((entry) => entry !== engine) : [...current, engine]
    ));
  };
  return { all, chosen, toggle };
}

/**
 * Which assistants a question is asked of, as one dropdown — "All four
 * assistants" — opened to untick one (Anthony, 2026-09-28: design 2 of four;
 * the pill toggles it replaces read as "vibe coded"). A tick box per
 * assistant, and the last one cannot be unticked: a question asked of none is
 * a paused question, and pausing has its own switch.
 *
 * The panel is drawn into the body at the menu layer, like the table filters'
 * (`TableFilterSelect`), so no card around the trigger can clip it.
 */
export function EnginePicker({
  id,
  label,
  all,
  chosen,
  onToggle,
  disabled = false,
  labelHidden = false,
}: {
  id: string;
  label: string;
  all: readonly string[];
  chosen: readonly string[];
  onToggle: (engine: string) => void;
  disabled?: boolean;
  /**
   * Keep the label for whoever is listening, not for whoever is looking: for
   * a picker in a table row whose column already names it — a prompt's
   * assistants, edited on Your prompts (2026-09-28). As on `Field`.
   */
  labelHidden?: boolean;
}) {
  const t = useTranslations("admin.enginePicker");
  const engineLabel = useEngineLabel();
  const [isOpen, setIsOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const measure = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setAnchor({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setIsOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [isOpen, measure]);

  const summary = chosen.length === all.length && all.length > 0
    ? t("all", { count: all.length })
    : chosen.length === 0 ? t("none") : chosen.map(engineLabel).join(", ");

  return (
    <div className="flex min-w-[14rem] flex-col gap-1.5">
      {labelHidden ? <label htmlFor={id} className="sr-only">{label}</label> : <FieldLabel htmlFor={id}>{label}</FieldLabel>}
      <Button
        id={id}
        ref={triggerRef}
        variant="outline"
        aria-haspopup="true"
        aria-expanded={isOpen}
        disabled={disabled || all.length === 0}
        onClick={() => {
          // Placed as it opens, from the trigger's place on screen; the listeners below keep it there.
          if (!isOpen) measure();
          setIsOpen(!isOpen);
        }}
        className={cn(fieldClassName, "flex items-center justify-between gap-2 px-4 py-0 text-left text-foreground disabled:opacity-60")}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
      </Button>
      {isOpen && anchor
        ? createPortal(
          <div
            ref={panelRef}
            role="group"
            aria-label={label}
            style={{ top: anchor.top, left: anchor.left, minWidth: anchor.width }}
            className={`fixed ${LAYER.PAGE_MENU} flex flex-col gap-2 rounded-[12px] border border-border-dim bg-sidebar p-3 shadow-lg`}
          >
            {all.map((engine) => {
              const isChosen = chosen.includes(engine);
              return (
                <Checkbox
                  key={engine}
                  label={engineLabel(engine)}
                  checked={isChosen}
                  disabled={isChosen && chosen.length === 1}
                  onChange={() => onToggle(engine)}
                />
              );
            })}
            <p className="text-[11px] text-muted">{t("each")}</p>
          </div>,
          document.body,
        )
        : null}
    </div>
  );
}
