"use client";

import { useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { periodSpan, ukDay } from "@/convex/utils/calendarPeriods";
import { CHART_SERIES_AMBER, CHART_SERIES_BLUE, CHART_SERIES_ORANGE, CHART_SERIES_ROSE, CHART_SERIES_TEAL, CHART_SERIES_VIOLET } from "@/src/ui/components/charts/chartPalette";
import { ChannelMap, type ChannelMapRow } from "@/src/ui/components/screens/ChannelMap";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { ExplorerToolbar } from "@/src/ui/components/screens/ChartExplorer";
import { useEngineLabel } from "@/src/ui/components/seo/engineLabel";
import { formatShortDay } from "../_learn/learnDates";
import { SiteLineChart } from "../sites/_components/SiteCharts";
import { formatNumber } from "../sites/_components/siteFormat";
import { useSiteParam, useSiteTicks } from "../sites/_components/useSiteParam";

/**
 * The client Dashboard's Visibility section (dashboard-way-1-plan-2026-11-21.md). The page draws it only while Visibility is
 * switched on for the company and for everyone, so it may read Visibility's own reads (`src/section-gate-drift.test.ts`,
 * `SWITCHED_PARTS`).
 */

type RivalShow = "traffic" | "keywords";
const RIVAL_SHOWS: readonly RivalShow[] = ["traffic", "keywords"];

const RIVAL_COLOURS = [CHART_SERIES_BLUE, CHART_SERIES_VIOLET, CHART_SERIES_TEAL, CHART_SERIES_AMBER, CHART_SERIES_ROSE];

/** You and your rivals at each check, a line each, yours in orange. Show picks the figure; Websites picks the lines. */
function DashboardRivals({ siteId }: { siteId: Id<"companyWebsites"> }) {
  const t = useTranslations("dashboard.visibility");
  const tm = useTranslations("dashboard.menus");
  const locale = useLocale();
  const [show, setShow] = useSiteParam<RivalShow>("rivalShow", "traffic", RIVAL_SHOWS);
  const [picked, setPicked] = useSiteTicks("rivals");
  const today = ukDay();
  const span = periodSpan("last6Months", today, today)!;
  const lines = useQuery(api.siteCharts.siteSeries, { siteId, from: span.from, to: span.to, step: "week", withRivals: true });
  const hosts = (lines ?? []).map((line) => line.host);
  const ticked = (picked ?? hosts).filter((host) => hosts.includes(host));
  const byDay = new Map<string, Record<string, unknown>>();
  for (const line of lines ?? []) {
    if (!ticked.includes(line.host)) continue;
    for (const point of line.points) {
      const value = show === "traffic" ? point.estimatedTraffic : point.keywords;
      if (value === undefined || value === null) continue;
      const row = byDay.get(point.day) ?? { day: point.day, label: formatShortDay(point.day, locale) };
      row[line.host] = Math.round(value);
      byDay.set(point.day, row);
    }
  }
  const rows = [...byDay.values()].sort((a, b) => String(a.day).localeCompare(String(b.day)));
  let rival = 0;
  const colours = new Map((lines ?? []).map((line) => [line.host, line.isYou ? CHART_SERIES_ORANGE : RIVAL_COLOURS[rival++ % RIVAL_COLOURS.length]]));
  const series = ticked.map((host) => ({ key: host, name: host, colour: colours.get(host) ?? CHART_SERIES_BLUE }));
  return (
    <ChartCard
      title={t("rivalsTitle")}
      hint={t("rivalsHint")}
      exportName="dashboard-you-and-your-rivals"
      enoughData={rows.length > 1}
      controls={(
        <ExplorerToolbar controls={[
          { kind: "select", key: "show", label: tm("show"), value: show, options: RIVAL_SHOWS.map((value) => ({ value, label: tm(value) })), onChange: (next) => setShow(next as RivalShow) },
          { kind: "ticks", key: "websites", label: tm("websites"), everyWord: tm("everyWebsite"), choices: hosts.map((host) => ({ key: host, label: host })), ticked, onChange: setPicked },
        ]} />
      )}
    >
      <SiteLineChart data={rows} series={series} breakGaps />
    </ChartCard>
  );
}

/** How often each AI assistant named you and each rival, as the Channels page's squares. */
function DashboardAiAnswers({ siteId }: { siteId: Id<"companyWebsites"> }) {
  const t = useTranslations("dashboard.visibility");
  const tm = useTranslations("dashboard.menus");
  const engineName = useEngineLabel();
  const share = useQuery(api.siteAi.shareOfVoice, { siteId });
  const engines = share ?? [];
  const sites = new Map<string, { host: string; isYou: boolean }>();
  for (const engine of engines) for (const site of engine.sites) sites.set(site.websiteId, { host: site.host, isYou: site.isYou });
  const [picked, setPicked] = useSiteTicks("aiSites");
  const hosts = [...sites.values()].map((site) => site.host);
  const ticked = (picked ?? hosts).filter((host) => hosts.includes(host));
  const rows: ChannelMapRow[] = [...sites.entries()]
    .filter(([, site]) => ticked.includes(site.host))
    .map(([websiteId, site]) => {
      const cells = engines.map((engine) => {
        const named = engine.sites.find((one) => one.websiteId === websiteId)?.named ?? 0;
        return { visits: named, conversions: 0, hover: `${named}` };
      });
      return { key: websiteId, label: site.host, total: t("aiTotal", { count: cells.reduce((sum, cell) => sum + cell.visits, 0), figure: formatNumber(cells.reduce((sum, cell) => sum + cell.visits, 0)) }), cells, isYou: site.isYou };
    })
    .sort((a, b) => Number(b.isYou) - Number(a.isYou) || b.cells.reduce((s, c) => s + c.visits, 0) - a.cells.reduce((s, c) => s + c.visits, 0));
  const columns = engines.map((engine) => engineName(engine.engine));
  return (
    <ChartCard
      title={t("aiTitle")}
      hint={t("aiHint")}
      exportName="dashboard-ai-answers"
      enoughData={hosts.length > 0}
      controls={<ExplorerToolbar controls={[{ kind: "ticks", key: "websites", label: tm("websites"), everyWord: tm("everyWebsite"), choices: hosts.map((host) => ({ key: host, label: host })), ticked, onChange: setPicked }]} />}
    >
      <ChannelMap
        columns={columns}
        rows={rows}
        rowVisits={(row) => row.cells.reduce((sum, cell) => sum + cell.visits, 0)}
        conversionsWord={() => ""}
        legend={{ visits: t("aiNamed"), shades: t("aiShades"), empty: t("aiEmpty") }}
      />
    </ChartCard>
  );
}

/** Visibility's section: you and your rivals over time, then how often each AI assistant names each of you. */
export function DashboardVisibility({ siteId }: { siteId: Id<"companyWebsites"> }) {
  return (
    <>
      <DashboardRivals siteId={siteId} />
      <DashboardAiAnswers siteId={siteId} />
    </>
  );
}
