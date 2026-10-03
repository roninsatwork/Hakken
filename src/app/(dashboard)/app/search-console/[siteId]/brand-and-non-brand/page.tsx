"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { CUT_COLUMN, RecordLinkCell } from "../../../sites/_components/SiteCells";
import { SITE_SERIES_COLOURS, SiteLineChart } from "../../../sites/_components/SiteCharts";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { datedRow } from "../../../sites/_components/datedRows";
import { formatNumber, formatShortDay, toCsv } from "../../../sites/_components/siteFormat";
import { SearchConsoleChartCard } from "../../_components/SearchConsoleChartCard";
import { DaysBeforeChange } from "../../_components/SearchConsoleFigures";
import { SearchConsoleListScreen } from "../../_components/SearchConsoleListTable";
import { CountryNotReady } from "../../_components/SearchConsoleNotices";
import { formatPosition, formatRate } from "../../_components/searchConsoleFormat";
import { useRecordHref } from "../../_components/searchConsoleRecords";
import { figureColumns, useSearchConsoleList, type ChipId, type ListSummary } from "../../_components/SearchConsoleTables";
import { countryArg, useSearchConsoleCountry } from "../../_components/useSearchConsole";

const CHIPS: readonly ChipId[] = ["brand", "band", "device"];

type Split = NonNullable<ListSummary["brand"]>["now"];

const shareOf = (split: Split) => (split.brandClicks + split.nonBrandClicks > 0 ? split.brandClicks / (split.brandClicks + split.nonBrandClicks) : 0);

/**
 * Brand and non-brand (search-console-plan.md §13.3, drawn as "14 · Brand
 * and non-brand"): clicks from searches using the website's brand words —
 * the brand names and misspellings in its Profile — against every other
 * search, week by week, and each keyword marked one or the other. In the
 * country chosen (search-console-plan.md §16): the weeks are added up
 * collection by collection, so a country the website does not keep ready has
 * no chart, and its list is asked of Google.
 */
