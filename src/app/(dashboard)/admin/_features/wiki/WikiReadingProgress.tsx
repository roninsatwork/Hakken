"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { SectionLabel } from "@/src/ui/components/screens/SectionLabel";
import { shortPageTitle } from "./wikiWords";

/**
 * How far through the wiki's reading is: what it has written so far and what
 * it is reading now, under the Add to the wiki page's boxes
 * (wiki-sonae-catch-up-plan-2026-11-21.md, S6). Shown only while there is
 * something left to read, so it never sits there saying nothing. The bar is in
 * the theme's own colour: orange is kept for the page's one action.
 */
export function WikiReadingProgress({ companyId }: { companyId?: Id<"companies"> }) {
  const t = useTranslations("aiPages.progress");
  const { platformName } = useSystemSettings();
  const globalProgress = useQuery(api.wikiDistill.getDistillProgressForGlobal, companyId ? "skip" : {});
  const companyProgress = useQuery(api.wikiDistill.getDistillProgressForCompany, companyId ? { companyId } : "skip");
  const progress = companyId ? companyProgress : globalProgress;
  if (!progress?.isReading) return null;

  const done = progress.totalDocuments - progress.remainingDocuments;
  const percent = Math.round((done / Math.max(progress.totalDocuments, 1)) * 100);
  const title = t("title", { platformName });

  return (
    <section aria-live="polite" className="flex flex-col gap-3 border-t border-border-dim pt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionLabel>{title}</SectionLabel>
        <span className="text-[13px] tabular-nums text-secondary">{t("count", { done, total: progress.totalDocuments })}</span>
      </div>
      <div
        role="progressbar"
        aria-label={title}
        aria-valuemin={0}
        aria-valuemax={progress.totalDocuments}
        aria-valuenow={done}
        className="h-1 overflow-hidden bg-foreground/10"
      >
        <div className="h-full bg-foreground transition-all" style={{ width: `${percent}%` }} />
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-secondary">
        <span>{t("written", { count: progress.pagesWritten })}</span>
        <span>{t("improved", { count: progress.pagesImproved })}</span>
        {progress.lastDocumentTitle ? (
          <span className="min-w-0 break-words">{t("nowReading", { title: shortPageTitle(progress.lastDocumentTitle) })}</span>
        ) : null}
      </div>
    </section>
  );
}
