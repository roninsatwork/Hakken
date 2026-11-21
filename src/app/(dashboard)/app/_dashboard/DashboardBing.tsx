"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { MenuPeriod } from "@/convex/utils/calendarPeriods";
import { CHART_SERIES_TEAL } from "@/src/ui/components/charts/chartPalette";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { ExplorerToolbar } from "@/src/ui/components/screens/ChartExplorer";
import { Notice } from "@/src/ui/components/screens/Notice";
import { formatShortDay } from "../_learn/learnDates";
import { SiteLineChart } from "../sites/_components/SiteCharts";
import { useSiteParam } from "../sites/_components/useSiteParam";
import { weekOf } from "./dashboardWeeks";

/**
 * The client Dashboard's Bing Webmaster section (dashboard-way-1-plan-2026-11-21.md). The page draws it only while Bing
 * Webmaster is switched on for the company and for everyone, so it may read Bing's own reads
 * (`src/section-gate-drift.test.ts`, `SWITCHED_PARTS`).
 */

type BingShow = "clicks" | "impressions";
const BING_SHOWS: readonly BingShow[] = ["clicks", "impressions"];

/** Clicks from Bing each week, or a notice and the way to connect it. */
export function DashboardBing({ siteId, period }: { siteId: Id<"companyWebsites">; period: MenuPeriod }) {
  const t = useTranslations("dashboard.bing");
  const tm = useTranslations("dashboard.menus");
  const locale = useLocale();
  const [show, setShow] = useSiteParam<BingShow>("bingShow", "clicks", BING_SHOWS);
  const status = useQuery(api.bingWebmasterConnect.bingStatus, { siteId });
  const connected = status?.connection?.status === "CONNECTED";
  const performance = useQuery(api.bingWebmasterReads.bingPerformance, connected ? { siteId, period } : "skip");
  if (status === undefined) return null;
  if (!connected) {
    return (
      <ChartCard title={t("title")} hint={t("hint")}>
        <Notice
          action={(
            <Link href={`/app/bing-webmaster/${siteId}/connection`} className="rounded-[8px] border border-border-dim bg-white/[0.03] px-3 py-1.5 text-[12px] font-medium text-secondary transition-all hover:bg-white/[0.06] hover:text-foreground">
              {t("connect")}
            </Link>
          )}
        >
          {t("notConnected")}
        </Notice>
      </ChartCard>
    );
  }
  const weeks = new Map<string, number>();
  for (const day of performance?.days ?? []) weeks.set(weekOf(day.day), (weeks.get(weekOf(day.day)) ?? 0) + (show === "clicks" ? day.clicks : day.impressions));
  const rows = [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, value]) => ({ day, label: formatShortDay(day, locale), value }));
  return (
    <ChartCard
      title={t("title")}
      hint={t("hint")}
      exportName="dashboard-bing"
      enoughData={rows.length > 1}
      controls={<ExplorerToolbar controls={[{ kind: "select", key: "show", label: tm("show"), value: show, options: BING_SHOWS.map((value) => ({ value, label: tm(value) })), onChange: (next) => setShow(next as BingShow) }]} />}
    >
      <SiteLineChart data={rows} series={[{ key: "value", name: tm(show), colour: CHART_SERIES_TEAL }]} />
    </ChartCard>
  );
}
