"use client";

import { useState } from "react";
import Link from "next/link";
import { Shapes } from "lucide-react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { SITE_SERIES_COLOURS } from "../../../sites/_components/SiteCharts";
import { SiteFigure } from "../../../sites/_components/SiteFigure";
import { formatNumber, toCsv } from "../../../sites/_components/siteFormat";
import { SearchConsoleChartCard } from "../../_components/SearchConsoleChartCard";
import { ResultKindSwitch, SearchConsoleGate } from "../../_components/SearchConsoleNotices";
import { formatRate } from "../../_components/searchConsoleFormat";
import { useSearchConsoleSummary, type ListSummary } from "../../_components/SearchConsoleTables";
import { useSearchConsoleHref, useSearchConsoleRange, useSearchConsoleSiteId, useSearchConsoleStatus } from "../../_components/useSearchConsole";

/** The count's colour and the clicks' colour, the same pair on every row (the drawing's blue and orange). */
const COUNT_COLOUR = SITE_SERIES_COLOURS[3];
const CLICKS_COLOUR = SITE_SERIES_COLOURS[0];

/**
 * Types (search-console-plan.md §13.3, drawn as "13 · Types" — its own page,
 * Anthony: "no i think this its own page"): the website's pages by kind and
 * its keywords by what the searcher wants, as Sites judged them — how much
 * of each there is and how many of the clicks each brings. A kind opens its
 * pages or keywords.
 */
export default function SearchConsoleTypesPage() {
  const t = useTranslations("searchConsole");
  const tc = useTranslations("sites.common");
  const siteId = useSearchConsoleSiteId();
  const status = useSearchConsoleStatus();
  const range = useSearchConsoleRange(status?.connection?.newestDay);
  const hrefFor = useSearchConsoleHref(siteId);
  const pages = useSearchConsoleSummary({ dimension: "page" });
  const keywords = useSearchConsoleSummary({ dimension: "query" });
  const host = status?.host ?? "";
  const clicksOf = (summary: ListSummary | null, kind: string) => summary?.kinds.find((entry) => entry.kind === kind)?.clicks ?? 0;
  const hero = (label: string, summary: ListSummary | null, kind: string) => (
    <SiteFigure
      label={label}
      value={summary ? formatNumber(clicksOf(summary, kind)) : "…"}
      detail={<span className="text-secondary">{t("types.ofClicks", { share: formatRate(summary && summary.clicks > 0 ? clicksOf(summary, kind) / summary.clicks : 0) })}</span>}
    />
  );
  const csv = (summary: ListSummary | null, word: (kind: string) => string) => () => toCsv(
    [t("types.kind"), t("types.count"), t("table.clicks")],
    (summary?.kinds ?? []).map((kind) => [word(kind.kind), kind.rows, kind.clicks]),
  );
  const pageWord = (kind: string) => tc(`pageTypes.${kind}`);
  const intentWord = (kind: string) => tc(`intents.${kind}`);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Shapes className="h-5 w-5 text-brand" />} title={t("types.title")} description={t("types.description")} />
      {status ? (
        <SearchConsoleGate status={status} siteId={siteId}>
          <ResultKindSwitch />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {hero(t("types.fromArticles"), pages, "ARTICLE")}
            {hero(t("types.fromServices"), pages, "SERVICE")}
            {hero(t("types.fromBrand"), keywords, "BRANDED")}
            {hero(t("types.fromCommercial"), keywords, "BUYING")}
          </div>
          <SearchConsoleChartCard
            title={t("types.pagesTitle")}
            hint={t("types.pagesHint", { count: formatNumber(pages?.rows ?? 0) })}
            exportName={`${host}-search-console-pages-by-kind`}
            host={host}
            from={range.from}
            to={range.to}
            csv={csv(pages, pageWord)}
          >
            <KindBars summary={pages} of="page" word={pageWord} href={(kind) => hrefFor("pages", { kind })} />
          </SearchConsoleChartCard>
          <SearchConsoleChartCard
            title={t("types.keywordsTitle")}
            hint={t("types.keywordsHint", { count: formatNumber(keywords?.rows ?? 0) })}
            exportName={`${host}-search-console-keywords-by-intent`}
            host={host}
            from={range.from}
            to={range.to}
            csv={csv(keywords, intentWord)}
          >
            <KindBars summary={keywords} of="query" word={intentWord} href={(kind) => hrefFor("keywords", { kind })} />
          </SearchConsoleChartCard>
        </SearchConsoleGate>
      ) : null}
    </div>
  );
}

/**
 * One card of kinds: each kind's share of the pages (or keywords) and of the
 * clicks, as two bars, the most first — each row opening the list it counts.
 */
function KindBars({ summary, of, href, word }: {
  summary: ListSummary | null;
  of: "page" | "query";
  href: (kind: string) => string;
  word: (kind: string) => string;
}) {
  const t = useTranslations("searchConsole");
  const [shown, setShown] = useState({ count: true, clicks: true });
  const kinds = summary?.kinds ?? [];
  const share = (part: number, whole: number) => (whole > 0 ? part / whole : 0);
  const widest = Math.max(0.0001, ...kinds.flatMap((kind) => [share(kind.rows, summary?.rows ?? 0), share(kind.clicks, summary?.clicks ?? 0)]));
  return (
    <>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <Checkbox label={t(of === "page" ? "types.pages" : "types.keywords")} checked={shown.count} onChange={(checked) => setShown((before) => ({ ...before, count: checked || !before.clicks }))} />
        <Checkbox label={t("types.clicks")} checked={shown.clicks} onChange={(checked) => setShown((before) => ({ ...before, clicks: checked || !before.count }))} />
      </div>
      <div className="mt-4 flex flex-col gap-1">
        {summary === null ? (
          <div className="h-40 animate-pulse rounded-xl bg-sidebar/30" aria-busy="true" />
        ) : (
          kinds.map((kind) => {
            const count = share(kind.rows, summary.rows);
            const clicks = share(kind.clicks, summary.clicks);
            return (
              <Link
                key={kind.kind}
                href={href(kind.kind)}
                className="grid grid-cols-[150px_minmax(0,1fr)_minmax(220px,auto)] items-center gap-4 rounded-lg p-2 text-foreground hover:bg-hover"
              >
                <span className="truncate text-[13px]">{word(kind.kind)}</span>
                <span className="flex flex-col gap-1" aria-hidden="true">
                  {shown.count ? <span className="h-3.5 rounded-[3px]" style={{ width: `${(count / widest) * 100}%`, background: COUNT_COLOUR }} /> : null}
                  {shown.clicks ? <span className="h-3.5 rounded-[3px]" style={{ width: `${(clicks / widest) * 100}%`, background: CLICKS_COLOUR }} /> : null}
                </span>
                <span className="text-[12px] tabular-nums text-secondary">
                  {t(of === "page" ? "types.pagesLine" : "types.keywordsLine", { count: kind.rows, rows: formatNumber(kind.rows), share: formatRate(count), clicks: formatRate(clicks) })}
                </span>
              </Link>
            );
          })
        )}
      </div>
    </>
  );
}
