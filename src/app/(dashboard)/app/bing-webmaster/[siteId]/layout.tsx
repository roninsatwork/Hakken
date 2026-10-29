"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarClock, Globe } from "lucide-react";
import { useTranslations } from "next-intl";
import Header from "@/src/ui/components/layout/Header";
import { DetailHeader, PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Notice } from "@/src/ui/components/screens/Notice";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { formatDateTime } from "@/src/lib/dates";
import { openingPeriod, periodSpan, ukDay, unitOf, type CalendarPeriod } from "@/convex/utils/calendarPeriods";
import { formatDay } from "../../sites/_components/siteFormat";
import { SiteMark } from "../../sites/_components/SiteMark";
import { BingMenu } from "../_components/BingMenu";
import { BingConnectionBanner } from "../_components/BingNotices";
import { DatesMenu } from "@/src/ui/components/screens/DatesMenu";
import { OpeningPeriodContext } from "../../sites/_components/useCalendarPeriod";
import { useSetSiteParams } from "../../sites/_components/useSiteParam";
import { PERIOD_KEY, STEPS, STEP_KEY, bingQuery, pageForPath, usePeriod, useStep, useBingSiteId, useBingStatus, type BingPageId } from "../_components/useBing";

/**
 * One website in the Bing Webmaster section (docs/plans/active/bing-webmaster-plan.md
 * §5, as drawn on 12 Oct): its header with the way back, the switch between
 * the company's own websites, the dates and step every page reads, the menu,
 * and the page. Read through the caller's own hold: another company's website
 * answers exactly as a missing one does.
 */
export default function BingSiteLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("bingWebmaster.site");
  const ts = useTranslations("bingWebmaster.status");
  const tf = useTranslations("bingWebmaster.filters");
  const router = useRouter();
  const params = useSearchParams();
  const siteId = useBingSiteId();
  const status = useBingStatus();
  const setParams = useSetSiteParams();
  // A website whose Bing days begin this month opens on This month until the 1st (agreed 2026-10-20).
  const opening = openingPeriod(status?.connection?.oldestDay, ukDay());
  const [period] = usePeriod(opening);
  const [step, setStep] = useStep(period);
  // A new period draws in its own step (rule 8): a step chosen for the last one is dropped.
  const choosePeriod = (next: string) => setParams({ [PERIOD_KEY]: next === opening ? null : next, [STEP_KEY]: null });

  if (status === undefined) {
    return (
      <>
        <Header />
        <div className="h-24 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />
      </>
    );
  }
  if (status === null) {
    return (
      <>
        <Header />
        <HakkenEmptyState icon={Globe} title={t("notFoundTitle")} description={t("notFoundDescription")} />
      </>
    );
  }
  if (!status.owned) {
    return (
      <>
        <Header />
        <HakkenEmptyState icon={Globe} title={t("notOwnedTitle")} description={t("notOwnedDescription")} />
      </>
    );
  }

  const connection = status.connection;
  const state = !connection || connection.status === "CONNECTING" ? "NOT_CONNECTED" : connection.status;
  const firstComing = state === "CONNECTED" && !connection?.newestDay;

  return (
    <OpeningPeriodContext.Provider value={opening}>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <DetailHeader
          back={{ label: t("back"), href: `/app/bing-webmaster${bingQuery(params)}` }}
          icon={<SiteMark host={status.host} iconUrl={status.iconUrl} owned />}
          title={status.host}
          description={connection?.site && state !== "CHOOSING" ? t("withSite", { site: connection.site }) : t("yourWebsite")}
          pills={
            state === "CONNECTED" && connection?.lastCollectedAt && !firstComing ? (
              <StatusLabel tone="success">{t("updated", { when: formatDateTime(connection.lastCollectedAt) })}</StatusLabel>
            ) : firstComing ? (
              <StatusLabel tone="neutral">{t("collectingFirst")}</StatusLabel>
            ) : (
              <StatusLabel tone={state === "NEEDS_RECONNECT" ? "warning" : state === "CONNECTED" ? "success" : "neutral"}>{ts(state)}</StatusLabel>
            )
          }
          action={
            <div className="flex flex-wrap items-end gap-3">
              {status.ownSites.length > 1 ? (
                <Select aria-label={t("switch")} value={siteId} onChange={(next) => router.push(`/app/bing-webmaster/${next}${bingQuery(params)}`)}>
                  {status.ownSites.map((site) => <option key={site.siteId} value={site.siteId}>{site.host}</option>)}
                </Select>
              ) : null}
              <DatesMenu value={{ period }} newest={connection?.newestDay ?? null} custom={false} onChange={(choice) => choosePeriod(choice.period)} />
              <Select aria-label={tf("step")} value={step} onChange={(next) => setStep(next as typeof step)} className="w-[140px]">
                {STEPS.map((entry) => <option key={entry} value={entry}>{tf(`steps.${entry}`)}</option>)}
              </Select>
            </div>
          }
        />

        <BingConnectionBanner status={status} siteId={siteId} />
        {connection?.clearing ? <Notice>{t("clearing")}</Notice> : null}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-4 lg:self-start">
            <BingMenu siteId={siteId} />
          </aside>
          <section className="flex min-w-0 flex-col gap-3">
            {connection?.newestDay && state !== "CHOOSING" ? (
              <p className="text-[12px] text-muted">{t("figuresTo", { day: formatDay(connection.newestDay) })}</p>
            ) : null}
            <PeriodDays siteId={siteId} period={period} newestDay={connection?.newestDay ?? null} newestWeek={connection?.newestWeek ?? null}>{children}</PeriodDays>
          </section>
        </div>
      </div>
    </OpeningPeriodContext.Provider>
  );
}

/** The pages whose lists come a Bing week at a time: their days are Bing's newest week's, not its newest day's (rule 2). */
const WEEKLY: ReadonlySet<BingPageId> = new Set(["keywords", "pages", "versus"]);

/**
 * A page reading the date menu, or — while Bing has sent none of a period still going, This week on a Monday — its
 * title and one plain line in place of an empty page (calendar-periods-plan.md, rule 9). Keywords and pages come a
 * Bing week at a time, so they wait for a week ending inside the period; the rest for a day.
 */
function PeriodDays({ siteId, period, newestDay, newestWeek, children }: { siteId: string; period: CalendarPeriod; newestDay: string | null; newestWeek: string | null; children: React.ReactNode }) {
  const tm = useTranslations("bingWebmaster.menu");
  const tp = useTranslations("common.periods");
  const source = useTranslations("sidebar")("bingWebmaster");
  const page = pageForPath(usePathname(), siteId);
  const newest = WEEKLY.has(page) ? newestWeek : newestDay;
  if (page === "connection" || !newest || periodSpan(period, ukDay(), newest)) return <>{children}</>;
  return (
    <>
      <PageHeader icon={<CalendarClock className="h-5 w-5 text-brand" />} title={tm(page)} />
      <Notice>{tp("noDaysYet", { source, unit: unitOf(period), day: formatDay(newest) })}</Notice>
    </>
  );
}
