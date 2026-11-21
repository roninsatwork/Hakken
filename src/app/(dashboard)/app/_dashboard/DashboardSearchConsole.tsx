"use client";

import { useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { periodSpan, ukDay } from "@/convex/utils/calendarPeriods";
import { CHART_SERIES_ORANGE } from "@/src/ui/components/charts/chartPalette";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { ExplorerToolbar } from "@/src/ui/components/screens/ChartExplorer";
import { formatShortDay } from "../_learn/learnDates";
import { SiteLineChart } from "../sites/_components/SiteCharts";
import { useSiteParam } from "../sites/_components/useSiteParam";
import { weekOf } from "./dashboardWeeks";

/**
 * The client Dashboard's Search Console section (dashboard-way-1-plan-2026-11-21.md). The page draws it only while Search
 * Console is switched on for the company and for everyone, so it may read Search Console's own reads
 * (`src/section-gate-drift.test.ts`, `SWITCHED_PARTS`).
 */

type ConsoleShow = "clicks" | "impressions" | "ctr" | "position";
const CONSOLE_SHOWS: readonly ConsoleShow[] = ["clicks", "impressions", "ctr", "position"];

/** Google's figures each week for the last 12 months, Google's updates marked by the chart itself. Show picks the figure. */
export function DashboardSearchConsole({ siteId }: { siteId: Id<"companyWebsites"> }) {
  const t = useTranslations("dashboard.searchConsole");
  const tm = useTranslations("dashboard.menus");
  const locale = useLocale();
  const [show, setShow] = useSiteParam<ConsoleShow>("consoleShow", "clicks", CONSOLE_SHOWS);
  const status = useQuery(api.searchConsoleConnect.searchConsoleStatus, { siteId });
  const newest = status?.connection?.newestDay ?? null;
  const span = newest ? periodSpan("last12Months", ukDay(), newest) : null;
  const performance = useQuery(api.searchConsoleReads.searchConsolePerformance, span ? { siteId, searchType: "web", from: span.from, to: span.to, period: "last12Months" } : "skip");
  const weeks = new Map<string, { clicks: number; impressions: number; placed: number }>();
  for (const day of performance?.days ?? []) {
    const week = weeks.get(weekOf(day.day)) ?? { clicks: 0, impressions: 0, placed: 0 };
    week.clicks += day.clicks;
    week.impressions += day.impressions;
    week.placed += (day.position ?? 0) * day.impressions;
    weeks.set(weekOf(day.day), week);
  }
  const figureOf = (week: { clicks: number; impressions: number; placed: number }) => {
    if (show === "clicks") return week.clicks;
    if (show === "impressions") return week.impressions;
    if (show === "ctr") return week.impressions ? Number(((week.clicks / week.impressions) * 100).toFixed(2)) : 0;
    return week.impressions ? Number((week.placed / week.impressions).toFixed(1)) : 0;
  };
  const rows = [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, week]) => ({ day, label: formatShortDay(day, locale), value: figureOf(week) }));
  return (
    <ChartCard
      title={t("title")}
      hint={t("hint")}
      exportName="dashboard-google-each-week"
      enoughData={rows.length > 1}
      controls={<ExplorerToolbar controls={[{ kind: "select", key: "show", label: tm("show"), value: show, options: CONSOLE_SHOWS.map((value) => ({ value, label: tm(value) })), onChange: (next) => setShow(next as ConsoleShow) }]} />}
    >
      <SiteLineChart data={rows} series={[{ key: "value", name: tm(show), colour: CHART_SERIES_ORANGE, ...(show === "position" ? { reversed: true } : {}) }]} />
    </ChartCard>
  );
}
