"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";

import { BrandBoxes, BrandDaysCard } from "../../_components/BrandParts";
import { usePerformanceDates } from "../../_components/PerformanceParts";
import { useSiteFiguresFor } from "../../_components/SearchConsoleFigures";
import { SearchConsoleListScreen } from "../../_components/SearchConsoleListTable";
import { CountryNotReady } from "../../_components/SearchConsoleNotices";
import { useRecordHref } from "../../_components/searchConsoleRecords";
import { figureColumns, useSearchConsoleList, type ChipId, keywordColumn } from "../../_components/SearchConsoleTables";
import { useChartPeriods } from "../../_components/useChartPeriods";
import { periodArg } from "../../_components/useSearchConsole";
import { SearchConsoleSees } from "../../_components/SearchConsoleSees";
import { brandSees } from "@/convex/utils/sees/searchConsoleScreens";
import { moverWorthNaming } from "@/convex/utils/sees/own/searchConsole";

const CHIPS: readonly ChipId[] = ["brand", "band", "device"];

/**
 * Brand and non-brand (search-console-plan.md §13.3, drawn as "14 · Brand
 * and non-brand"): clicks from searches using the website's brand words —
 * the brand names and misspellings in its Profile — against every other
 * search, in the dates and step chosen, and each keyword marked one or the
 * other. In the country chosen (search-console-plan.md §16): the days, weeks
 * and months are added up collection by collection, so a country the website
 * does not keep ready has no chart, and its list is asked of Google.
 *
 * Redone as Way 1 on 20 November 2026 (search-console-breakdowns-plan-2026-11-20.md): four boxes against the period
 * before, every click counted (the hidden ones too, from Performance's own read), the shared day chart and the lean table.
 */
export default function SearchConsoleBrandPage() {
  const t = useTranslations("searchConsole");
  const list = useSearchConsoleList({ dimension: "query", chips: CHIPS });
  const recordHref = useRecordHref(list.siteId);
  const words = useQuery(api.searchConsoleChanges.searchConsoleBrandWords, { siteId: list.siteId });
  const chart = useChartPeriods(list);
  const { figures, periods, country } = chart;
  const split = list.summary?.brand ?? null;
  const host = list.status?.host ?? "";
  const dates = usePerformanceDates();
  // Every click, hidden searches too: the boxes' third and fourth, and the chart's Out of every 100. Performance's own read.
  const held = Boolean(list.status?.connection?.newestDay) && !list.range.waiting && list.range.days > 0;
  const every = useSiteFiguresFor(held ? { siteId: list.siteId, searchType: list.kind, from: list.range.from, to: list.range.to, ...periodArg(list.range) } : null).figures;
  // The eye's figures: the list's, its brand words, the chart's periods and the page's own names for the two kinds of
  // search; its "Do first" steps may open the searches that gained and lost most, each on its own screen.
  const brandName = t("performance.squares.groups.brand");
  const otherName = t("performance.squares.groups.named");
  const brandWords = words?.names ?? null;
  // The chart's periods by their first day (`day`), so the eye keeps the newest of a long chart, never its oldest.
  const hiddenName = t("performance.squares.groups.hidden");
  const totals = every?.totals ?? null;
  const previous = every?.previous ?? null;
  // Only once every click is in, so the eye never writes the share of named clicks alone while the totals are on their way.
  const everyIn = every !== undefined;
  const seesData = useMemo(() => (list.pageData && everyIn ? {
    ...list.pageData,
    brandWords,
    chart: periods ? periods.map((period) => ({ ...period, day: period.start })) : null,
    // Every click, the hidden ones too, as the boxes count them: the eye's share and hidden clicks are the boxes'.
    every: totals ? { clicks: totals.clicks, before: previous?.clicks ?? null } : null,
    names: { brand: brandName, other: otherName, hidden: hiddenName },
  } : undefined), [list.pageData, everyIn, brandWords, periods, totals, previous, brandName, otherName, hiddenName]);
  const movers = list.summary?.wholeList?.movers;
  // Only the searches the eye may name: the same bar as its findings (`moverWorthNaming`).
  const seesLinks = useMemo(() => [movers?.otherDown, movers?.otherUp, movers?.brandDown]
    .flatMap((moved) => (moved && moverWorthNaming(moved) ? [{ label: moved.key, href: recordHref("keywords/keyword", moved.key) }] : [])), [movers, recordHref]);
  const description = (
    <>
      {t("brand.description")}{" "}
      {words && words.names.length > 0 ? (
        <>
          {t("brand.yourWords")} <BrandWords names={words.names} />.
        </>
      ) : (
        t("brand.noWords")
      )}{" "}
      {words?.profileHref ? <Link href={words.profileHref} className="text-info hover:underline">{t("brand.change")}</Link> : null}
    </>
  );
  return (
    <SearchConsoleListScreen
      sees={<SearchConsoleSees screen="brand" seen={list.summary ? brandSees(list.summary) : null} data={seesData} links={seesLinks} />}
      icon={<BadgeCheck className="h-5 w-5 text-brand" />}
      title={t("brand.title")}
      description={description}
      heroes={<BrandBoxes split={split} figures={every} against={dates.inBefore} />}
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
          { header: t("table.change"), field: "change" },
          { header: t("table.impressions"), field: "impressions" },
          { header: `${t("table.ctr")} (%)`, field: "ctr" },
          { header: t("table.position"), field: "position" },
        ],
        columns: [
          keywordColumn(t("table.keyword"), recordHref),
          // The lean table (AGENTS.md "Tables are lean", 2026-11-17), as drawn on 20 November 2026: the Searches menu says brand
          // or not, so the Brand column left for Up or down. Click-through rate stays: brand searches are clicked more often.
          ...figureColumns(t, ["clicks", "change", "impressions", "ctr", "position"]),
        ],
      }}
    >
      {country && figures?.notReady ? <CountryNotReady country={country} /> : (
        periods === undefined ? (
          <div className="h-[380px] animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />
        ) : figures?.preparing || figures?.notBuilt ? (
          <p className="py-10 text-center text-[13px] text-secondary">{t(figures.preparing ? "chart.preparing" : "chart.notBuilt")}</p>
        ) : (
          <BrandDaysCard
            periods={periods}
            step={chart.step}
            figures={every}
            host={host}
            inNow={dates.inNow}
            note={chart.note}
            exportName={`${host}-search-console-brand-${list.range.from}-to-${list.range.to}`}
          />
        )
      )}
    </SearchConsoleListScreen>
  );
}

/** The website's brand words as a sentence says them: "More Handles and MoreHandles". */
function BrandWords({ names }: { names: readonly string[] }) {
  const t = useTranslations("searchConsole.brand");
  const last = names.at(-1) ?? "";
  const first = names.slice(0, -1);
  return first.length === 0 ? <span className="text-foreground">{last}</span> : (
    <>
      {first.map((name, at) => <span key={name}>{at > 0 ? ", " : null}<span className="text-foreground">{name}</span></span>)}
      {` ${t("and")} `}<span className="text-foreground">{last}</span>
    </>
  );
}
