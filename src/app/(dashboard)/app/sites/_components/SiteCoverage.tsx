"use client";

import type { FunctionReturnType } from "convex/server";
import { useTranslations } from "next-intl";
import type { api } from "@/convex/_generated/api";
import { formatNumber } from "./siteFormat";

/** What the keyword list holds of a site against the supplier's totals (`coverageOf` in `convex/siteFigures.ts`). */
export type SiteCoverage = NonNullable<FunctionReturnType<typeof api.sites.getMySite>>["coverage"];

/**
 * Whether the site's keyword list holds only part of what it ranks for — or
 * the total is not known yet — so a screen reading the list says which part
 * (sites-data-completeness-plan.md, rule 3).
 */
export function isPartHeld(coverage: SiteCoverage | undefined | null): boolean {
  return Boolean(coverage && coverage.searches.held !== null && !coverage.whole);
}

/**
 * The one sentence every screen reading the keyword list uses to say how much
 * of the site it is: "629 of the 1,857 searches this website ranks for are
 * held — the ones bringing it the most visits", or that the total is not known
 * yet. Nothing for a list that is the whole site.
 */
export function HeldLine({ coverage, className }: { coverage: SiteCoverage | undefined | null; className?: string }) {
  const t = useTranslations("sites.coverage");
  if (!coverage || !isPartHeld(coverage)) return null;
  const held = formatNumber(coverage.searches.held);
  const text = coverage.searches.total === null
    ? t("unknown", { held })
    : t("part", { held, total: formatNumber(coverage.searches.total) });
  return <p className={className ?? "text-[12px] leading-relaxed text-secondary"}>{text}</p>;
}

/**
 * A kept list's size against the whole list the supplier counted — "974 of
 * 2,129 linking websites kept" (sites-data-completeness-plan.md, §4.E).
 * Nothing when the list is whole, filtered, or its total is not known.
 */
export function ListHeldLine({ held, total }: { held: number | undefined; total: number | null | undefined }) {
  const t = useTranslations("sites.coverage");
  if (held === undefined || total === null || total === undefined || held >= total) return null;
  return <p className="text-[12px] leading-relaxed text-secondary">{t("listHeld", { held: formatNumber(held), total: formatNumber(total) })}</p>;
}