export default function SearchConsoleBrandPage() {
  const t = useTranslations("searchConsole");
  const list = useSearchConsoleList({ dimension: "query", chips: CHIPS });
  const recordHref = useRecordHref(list.siteId);
  const held = Boolean(list.status?.connection?.newestDay);
  const words = useQuery(api.searchConsoleChanges.searchConsoleBrandWords, { siteId: list.siteId });
  const [country] = useSearchConsoleCountry();
  const figures = useQuery(api.searchConsolePeriods.searchConsoleWeekFigures, held ? { siteId: list.siteId, searchType: list.kind, ...countryArg(country) } : "skip");
  const weeks = figures?.weeks;
  const split = list.summary?.brand ?? null;
  const days = list.range.days;
  const host = list.status?.host ?? "";
  const points = (weeks ?? []).map((week) => ({ ...datedRow({ day: week.week }, {}, formatShortDay(week.week)), brand: week.brandClicks, other: week.otherClicks }));
  const description = (
    <>
      {t("brand.description")}{" "}
      {words && words.names.length > 0 ? (
        <>
          {t("brand.yourWords")} <span className="text-foreground">{words.names.join(", ")}</span>.
        </>
      ) : (
        t("brand.noWords")
      )}{" "}
      {words?.profileHref ? <Link href={words.profileHref} className="text-info hover:underline">{t("brand.change")}</Link> : null}
    </>
  );
  return (
    <SearchConsoleListScreen
      icon={<BadgeCheck className="h-5 w-5 text-brand" />}
      title={t("brand.title")}
      description={description}
      heroes={
        <FigureRow>
          <Figure label={t("brand.brandClicks")} value={split ? formatNumber(split.now.brandClicks) : "…"} detail={split ? <Growth now={split.now.brandClicks} before={split.before?.brandClicks ?? null} days={days} /> : null} />
          <Figure label={t("brand.otherClicks")} value={split ? formatNumber(split.now.nonBrandClicks) : "…"} detail={split ? <Growth now={split.now.nonBrandClicks} before={split.before?.nonBrandClicks ?? null} days={days} /> : null} />
          <Figure
            label={t("brand.share")}
            value={split ? formatRate(shareOf(split.now)) : "…"}
            detail={split ? <PointsChange now={shareOf(split.now)} before={split.before ? shareOf(split.before) : null} days={days} /> : null}
          />
          <Figure
            label={t("brand.otherImpressions")}
            value={split ? formatNumber(split.now.nonBrandImpressions) : "…"}
            detail={split ? <Growth now={split.now.nonBrandImpressions} before={split.before?.nonBrandImpressions ?? null} days={days} /> : null}
          />
        </FigureRow>
      }
      table={{
        list,
        chips: CHIPS,
        noun: "keywords",
        searchPlaceholder: t("keywords.searchPlaceholder"),
        rowHref: (row) => recordHref("keywords/keyword", row.key),
        emptyIcon: <BadgeCheck className="h-8 w-8 text-muted/30" />,
        download: [
          { header: t("table.keyword"), field: "key" },
          { header: t("table.brand"), field: "brand" },
          { header: t("table.clicks"), field: "clicks" },
          { header: t("table.impressions"), field: "impressions" },
          { header: `${t("table.ctr")} (%)`, field: "ctr" },
          { header: t("table.position"), field: "position" },
        ],
        columns: [
          {
            key: "key",
            header: t("table.keyword"),
            sortable: true,
            className: CUT_COLUMN.first,
            cell: (row) => <RecordLinkCell cut href={recordHref("keywords/keyword", row.key)}>{row.key}</RecordLinkCell>,
          },
          { key: "brand", header: t("table.brand"), sortable: true, cell: (row) => <span className="text-[12px] text-secondary">{t(row.brand ? "filters.brandYes" : "filters.brandNo")}</span> },
          ...figureColumns(t, ["clicks", "impressions", "ctr", "position"]),
        ],
      }}
    >
      {country && figures?.notReady ? <CountryNotReady country={country} /> : (
        <SearchConsoleChartCard
          title={t("brand.chartTitle")}
          hint={t("brand.chartHint")}
          exportName={`${host}-search-console-brand-weeks`}
          host={host}
          from={weeks?.[0]?.week ?? null}
          to={list.status?.connection?.newestDay ?? null}
          csv={() => toCsv([t("chart.week"), t("filters.brandYes"), t("filters.brandNo")], (weeks ?? []).map((week) => [week.week, week.brandClicks, week.otherClicks]))}
        >
          {weeks === undefined ? (
            <div className="h-[280px] animate-pulse rounded-xl bg-sidebar/30" aria-busy="true" />
          ) : figures?.preparing ? (
            <p className="py-10 text-center text-[13px] text-secondary">{t("chart.preparing")}</p>
          ) : points.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-secondary">{t("chart.nothing")}</p>
          ) : (
            <SiteLineChart
              height={280}
              data={points}
              series={[
                { key: "brand", name: t("filters.brandYes"), colour: SITE_SERIES_COLOURS[3] },
                { key: "other", name: t("filters.brandNo"), colour: SITE_SERIES_COLOURS[0] },
              ]}
              sharedScale
            />
          )}
        </SearchConsoleChartCard>
      )}
    </SearchConsoleListScreen>
  );
}

/** A share against the same days before, in percentage points: up 0.6 points on the 30 days before. */
function PointsChange({ now, before, days }: { now: number; before: number | null; days: number }) {
  const t = useTranslations("searchConsole");
  return (
    <DaysBeforeChange
      by={before === null ? null : (now - before) * 100}
      days={days}
      still={0.05}
      write={(change) => t("figures.points", { change: formatPosition(change) })}
    />
  );
}

/** A figure against the same days before, as a whole per cent: up 6% on the 30 days before. */
function Growth({ now, before, days }: { now: number; before: number | null; days: number }) {
  return (
    <DaysBeforeChange
      by={before === null ? null : now - before}
      days={days}
      write={(change) => (before !== null && before > 0 ? formatRate(change / before) : formatNumber(change))}
    />
  );
}
