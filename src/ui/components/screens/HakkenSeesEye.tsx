"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Eye } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { cn } from "@/src/ui/lib/utils";
import { Button } from "./Button";
import { SeesBubble } from "./HakkenSees";
import { Tooltip } from "./Tooltip";
import { claimEye, closeSees, toggleSees, useDrawsEye, useSeesBox, useSeesNew, useSeesOpen } from "./hakkenSeesStore";

/**
 * The eye in the top bar that opens What Hakken sees — option 7 on the
 * canvas of 2026-10-29 (sees-header-and-rolling-dates-plan.md, part one;
 * Anthony: "i think i like the eyes"), moved from beside the page title to
 * the top bar on 2026-10-30 (the Conversions canvas: "could the What Hakken
 * sees icon sit here and have page context"): a bordered 38px button with
 * the eye in the brand colour, then how many of the box's steps are new
 * ("2 new") until the bubble has been opened on this advice. Resting on it
 * shows what it is; clicking it opens the speech bubble under it
 * (`SeesBubble`) and leaves the eye pressed; clicking again, a click
 * anywhere else or Escape closes it.
 *
 * The top bar (`Header`) is the one place that draws it, and it draws itself
 * only once the screen's box has published something — so no screen wires it
 * up, and a screen with nothing to say has no eye. `claimEye` keeps one eye
 * on screen should two bars ever mount. The words and the look are read only
 * once there is a box, so a screen without one costs nothing.
 */
export function HakkenSeesEye() {
  const id = useId();
  useEffect(() => claimEye(id), [id]);
  const draws = useDrawsEye(id);
  const box = useSeesBox();
  const open = useSeesOpen();
  const fresh = useSeesNew();
  const holder = useRef<HTMLSpanElement>(null);
  // A click anywhere outside the eye and its bubble, or Escape, closes the bubble, as the bell's panel closes.
  useEffect(() => {
    if (!open) return;
    const pressedOutside = (event: MouseEvent) => {
      if (holder.current && !holder.current.contains(event.target as Node)) closeSees();
    };
    const escaped = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeSees();
    };
    document.addEventListener("mousedown", pressedOutside);
    document.addEventListener("keydown", escaped);
    return () => {
      document.removeEventListener("mousedown", pressedOutside);
      document.removeEventListener("keydown", escaped);
    };
  }, [open]);
  if (!draws || !box) return null;
  return (
    <SeesEye
      ref={holder}
      open={open}
      fresh={fresh}
      count={box.steps.length}
      onClick={toggleSees}
      bubbleId={`${id}-bubble`}
      bubble={open ? <SeesBubble id={`${id}-bubble`} says={box.says} steps={box.steps} /> : null}
    />
  );
}

/** The eye as drawn: pressed while the bubble is open, the count beside it while its steps are new, the bubble under it. */
export function SeesEye({ ref, open, fresh, count, onClick, tooltipShown, bubble, bubbleId }: {
  ref?: React.Ref<HTMLSpanElement>;
  open: boolean;
  fresh: boolean;
  count: number;
  onClick: () => void;
  tooltipShown?: boolean;
  /** The open bubble, drawn under the eye; the kit draws one to show it. */
  bubble?: ReactNode;
  bubbleId?: string;
}) {
  const t = useTranslations("ui.hakkenSees");
  const { platformName } = useSystemSettings();
  return (
    <span ref={ref} data-part="sees-eye" className="relative inline-flex shrink-0 items-center gap-3 text-[13px] font-normal tracking-normal">
      <Tooltip label={fresh ? t("tooltipNew", { platformName, count }) : t("tooltipRead", { platformName })} shown={tooltipShown}>
        <Button
          variant="ghost"
          aria-label={t("title", { platformName })}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-controls={open ? bubbleId : undefined}
          onClick={onClick}
          className={cn(
            "inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] border p-0 transition-colors",
            open ? "border-secondary/40 bg-hover" : "border-border-dim bg-background hover:bg-hover/40",
          )}
        >
          <Eye className="h-5 w-5 text-brand" aria-hidden="true" />
        </Button>
      </Tooltip>
      {fresh ? <span className="text-foreground">{t("new", { count })}</span> : null}
      {bubble}
    </span>
  );
}
