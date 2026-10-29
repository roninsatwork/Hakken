"use client";

import { useEffect, useId } from "react";
import { Eye } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { cn } from "@/src/ui/lib/utils";
import { Button } from "./Button";
import { Tooltip } from "./Tooltip";
import { claimEye, toggleSees, useDrawsEye, useSeesBox, useSeesNew, useSeesOpen } from "./hakkenSeesStore";

/**
 * The eye beside the page title that opens What Hakken sees — option 7 on
 * the canvas of 2026-10-29 (sees-header-and-rolling-dates-plan.md, part one;
 * Anthony: "i think i like the eyes"): a bordered 38px button with the eye
 * in the brand colour, then how many of the box's steps are new ("2 new")
 * until the box has been opened on this advice. Resting on it shows what it
 * is; clicking it opens the box under the header and leaves the eye pressed;
 * clicking again closes it.
 *
 * Every header part draws it (`PageHeader`, `DetailHeader`, `DetailLayout`),
 * and it draws itself only once the screen's box has published something —
 * so no screen wires it up, and a screen with nothing to say has no eye.
 * Where two headers stack on one screen, the outermost draws it
 * (`claimEye`). The words and the look are read only once there is a box,
 * so a header on a screen without one costs nothing.
 */
export function HakkenSeesEye() {
  const id = useId();
  useEffect(() => claimEye(id), [id]);
  const draws = useDrawsEye(id);
  const box = useSeesBox();
  const open = useSeesOpen();
  const fresh = useSeesNew();
  if (!draws || !box) return null;
  return <SeesEye open={open} fresh={fresh} count={box.steps.length} onClick={toggleSees} />;
}

/** The eye as drawn: pressed while the box is open, the count beside it while its steps are new. */
export function SeesEye({ open, fresh, count, onClick, tooltipShown }: { open: boolean; fresh: boolean; count: number; onClick: () => void; tooltipShown?: boolean }) {
  const t = useTranslations("ui.hakkenSees");
  const { platformName } = useSystemSettings();
  return (
    <span data-part="sees-eye" className="relative inline-flex shrink-0 items-center gap-3 text-[13px] font-normal tracking-normal">
      <Tooltip label={fresh ? t("tooltipNew", { platformName, count }) : t("tooltipRead", { platformName })} shown={tooltipShown}>
        <Button
          variant="ghost"
          aria-label={t("title", { platformName })}
          aria-expanded={open}
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
    </span>
  );
}
