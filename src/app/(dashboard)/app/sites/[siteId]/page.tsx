"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { LayoutDashboard } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/src/ui/components/screens/Button";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { SiteChartCard } from "../_components/SiteChartCard";
import { SITE_SERIES_COLOURS, SiteLineChart, SiteStackedAreaChart } from "../_components/SiteCharts";
import { useSiteRange } from "../_components/SiteDateRange";
import { formatShortDay, toCsv } from "../_components/siteFormat";
import { shiftDay, shiftMonth } from "../_components/siteRange";
import { useSite, useSiteId } from "../_components/useSite";
import { newestOfEach } from "./newestOfEach";
import { OverviewPanels } from "./OverviewPanels";
import { OverviewSections } from "./OverviewSections";

type Measure = "estimatedTraffic" | "trafficValue" | "keywords" | "pages" | "referringDomains" | "backlinks" | "domainRank" | "aiNamed" | "crawledPages";
type Tab = "metrics" | "competitors" | "years";
type Point = NonNullable<ReturnType<typeof useSeries>>[number]["points"][number];

const MEASURES: Measure[] = ["estimatedTraffic", "trafficValue", "keywords", "pages", "referringDomains", "backlinks", "domainRank", "aiNamed", "crawledPages"];

const BANDS = ["p01_03", "p04_10", "p11_20", "p21_50", "p51_up"] as const;

function useSeries(from: string, to: string, step: "day" | "week" | "month", withRivals: boolean, skip = false) {
  const siteId = useSiteId();
  return useQuery(api.siteCharts.siteSeries, skip ? "skip" : { siteId, from, to, step, withRivals });
}

/** A measure's value at a point: DataForSEO's own keyword count where it has one. */
function valueOf(point: Point | null | undefined, measure: Measure): number | null {
  if (!point) return null;
  switch (measure) {
    case "keywords":
      return point.rankedKeywordsTotal ?? point.keywords ?? null;
    case "aiNamed":
      return point.ai.length === 0 ? null : point.ai.reduce((sum, engine) => sum + engine.named, 0);
    default:
      return point[measure] ?? null;
  }
}

/**
 * Overview, laid out as Ahrefs lays out a site's dashboard (drawn on the
 * "Hakken Sites Overview Drawing" canvas and agreed, Anthony, 2026-09-25):
 * three headline panels — Search, Backlink profile, AI answers — with what
 * changed since the day before the dates chosen; the performance chart with
 * tick boxes, and tabs to lay the competitors over it or set this year
 * against last (D11); the position bands; then pages by kind and by visits,
 * the searches by what they are for, and the top competitors, each chart on
 * a row of its own. The figures are day summaries; the splits come from
 * `overviewExtras`, one bounded read each.
 */
