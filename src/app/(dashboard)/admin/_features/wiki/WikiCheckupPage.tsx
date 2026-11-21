"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { SectionLabel } from "@/src/ui/components/screens/SectionLabel";
import { WikiCheckupScreen } from "./WikiCheckupScreen";

/**
 * The Check-up menu line's page (wiki-sonae-catch-up-plan-2026-11-21.md, S6,
 * as the upstream framework's `be63693c` lays it out): the nightly check-up
 * (`WikiCheckupScreen`, S8), then This week, which was a strip of words at the
 * top of the wiki's long page. With `companyId` it's that company's wiki, and
 * This week also counts what was answered from it and what it couldn't answer.
 */
export function WikiCheckupPage({ companyId, waitingHref }: { companyId?: Id<"companies">; waitingHref: string }) {
  return (
    <div className="flex w-full min-w-0 flex-col">
      <WikiCheckupScreen companyId={companyId} />
      <WikiWeekFigures companyId={companyId} waitingHref={waitingHref} />
    </div>
  );
}

/**
 * This week, as figures: pages learned or improved, the staff's rounds and
 * what's waiting on you, which opens Waiting on you. A company's also shows
 * what was answered from its wiki and what wasn't.
 */
function WikiWeekFigures({ companyId, waitingHref }: { companyId?: Id<"companies">; waitingHref: string }) {
  const t = useTranslations("aiPages.week");
  const companyWeek = useQuery(api.wikiReport.getWeeklyReportForCompany, companyId ? { companyId } : "skip");
  const globalWeek = useQuery(api.wikiReport.getWeeklyReportForGlobal, companyId ? "skip" : {});
  const week = companyId ? companyWeek : globalWeek;
  if (!week) return null;

  return (
    <section aria-label={t("title")} className="flex flex-col gap-3 pb-12">
      <SectionLabel>{t("title")}</SectionLabel>
      <FigureRow columns={3}>
        <Figure label={t("pages")} value={week.pagesNew + week.pagesImproved} />
        {companyId ? <Figure label={t("answered")} value={week.answered} /> : null}
        {companyId ? <Figure label={t("unanswered")} value={week.unanswered} /> : null}
        <Figure label={t("staffRuns")} value={week.staffRuns} />
        <Figure label={t("waiting")} value={week.waitingReviews + week.waitingQuestions} href={waitingHref} />
      </FigureRow>
    </section>
  );
}
