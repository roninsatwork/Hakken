"use client";

import { useState } from "react";
import { Shapes } from "lucide-react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { CHART_SERIES_BLUE, CHART_SERIES_ORANGE } from "@/src/ui/components/charts/chartPalette";
import { KindBars } from "../../../_components/KindBars";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { formatNumber, toCsv } from "../../../sites/_components/siteFormat";
import { SearchConsoleChartCard } from "../../_components/SearchConsoleChartCard";
import { ResultKindSwitch, SearchConsoleGate } from "../../_components/SearchConsoleNotices";
import { formatRate } from "../../_components/searchConsoleFormat";
import { useSearchConsoleSummary, type ListSummary } from "../../_components/SearchConsoleTables";
import { useSearchConsoleHref, useSearchConsoleRange, useSearchConsoleSiteId, useSearchConsoleStatus } from "../../_components/useSearchConsole";

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
    <Figure
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
          <FigureRow>
            {hero(t("types.fromArticles"), pages, "ARTICLE")}
            {hero(t("types.fromServices"), pages, "SERVICE")}
            {hero(t("types.fromBrand"), keywords, "BRANDED")}
            {hero(t("types.fromCommercial"), keywords, "BUYING")}
          </FigureRow>
          <KindCard
            title={t("types.pagesTitle")}
            hint={t("types.pagesHint", { count: formatNumber(pages?.rows ?? 0) })}
            exportName={`${host}-search-console-pages-by-kind`}
            host={host}
            range={range}
            csv={csv(pages, pageWord)}
            summary={pages}
            of="page"
            word={pageWord}
            href={(kind) => hrefFor("pages", { kind })}
          />
          <KindCard
            title={t("types.keywordsTitle")}
            hint={t("types.keywordsHint", { count: formatNumber(keywords?.rows ?? 0) })}
            exportName={`${host}-search-console-keywords-by-intent`}
            host={host}
            range={range}
            csv={csv(keywords, intentWord)}
            summary={keywords}
            of="query"
            word={intentWord}
            href={(kind) => hrefFor("keywords", { kind })}
          />
        </SearchConsoleGate>
      ) : null}
    </div>
  );
}

/**
 * One card of kinds: each kind's share of the pages (or keywords) and of the
 * clicks, as two bars, the most first — each row opening the list it counts.
 * The bars are the shared `KindBars`, in the Sites Overview's blue and orange.
 */
function KindCard({ title, hint, exportName, host, range, csv, summary, of, href, word }: {
  title: string;
  hint: string;
  exportName: string;
  host: string;
  range: { from: string | null; to: string | null };
  csv: () => string;
  summary: ListSummary | null;
  of: "page" | "query";
  href: (kind: string) => string;
  word: (kind: string) => string;
}) {
  const t = useTranslations("searchConsole");
  const [shown, setShown] = useState({ count: true, clicks: true });
  const share = (part: number, whole: number) => (whole > 0 ? part / whole : 0);
  const what = t(of === "page" ? "types.pages" : "types.keywords");
  return (
    <SearchConsoleChartCard
      title={title}
      hint={hint}
      exportName={exportName}
      host={host}
      from={range.from}
      to={range.to}
      csv={csv}
      controls={(
        <>
          <Checkbox label={what} checked={shown.count} onChange={(checked) => setShown((before) => ({ ...before, count: checked || !before.clicks }))} />
          <Checkbox label={t("types.clicks")} checked={shown.clicks} onChange={(checked) => setShown((before) => ({ ...before, clicks: checked || !before.count }))} />
        </>
      )}
    >
      <KindBars
        loading={summary === null}
        colours={[CHART_SERIES_BLUE, CHART_SERIES_ORANGE]}
        shown={[shown.count, shown.clicks]}
        rows={(summary?.kinds ?? []).map((kind) => {
          const count = share(kind.rows, summary?.rows ?? 0);
          const clicks = share(kind.clicks, summary?.clicks ?? 0);
          return {
            key: kind.kind,
            label: word(kind.kind),
            href: href(kind.kind),
            shares: [count, clicks],
            line: t(of === "page" ? "types.pagesLine" : "types.keywordsLine", { count: kind.rows, rows: formatNumber(kind.rows), share: formatRate(count), clicks: formatRate(clicks) }),
            readout: [
              { value: formatNumber(kind.rows), label: t("types.readoutShare", { what, share: formatRate(count) }) },
              { value: formatNumber(kind.clicks), label: t("types.ofClicks", { share: formatRate(clicks) }) },
            ],
          };
        })}
      />
    </SearchConsoleChartCard>
  );
}