export default function SiteOverviewPage() {
  const t = useTranslations("sites.overview");
  const tm = useTranslations("sites.measures");
  const siteId = useSiteId();
  const site = useSite();
  const range = useSiteRange();
  const extras = useQuery(api.siteOverview.overviewExtras, { siteId });
  const [tab, setTab] = useState<Tab>("metrics");
  const [shown, setShown] = useState<Record<Measure, boolean>>({
    estimatedTraffic: true,
    trafficValue: false,
    keywords: true,
    pages: false,
    referringDomains: false,
    backlinks: false,
    domainRank: false,
    aiNamed: false,
    crawledPages: false,
  });
  const [compared, setCompared] = useState<Measure>("estimatedTraffic");

  const own = useSeries(range.from, range.to, range.step, false);
  const everyone = useSeries(range.from, range.to, range.step, true, tab !== "competitors");
  const twoYears = useSeries(shiftDay(range.to, -729), range.to, "month", false, tab !== "years");

  const exportBase = `${site?.host ?? "site"}-${range.from}-to-${range.to}`;

  if (own === undefined) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {[0, 1, 2].map((index) => <div key={index} className="h-64 animate-pulse rounded-2xl bg-sidebar/30" />)}
        </div>
        <div className="h-72 animate-pulse rounded-2xl bg-sidebar/30" />
      </div>
    );
  }

  const line = own[0];
  const points = line?.points ?? [];
  const latest = newestOfEach(points);
  const before = line?.before ?? null;

  const metricRows = points.map((point) => ({
    label: formatShortDay(point.day),
    ...Object.fromEntries(MEASURES.map((measure) => [measure, valueOf(point, measure)])),
  }));
  // DataForSEO's bands over everything the site ranks for, where read out.
  const bandRows = points.flatMap((point) => {
    const bands = point.allBands ?? point.bands;
    return bands ? [{ label: formatShortDay(point.day), ...bands }] : [];
  });
  const chosen = MEASURES.filter((measure) => shown[measure]);

  const tabs = (
    <div className="flex flex-wrap items-center gap-3">
      <div role="tablist" aria-label={t("chartView")} className="inline-flex overflow-hidden rounded-lg border border-border-dim">
        {(["metrics", "competitors", "years"] as const).map((entry) => (
          <Button
            key={entry}
            variant="ghost"
            role="tab"
            aria-selected={tab === entry}
            onClick={() => setTab(entry)}
            className={`rounded-none px-3 py-1.5 text-[12px] ${tab === entry ? "bg-brand/15 text-brand hover:bg-brand/15" : "text-secondary hover:text-foreground"}`}
          >
            {t(`tabs.${entry}`)}
          </Button>
        ))}
      </div>
      {tab !== "metrics" ? (
        <Select aria-label={t("measure")} value={compared} onChange={(value) => setCompared(value as Measure)}>
          {MEASURES.map((measure) => <option key={measure} value={measure}>{tm(measure)}</option>)}
        </Select>
      ) : null}
    </div>
  );

  let chart: ReactNode;
  let csv: () => string;
  let enough: boolean;
  if (tab === "metrics") {
    chart = (
      <SiteLineChart
        data={metricRows}
        series={chosen.map((measure) => ({
          key: measure,
          name: tm(measure),
          colour: SITE_SERIES_COLOURS[MEASURES.indexOf(measure) % SITE_SERIES_COLOURS.length],
        }))}
      />
    );
    csv = () => toCsv(["day", ...chosen.map((measure) => tm(measure))], points.map((point) => [point.day, ...chosen.map((measure) => valueOf(point, measure))]));
    enough = points.length > 0 && chosen.length > 0;
  } else if (tab === "competitors") {
    const lines = everyone ?? [];
    const days = [...new Set(lines.flatMap((entry) => entry.points.map((point) => point.day)))].sort();
    const rows = days.map((day) => ({
      label: formatShortDay(day),
      ...Object.fromEntries(lines.map((entry) => [entry.host, valueOf(entry.points.find((point) => point.day === day), compared)])),
    }));
    chart = (
      <SiteLineChart
        data={rows}
        sharedScale
        series={lines.map((entry, index) => ({
          key: entry.host,
          name: entry.isYou ? t("thisSite", { host: entry.host }) : entry.host,
          colour: SITE_SERIES_COLOURS[index % SITE_SERIES_COLOURS.length],
          dashed: !entry.isYou,
        }))}
      />
    );
    csv = () => toCsv(["day", ...lines.map((entry) => entry.host)], days.map((day) => [day, ...lines.map((entry) => valueOf(entry.points.find((point) => point.day === day), compared))]));
    enough = everyone !== undefined && days.length > 0;
  } else {
    const monthly = twoYears?.[0]?.points ?? [];
    const byMonth = new Map(monthly.map((point) => [point.day.slice(0, 7), point]));
    // The twelve months to the end of the range, each beside the same
    // calendar month a year before — matched by month, never by position,
    // so a month with no data cannot shift the rest out of line.
    const lastMonth = range.to.slice(0, 7);
    const rows = Array.from({ length: 12 }, (_, index) => {
      const month = shiftMonth(lastMonth, index - 11);
      return {
        label: formatShortDay(`${month}-01`).split(" ")[1],
        thisYear: valueOf(byMonth.get(month), compared),
        lastYear: valueOf(byMonth.get(shiftMonth(month, -12)), compared),
      };
    });
    const lastYear = rows.filter((row) => row.lastYear !== null);
    chart = (
      <SiteLineChart
        data={rows}
        sharedScale
        series={[
          { key: "thisYear", name: t("thisYear"), colour: SITE_SERIES_COLOURS[0] },
          { key: "lastYear", name: t("lastYear"), colour: SITE_SERIES_COLOURS[1], dashed: true },
        ]}
      />
    );
    csv = () => toCsv(["month", t("thisYear"), t("lastYear")], rows.map((row) => [row.label, row.thisYear, row.lastYear]));
    enough = twoYears !== undefined && lastYear.length > 0;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<LayoutDashboard className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />

      <OverviewPanels latest={latest} before={before} extras={extras} />

      <div id="performance">
        <SiteChartCard
          title={t("performance")}
          hint={tab === "metrics" ? t("performanceHint") : tab === "competitors" ? t("competitorsHint") : t("yearsHint")}
          exportName={`${exportBase}-performance-${tab}`}
          csv={csv}
          enoughData={enough}
          controls={
            <>
              {tabs}
              {tab === "metrics" ? (
                <div className="flex flex-wrap gap-4">
                  {MEASURES.map((measure) => (
                    <Checkbox
                      key={measure}
                      label={tm(measure)}
                      checked={shown[measure]}
                      onChange={(next) => setShown((current) => ({ ...current, [measure]: next }))}
                    />
                  ))}
                </div>
              ) : null}
            </>
          }
        >
          {chart}
        </SiteChartCard>
      </div>

      <SiteChartCard
        title={t("positions")}
        hint={t("positionsHint")}
        exportName={`${exportBase}-positions`}
        csv={() => toCsv(["day", ...BANDS.map((band) => t(`bands.${band}`))], points.flatMap((point) => {
          const bands = point.allBands ?? point.bands;
          return bands ? [[point.day, ...BANDS.map((band) => bands[band])]] : [];
        }))}
        enoughData={bandRows.length > 0}
      >
        <SiteStackedAreaChart
          data={bandRows}
          series={BANDS.map((band, index) => ({ key: band, name: t(`bands.${band}`), colour: SITE_SERIES_COLOURS[index] }))}
        />
      </SiteChartCard>

      <OverviewSections latest={latest} extras={extras} />
    </div>
  );
}
