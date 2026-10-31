"use client";

import { SeesStandIn } from "@/src/ui/components/screens/SeesStandIn";
import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { CalendarClock, Globe } from "lucide-react";
import { useTranslations } from "next-intl";
import Header from "@/src/ui/components/layout/Header";
import { DetailHeader, PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Notice } from "@/src/ui/components/screens/Notice";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TitleSwitch } from "@/src/ui/components/screens/TitleSwitch";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { formatDateTime } from "@/src/lib/dates";
import { isCalendarPeriod, openingPeriod, periodSpan, ukDay, unitOf } from "@/convex/utils/calendarPeriods";
import { formatDay } from "../../sites/_components/siteFormat";
import { shiftDay } from "../../sites/_components/siteRange";
import { SiteMark } from "../../sites/_components/SiteMark";
import { AnalyticsFilters } from "../_components/AnalyticsFilters";
import { AnalyticsMenu } from "../_components/AnalyticsMenu";
import { AnalyticsConnectionBanner } from "../_components/AnalyticsNotices";
import { OpeningPeriodContext } from "../../sites/_components/useCalendarPeriod";
import { analyticsQuery, pageForPath, useAnalyticsDates, useAnalyticsSiteId, usePeriod, useAnalyticsStatus, type AnalyticsPageId } from "../_components/useAnalytics";

/**
 * One website in the Google Analytics section (docs/plans/active/google-analytics-plan.md
 * §5, §11): its header with the way back, the switch between the company's own
 * websites, the device, dates and step every page reads, the menu, and the
 * page. Read through the caller's own hold: another company's website answers
 * exactly as a missing one does.
 *
 * The header is the standard website header (Anthony, 2026-10-30, on the
 * Conversions canvas; before it the compact one of 2026-10-15,
 * docs/plans/active/ga-header-plan.md): the website's name is the switch, on
 * its own row; "Updated …" and the filters share the row under it. The
 * property line and the "figures to" line went as clutter.
 */
export default function AnalyticsSiteLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("googleAnalytics.site");
  const ts = useTranslations("googleAnalytics.status");
  const router = useRouter();
  const params = useSearchParams();
  const siteId = useAnalyticsSiteId();
  const status = useAnalyticsStatus();
  // Custom dates' lists are asked of Google when first asked for (googleAnalyticsLive.ts, prepareAnalyticsCustom): once a day.
  const [choice] = useAnalyticsDates();
  const prepare = useAction(api.googleAnalyticsLive.prepareAnalyticsCustom);
  const custom = choice.period === "custom" ? choice : null;
  useEffect(() => {
    if (custom) prepare({ siteId, from: custom.from, to: custom.to }).catch(() => undefined);
  }, [prepare, siteId, custom?.from, custom?.to]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const firstComing = state === "CONNECTED" && !connection?.historyDone;

  // A website whose days begin this month opens on This month until the 1st (agreed 2026-10-20).
  return (
    <OpeningPeriodContext.Provider value={openingPeriod(connection?.oldestDay, ukDay())}>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <DetailHeader
          layout="compact"
          back={{ label: t("back"), href: `/app/analytics${analyticsQuery(params)}` }}
          icon={<SiteMark host={status.host} iconUrl={status.iconUrl} owned />}
          title={
            status.ownSites.length > 1 ? (
              <TitleSwitch
                label={status.host}
                aria-label={t("switch")}
                value={siteId}
                onChange={(next) => router.push(`/app/analytics/${next}${analyticsQuery(params)}`)}
              >
                {status.ownSites.map((site) => <option key={site.siteId} value={site.siteId}>{site.host}</option>)}
              </TitleSwitch>
            ) : status.host
          }
          pills={
            state === "CONNECTED" && connection?.lastCollectedAt && !firstComing ? (
              <StatusLabel tone="success">{t("updated", { when: formatDateTime(connection.lastCollectedAt) })}</StatusLabel>
            ) : firstComing ? (
              <StatusLabel tone="neutral">{t("collectingFirst")}</StatusLabel>
            ) : (
              <StatusLabel tone={state === "NEEDS_RECONNECT" ? "warning" : state === "CONNECTED" ? "success" : "neutral"}>{ts(state)}</StatusLabel>
            )
          }
          action={<AnalyticsFilters />}
        />

        <AnalyticsConnectionBanner status={status} siteId={siteId} />
        {connection?.clearing ? <Notice>{t("clearing")}</Notice> : null}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-4 lg:self-start">
            <AnalyticsMenu siteId={siteId} />
          </aside>
          <section className="flex min-w-0 flex-col gap-3">
            <SeesStandIn section="googleAnalytics" siteId={siteId} off={state === "NOT_CONNECTED"} />
            <PeriodDays siteId={siteId} newestDay={connection?.newestDay ?? null}>{children}</PeriodDays>
          </section>
        </div>
      </div>
    </OpeningPeriodContext.Provider>
  );
}

/** The pages that keep days of their own rather than the menu's: the live minutes, tracking health's checks, the connection. */
const OWN_DAYS: ReadonlySet<AnalyticsPageId> = new Set(["live", "trackingHealth", "connection"]);

/**
 * A page reading the date menu, or — while Google has sent none of a period still going, This month on the 1st —
 * its title and one plain line in place of an empty page (calendar-periods-plan.md, rule 9). The property's newest
 * whole day is yesterday in its own time zone, so its today is the day after.
 */
function PeriodDays({ siteId, newestDay, children }: { siteId: string; newestDay: string | null; children: React.ReactNode }) {
  const tm = useTranslations("googleAnalytics.menu");
  const tp = useTranslations("common.periods");
  const source = useTranslations("sidebar")("googleAnalytics");
  const page = pageForPath(usePathname(), siteId);
  const [period] = usePeriod();
  // Custom dates are never past the newest day (useAnalyticsDates), so always have days.
  if (!newestDay || OWN_DAYS.has(page) || !isCalendarPeriod(period) || periodSpan(period, shiftDay(newestDay, 1), newestDay)) return <>{children}</>;
  return (
    <>
      <PageHeader icon={<CalendarClock className="h-5 w-5 text-brand" />} title={tm(page)} />
      <Notice>{tp("noDaysYet", { source, unit: unitOf(period), day: formatDay(newestDay) })}</Notice>
    </>
  );
}
