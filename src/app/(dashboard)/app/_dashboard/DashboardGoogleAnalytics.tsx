"use client";

import { useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ORGANIC_SEARCH_CHANNEL } from "@/convex/utils/aiAssistants";
import type { MenuPeriod } from "@/convex/utils/calendarPeriods";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { ExplorerToolbar } from "@/src/ui/components/screens/ChartExplorer";
import { formatShortDay } from "../_learn/learnDates";
import { CHANNEL_LINE_COLOURS } from "../analytics/_components/AnalyticsChart";
import { OverviewBandsCard, useOverviewReads } from "../analytics/_components/OverviewParts";
import { useAnalyticsStatus } from "../analytics/_components/useAnalytics";
import { SiteBarChart } from "../sites/_components/SiteCharts";
import { useSiteParam, useSiteTicks } from "../sites/_components/useSiteParam";

/**
 * The client Dashboard's Google Analytics section (dashboard-way-1-plan-2026-11-21.md). The page draws it only while Google
 * Analytics is switched on for the company and for everyone, so it may read Google Analytics' own reads
 * (`src/section-gate-drift.test.ts`, `SWITCHED_PARTS`).
 */

type VisitsShow = "visits" | "events";
const VISITS_SHOWS: readonly VisitsShow[] = ["visits", "events"];
/** The channel Visits each day opens on. */
const OPENING_CHANNEL = ORGANIC_SEARCH_CHANNEL;

/**
 * Visits each day as a column, opening on Organic Search alone (Anthony, 21 November 2026: "default to organic search on the
 * drop down"). Tick more channels and they stack, each in its Channels colour. Show counts visits or the events that count.
 */
function DashboardVisitsByChannel({ siteId, period }: { siteId: Id<"companyWebsites">; period: MenuPeriod }) {
  const t = useTranslations("dashboard.analytics");
  const tm = useTranslations("dashboard.menus");
  const locale = useLocale();
  const [picked, setPicked] = useSiteTicks("channels");
  const [show, setShow] = useSiteParam<VisitsShow>("visitsShow", "visits", VISITS_SHOWS);
  const days = useQuery(api.googleAnalyticsChannelPageReads.analyticsChannelsEachDay, { siteId, period, device: "" });
  const channels = days?.channels ?? [];
  const opening = channels.includes(OPENING_CHANNEL) ? [OPENING_CHANNEL] : channels.slice(0, 1);
  const ticked = (picked ?? opening).filter((channel) => channels.includes(channel));
  const counted = (days?.events ?? []).flatMap((event, at) => (event.counted ? [at] : []));
  const figure = (point: NonNullable<typeof days>["points"][number], at: number) => (show === "visits"
    ? point.visits[at] ?? 0
    : counted.reduce((sum, event) => sum + (point.events[event]?.[at] ?? 0), 0));
  const rows = (days?.points ?? []).map((point) => ({
    day: point.day,
    label: formatShortDay(point.day, locale),
    ...Object.fromEntries(ticked.map((channel) => [channel, figure(point, channels.indexOf(channel))])),
  }));
  const series = ticked.map((channel) => ({ key: channel, name: channel, colour: CHANNEL_LINE_COLOURS[channels.indexOf(channel) % CHANNEL_LINE_COLOURS.length] }));
  return (
    <ChartCard
      title={t("title")}
      hint={t("hint")}
      exportName="dashboard-visits-by-channel"
      enoughData={rows.length > 0}
      controls={(
        <ExplorerToolbar controls={[
          { kind: "ticks", key: "channels", label: tm("channels"), everyWord: tm("everyChannel"), choices: channels.map((channel) => ({ key: channel, label: channel })), ticked, onChange: setPicked },
          { kind: "select", key: "show", label: tm("show"), value: show, options: VISITS_SHOWS.map((value) => ({ value, label: tm(value) })), onChange: (next) => setShow(next as VisitsShow) },
        ]} />
      )}
    >
      <SiteBarChart data={rows} series={series} stacked height={260} />
    </ChartCard>
  );
}

/** Who visits, and who gets in touch (or buys): Overview's own card, for the website handed down. */
function DashboardAnalyticsStrips() {
  const status = useAnalyticsStatus();
  return status ? <DashboardStripsCard status={status} /> : null;
}

function DashboardStripsCard({ status }: { status: NonNullable<ReturnType<typeof useAnalyticsStatus>> }) {
  const reads = useOverviewReads(status);
  return <OverviewBandsCard reads={reads} status={status} />;
}

/** Google Analytics' section: visits each day by channel, then who visits and who gets in touch. */
export function DashboardGoogleAnalytics({ siteId, period }: { siteId: Id<"companyWebsites">; period: MenuPeriod }) {
  return (
    <>
      <DashboardVisitsByChannel siteId={siteId} period={period} />
      <DashboardAnalyticsStrips />
    </>
  );
}
