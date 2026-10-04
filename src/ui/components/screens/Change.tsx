"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/src/ui/lib/utils";
import { NoFigure } from "./NoFigure";

/**
 * A move up or down, as every table writes it: "▲ 12", "▼ 3", "▲ 0.8 places",
 * "New", or a dash for none. The arrow carries the meaning and the colour
 * only repeats it (Anthony cannot tell red from green). One part where
 * Sites' `ChangeCell`, Search Console's clicks and places and the websites
 * admin's arrow icons drew three (2026-10-03 clean-up).
 *
 * `by` is the move: for `count`, more is up; for `places`, a position's
 * places risen (before − now, so a smaller position number is up). `isNew`
 * for a row with nothing before it; `same` writes "The same" instead of a
 * dash for no move; `format` writes the number.
 *
 * `arrow` is for a count of things that went one way — "▲ 3" searches rose,
 * "▼ 0" fell — rather than one move: it always writes its arrow and number,
 * greyed when the count is none, so "nothing moved" never reads as "not known".
 */
export function Change({ by, kind = "count", isNew = false, same = false, arrow, format = defaultFormat }: {
  by: number | null;
  kind?: "count" | "places";
  isNew?: boolean;
  same?: boolean;
  arrow?: "up" | "down";
  format?: (value: number) => string;
}) {
  const t = useTranslations("ui.change");
  if (arrow && by !== null) {
    const tone = by === 0 ? "text-muted" : arrow === "up" ? "text-success" : "text-destructive";
    return <span className={cn("whitespace-nowrap font-mono text-[12px]", tone)}>{arrow === "up" ? "▲" : "▼"} {format(Math.abs(by))}</span>;
  }
  if (isNew) return <span className="whitespace-nowrap text-[12px] text-success">{t("new")}</span>;
  if (by === null || Number.isNaN(by)) return <NoFigure />;
  const still = kind === "places" ? Math.abs(by) < 0.05 : by === 0;
  if (still) return same ? <span className="whitespace-nowrap font-mono text-[12px] text-muted">{t("same")}</span> : <NoFigure />;
  const up = by > 0;
  const amount = format(Math.abs(by));
  return (
    <span className={cn("whitespace-nowrap font-mono text-[12px]", up ? "text-success" : "text-destructive")}>
      {up ? "▲" : "▼"} {kind === "places" ? t("places", { places: amount }) : amount}
    </span>
  );
}

const defaultFormat = (value: number) => value.toLocaleString("en-GB");

/**
 * A figure's change line, under its number: "▲ 12 since 3 Sep", "▼ 6% on the
 * 30 days before". The sentence is the screen's own — what it is compared
 * with differs — and this part keeps the one rule for its colour: up is
 * success, down destructive, no move or nothing to compare muted, and
 * `neutral` for a count where more is neither good nor bad. The sentence
 * starts with its arrow, so colour is never the only sign.
 */
export function ChangeLine({ by, neutral = false, children }: { by: number | null; neutral?: boolean; children: ReactNode }) {
  const tone = by === null || by === 0 ? "text-muted" : neutral ? "text-secondary" : by > 0 ? "text-success" : "text-destructive";
  return <span className={tone}>{children}</span>;
}
