"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarClock, Globe } from "lucide-react";
import { useTranslations } from "next-intl";
import Header from "@/src/ui/components/layout/Header";
import { DetailHeader, PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Notice } from "@/src/ui/components/screens/Notice";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TitleSwitch } from "@/src/ui/components/screens/TitleSwitch";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { formatDateTime } from "@/src/lib/dates";
import { openingPeriod, ukDay, unitOf } from "@/convex/utils/calendarPeriods";
import { SiteDateRange } from "../../sites/_components/SiteDateRange";
import { formatDay } from "../../sites/_components/siteFormat";
import { SiteMark } from "../../sites/_components/SiteMark";
import { OpeningPeriodContext } from "../../sites/_components/useCalendarPeriod";
import { sharedSiteQuery } from "../../sites/_components/useSiteParam";
import { SearchConsoleCountryPicker } from "../_components/SearchConsoleCountryPicker";
import { SearchConsoleMenu } from "../_components/SearchConsoleMenu";
import { ConnectionBanner } from "../_components/SearchConsoleNotices";
import {
  pageForPath,
  searchConsoleQuery,
  useSearchConsoleRange,
  useSearchConsoleSiteId,
  useSearchConsoleStatus,
  type SearchConsolePageId,
} from "../_components/useSearchConsole";

/**
 * One website in the Search Console section: its header, the switch between
 * the company's own websites, the country choice beside the shared date range
 * (search-console-plan.md §16), the menu, and the page.
 * A website opens on top of the section's list, so it wears the record-level
 * header with the way back (docs/developer/screen-kit.md, "Headers"): the
 * standard website header (Anthony, 2026-10-30; the compact one of
 * 2026-10-15 before it, docs/plans/active/ga-header-plan.md) — the website's
 * name is the switch, on its own row; "Updated …", the country and the dates
 * share the row under it. Read through the caller's own hold:
 * another company's website answers exactly as a missing one does.
 */
export default function SearchConsoleSiteLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("searchConsole.site");
  const ts = useTranslations("searchConsole.status");
  const router = useRouter();
  const params = useSearchParams();
  const siteId = useSearchConsoleSiteId();
  const status = useSearchConsoleStatus();

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

  return (
    // A website whose days begin this month opens on This month until the 1st (agreed 2026-10-20).
    <OpeningPeriodContext.Provider value={openingPeriod(connection?.daysFrom, ukDay())}>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <DetailHeader
          layout="compact"
          back={{ label: t("back"), href: `/app/search-console${sharedSiteQuery(params)}` }}
          // The website's mark, as Sites' lists draw it: its letter until `searchConsoleStatus` sends its icon.
          icon={<SiteMark host={status.host} iconUrl={status.iconUrl} owned />}
          title={
            status.ownSites.length > 1 ? (
              <TitleSwitch
                label={status.host}
                aria-label={t("switch")}
                value={siteId}
                onChange={(next) => router.push(`/app/search-console/${next}${searchConsoleQuery(params)}`)}
              >
                {status.ownSites.map((site) => <option key={site.siteId} value={site.siteId}>{site.host}</option>)}
              </TitleSwitch>
            ) : status.host
          }
          pills={
            state === "CONNECTED" && connection?.lastCollectedAt ? (
              <StatusLabel tone="success">{t("updated", { when: formatDateTime(connection.lastCollectedAt) })}</StatusLabel>
            ) : (
              <StatusLabel tone={state === "NEEDS_RECONNECT" ? "warning" : state === "CONNECTED" ? "success" : "neutral"}>{ts(state)}</StatusLabel>
            )
          }
          action={
            <div className="flex flex-wrap items-end gap-3">
              <SearchConsoleCountryPicker />
              {/* The date menu's seven calendar periods (calendar-periods-plan.md, phase 4). */}
              <SiteDateRange newest={connection?.newestDay ?? null} custom />
            </div>
          }
        />

        <ConnectionBanner status={status} siteId={siteId} />
        {connection?.clearing ? <Notice>{t("clearing")}</Notice> : null}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-4 lg:self-start">
            <SearchConsoleMenu siteId={siteId} />
          </aside>
          <section className="flex min-w-0 flex-col gap-3">
            <PeriodDays siteId={siteId} newestDay={connection?.newestDay ?? null}>{children}</PeriodDays>
          </section>
        </div>
      </div>
    </OpeningPeriodContext.Provider>
  );
}

/** The pages that keep days of their own rather than the menu's: the latest inspection, Volatility's newest days, Google updates' windows, the connection. */
const OWN_DAYS: ReadonlySet<SearchConsolePageId> = new Set(["indexing", "volatility", "updates", "connection"]);

/**
 * A page reading the date menu, or — while Google has sent none of a period still going, This week on a Monday — its
 * title and one plain line in place of an empty page (calendar-periods-plan.md, rule 9), so nothing is asked of
 * Google for days it does not have yet.
 */
function PeriodDays({ siteId, newestDay, children }: { siteId: string; newestDay: string | null; children: React.ReactNode }) {
  const tm = useTranslations("searchConsole.menu");
  const tp = useTranslations("common.periods");
  const source = useTranslations("sidebar")("searchConsole");
  const page = pageForPath(usePathname(), siteId);
  const range = useSearchConsoleRange(newestDay);
  if (!range.waiting || !range.newest || range.period === "custom" || OWN_DAYS.has(page)) return <>{children}</>;
  return (
    <>
      <PageHeader icon={<CalendarClock className="h-5 w-5 text-brand" />} title={tm(page)} />
      <Notice>{tp("noDaysYet", { source, unit: unitOf(range.period), day: formatDay(range.newest) })}</Notice>
    </>
  );
}
