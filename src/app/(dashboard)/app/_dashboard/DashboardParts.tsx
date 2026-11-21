"use client";

import { useMemo, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { periodSpan, spanBefore, ukDay, type MenuPeriod } from "@/convex/utils/calendarPeriods";
import { useSpanName } from "@/src/hooks/useSpanName";
import { CHART_SERIES_BLUE, CHART_SERIES_ORANGE, CHART_SERIES_ROSE, CHART_SERIES_VIOLET } from "@/src/ui/components/charts/chartPalette";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { HakkenSees } from "@/src/ui/components/screens/HakkenSees";
import { Sparkline } from "@/src/ui/components/screens/Sparkline";
import { DASHBOARD_ARTICLE_DAYS, ReadingRoomFront } from "../news/_components/NewsFrontPage";
import { formatNumber } from "../sites/_components/siteFormat";

/**
 * The client Dashboard's parts that are always on (docs/plans/active/dashboard-way-1-plan-2026-11-21.md, Way 1): a section's
 * heading, the four numbers and the Reading room. Nothing here reads a source's own reads, so the page works whichever
 * sources a company has switched off: the four numbers come from `dashboard.dashboardFigures`, which skips a source that's
 * off. Each source's section is in a file of its own (`Dashboard<Source>.tsx`), drawn only while that source is on.
 * Nothing here asks Google: every figure is one the sections have already saved.
 */

/** A section's name over its charts, with the section's own menu icon. */
export function DashboardSection({ title, icon, line, children }: { title: string; icon: ReactNode; line?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4" aria-label={title}>
      <div>
        <h2 data-part-title className="flex items-center gap-2 text-[14px] font-medium text-foreground">{icon}{title}</h2>
        {line ? <p className="text-[12px] text-secondary">{line}</p> : null}
      </div>
      {children}
    </section>
  );
}

const percentChange = (now: number, before: number) => {
  const change = (Math.abs(now - before) / before) * 100;
  return `${change < 10 ? Number(change.toFixed(1)) : Math.round(change)}%`;
};

/** The four numbers, each with a small line of its days, added up over the company's own websites or the one chosen. */
export function DashboardNumbers({ period, siteId, firstSite, websites }: {
  period: MenuPeriod;
  siteId?: Id<"companyWebsites">;
  firstSite?: Id<"companyWebsites">;
  /** The websites the numbers add up, by name, for the eye's writer: every own website, or the one the menu picks. */
  websites: readonly string[];
}) {
  const t = useTranslations("dashboard.numbers");
  const ts = useTranslations("dashboard.sections");
  const figures = useQuery(api.dashboard.dashboardFigures, { period, ...(siteId ? { siteId } : {}) });
  const websitesKey = websites.join(",");
  // The eye's figures (convex/utils/sees/own/dashboard.ts): the four numbers and the websites they add up, never their ids.
  const eyeData = useMemo(
    () => (figures ? { shop: figures.shop, websites: websitesKey.split(","), analytics: figures.analytics, searchConsole: figures.searchConsole } : null),
    [figures, websitesKey],
  );
  const today = ukDay();
  const newest = figures?.analytics?.visits.days.at(-1)?.day ?? figures?.searchConsole?.clicks.days.at(-1)?.day ?? today;
  const span = periodSpan(period, today, newest);
  const before = span ? spanBefore(period, span) : null;
  // The span before by its name where it's a calendar month ("September"), else in the date menu's words.
  const spanName = useSpanName();
  const tp = useTranslations("common.periods");
  const words = { before: spanName(before ? { from: before.from, to: before.to } : null) ?? tp(`before.${period}`) };
  if (!figures || (!figures.analytics && !figures.searchConsole)) return null;
  const versus = (now: number, then: number | null) => {
    if (then === null || then === 0) return undefined;
    if (now === then) return <span className="text-secondary">{t("same", { before: words.before })}</span>;
    return now > then
      ? <span className="text-success">{t("more", { change: percentChange(now, then), before: words.before })}</span>
      : <span className="text-destructive">{t("fewer", { change: percentChange(now, then), before: words.before })}</span>;
  };
  const line = (name: string, values: readonly number[], colour: string) => <Sparkline values={values} colour={colour} label={t("days", { name })} />;
  const analyticsHref = firstSite ? `/app/analytics/${firstSite}` : undefined;
  const consoleHref = firstSite ? `/app/search-console/${firstSite}` : undefined;
  const ga = figures.analytics;
  const sc = figures.searchConsole;
  const done = figures.shop ? t("bought") : t("events");
  // Where the eye's "Do first" steps may send the reader: each source the numbers come from.
  const links = [
    ...(ga && analyticsHref ? [{ label: ts("googleAnalytics"), href: analyticsHref }] : []),
    ...(sc && consoleHref ? [{ label: ts("searchConsole"), href: consoleHref }] : []),
  ];
  return (
    <>
    {eyeData ? <HakkenSees says={[]} steps={[]} page={{ screen: "dashboard.home", ...(firstSite ? { siteId: firstSite } : {}), period, data: eyeData, links }} /> : null}
    <FigureRow>
      {ga ? (
        <>
          <Figure label={t("visits")} href={analyticsHref} value={formatNumber(ga.visits.now)} detail={versus(ga.visits.now, ga.visits.before)}
            foot={line(t("visits"), ga.visits.days.map((day) => day.value), CHART_SERIES_ORANGE)} />
          <Figure label={done} href={analyticsHref} value={formatNumber(ga.done.now)}
            detail={ga.visits.now > 0 ? <span className="text-secondary">{t("rate", { rate: ((ga.done.now / ga.visits.now) * 100).toFixed(1) })}</span> : undefined}
            foot={line(done, ga.done.days.map((day) => day.value), CHART_SERIES_ROSE)} />
        </>
      ) : null}
      {sc ? (
        <>
          <Figure label={t("clicks")} href={consoleHref} value={formatNumber(sc.clicks.now)} detail={versus(sc.clicks.now, sc.clicks.before)}
            foot={line(t("clicks"), sc.clicks.days.map((day) => day.value), CHART_SERIES_BLUE)} />
          <Figure label={t("impressions")} href={consoleHref} value={formatNumber(sc.impressions.now)} detail={versus(sc.impressions.now, sc.impressions.before)}
            foot={line(t("impressions"), sc.impressions.days.map((day) => day.value), CHART_SERIES_VIOLET)} />
        </>
      ) : null}
    </FigureRow>
    </>
  );
}

/** The Reading room's own front page: the lead story, the last three Google updates and the newest stories. */
export function DashboardReadingRoom() {
  return <ReadingRoomFront dashboard articleDays={DASHBOARD_ARTICLE_DAYS} />;
}
