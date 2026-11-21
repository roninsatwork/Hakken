"use client";

import { useQuery } from "convex/react";
import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { CUT_COLUMN } from "../../../sites/_components/SiteCells";
import { Change } from "@/src/ui/components/screens/Change";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { ListDownload } from "../../../sites/_components/SiteDownloads";
import { formatMonth, formatNumber } from "../../../sites/_components/siteFormat";
import { useSitePager } from "../../../sites/_components/useSitePagedTable";
import { useSiteSearch } from "../../../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../sites/_components/useSiteSort";
import { useSiteFiguresFor } from "../../_components/SearchConsoleFigures";
import { ResultKindSwitch, SearchConsoleGate } from "../../_components/SearchConsoleNotices";
import { filePercent, filePosition, formatPosition, appearanceName } from "../../_components/searchConsoleFormat";
import { useLiveAsk } from "../../_components/searchConsoleRecords";
import { useSearchConsoleSummaryRead, type ListRow } from "../../_components/SearchConsoleTables";
import { LookBoxes, LookMonthsCard } from "../../_components/LookParts";
import { usePerformanceDates } from "../../_components/PerformanceParts";
import { CountryNotReady } from "../../_components/SearchConsoleNotices";
import {
  countryArg,
  isReadyMade,
  useResultKind,
  useSearchConsoleCountry,
  useSearchConsoleRange,
  useSearchConsoleSiteId,
  useSearchConsoleStatus,
} from "../../_components/useSearchConsole";
import { SearchConsoleSees } from "../../_components/SearchConsoleSees";
import { appearanceSees } from "@/convex/utils/sees/searchConsoleScreens";
import { appearanceEyeData, appearanceRowsOf, type AppearanceRow } from "@/convex/utils/sees/eyeData/searchConsoleChanges";
import { wordsReader } from "@/convex/utils/sees/eyeData/searchConsoleWords";

/**
 * A kind of rich result; `counted` false when its pages are not counted (past the kinds counted), as against still coming
 * (`pages` null). `change` its clicks up or down since the period before, where that's kept.
 */
/** A kind of rich result as the table lists it (`appearanceRowsOf`). */
type Kind = AppearanceRow;
const SORTS: SiteSortColumns<Kind, "key" | "clicks" | "change" | "impressions" | "position" | "pages"> = {
  key: { value: (row) => row.name, first: "asc" },
  clicks: { value: (row) => row.clicks, first: "desc" },
  change: { value: (row) => row.change, first: "desc" },
  impressions: { value: (row) => row.impressions, first: "desc" },
  position: { value: (row) => row.position, first: "asc" },
  pages: { value: (row) => row.pages, first: "desc" },
};
const nameOf = (row: Kind) => row.name;

/**
 * Rich results (search-console-plan.md §13.3, drawn as "16 · Rich results"):
 * the special kinds of result Google showed the website's pages in — review
 * stars, videos, translated results and the rest — and the clicks each
 * brought, with how many pages it showed in each — in the country chosen,
 * asked of Google when the website does not keep it ready
 * (search-console-plan.md §16). The pages for each kind are counted after
 * each collection for the ready-made periods (drift fixes, 2026-10-03), so
 * only other dates, one device or a country not kept ready ask Google.
 *
 * Redone as Way 3 on 20 November 2026 (search-console-breakdowns-plan-2026-11-20.md): three boxes against the period
 * before (now kept for rich results too), every click of the last six months by kind, and the lean table with Up or down.
 * The Device menu went with it, as Countries and devices splits by device.
 */
export default function SearchConsoleAppearancePage() {
  const t = useTranslations("searchConsole");
  const siteId = useSearchConsoleSiteId();
  const status = useSearchConsoleStatus();
  const [kind] = useResultKind();
  const range = useSearchConsoleRange(status?.connection?.newestDay);
  const [search, setSearch, term] = useSiteSearch();
  const held = Boolean(status?.connection?.newestDay);
  const [country] = useSearchConsoleCountry();
  const dates = { siteId, searchType: kind, from: range.from, to: range.to };
  // Other dates are asked of Google; so is a country the website does not keep ready, the server says.
  const asksGoogle = !isReadyMade(range, status?.connection?.newestDay);
  const split = useQuery(
    api.searchConsoleLists.searchConsoleSplitList,
    held && !asksGoogle ? { ...dates, dimension: "appearance", ...countryArg(country) } : "skip",
  );
  const fromLive = asksGoogle || split?.live === true;
  const liveSplit = useLiveAsk(
    api.searchConsoleLists.searchConsoleLiveList,
    held && fromLive ? { ...dates, dimension: "appearance" as const, ...countryArg(country) } : null,
  );
  const appearances: ListRow[] | undefined = fromLive ? (liveSplit.answer === undefined ? undefined : liveSplit.answer.ok ? liveSplit.answer.rows.flat() : []) : split?.rows;
  const performance = useSiteFiguresFor(held ? dates : null).figures;
  // Counted after each collection: a ready-made list carries each kind's pages, a negative count for a kind past those counted.
  const countedReady = !fromLive && appearances !== undefined && appearances.every((row) => row.count !== null);
  const kinds = appearances?.map((row) => row.key) ?? [];
  const pages = useLiveAsk(api.searchConsoleLists.searchConsoleAppearancePages, held && !countedReady && kinds.length > 0 ? { ...dates, kinds, ...countryArg(country) } : null);
  const pagesOf = new Map(pages.answer?.ok ? pages.answer.pages.map((entry) => [entry.kind, entry.pages]) : []);
  const known = (key: string) => (t.has(`appearance.names.${key}`) ? t(`appearance.names.${key}`) : null);
  // Each kind as the table lists it, as a chat app's question lists it too (`appearanceRowsOf`).
  const rows: Kind[] | undefined = appearanceRowsOf(appearances, countedReady, pages.answer === undefined ? undefined : pagesOf, wordsReader(t));
  const matches = wordStartMatcher(term.toLowerCase());
  const matching = rows?.filter((row) => !matches || matches(row.name));
  const { rows: sorted, tableSort } = useSiteSortedList(matching, SORTS, { opening: "clicks", name: nameOf });
  const pager = useSitePager(sorted, { isLoading: rows === undefined });
  const when = usePerformanceDates();
  // Every page Google showed in the country chosen, as Pages counts them: the third box's "out of".
  const pagesShown = useSearchConsoleSummaryRead({ dimension: "page", inCountry: true }).summary?.rows ?? null;
  // The last six months, kept as the periods are built; a country not kept ready has none, as Brand and non-brand's chart.
  const months = useQuery(api.searchConsoleBreakdowns.searchConsoleLookMonths, held ? { siteId, searchType: kind, ...countryArg(country) } : "skip");
  const newestMonth = status?.connection?.newestDay?.slice(0, 7) ?? null;
  const all = performance?.totals ? { now: performance.totals.clicks, before: performance.previous?.clicks ?? null } : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Star className="h-5 w-5 text-brand" />} title={t("appearance.title")} description={t("appearance.description")} />
      {status ? (
        <SearchConsoleGate status={status} siteId={siteId}>
          <SearchConsoleSees
            screen="appearance"
            seen={rows ? appearanceSees(rows.length, [...rows].sort((left, right) => right.clicks - left.clicks)[0] ? { name: [...rows].sort((left, right) => right.clicks - left.clicks)[0].name } : null) : null}
            data={appearanceEyeData({ rows, performance, months, pagesShown }, wordsReader(t), { month: formatMonth })}
          />
          <ResultKindSwitch />
          <LookBoxes looks={rows} all={all} against={when.inBefore} pagesShown={pagesShown} />
          {months?.notReady && country ? <CountryNotReady country={country} /> : (
            <LookMonthsCard
              months={months?.months}
              newestMonth={newestMonth}
              nameOf={(key) => appearanceName(key, known)}
              host={status.host}
              exportName={`${status.host}-search-console-rich-results-months`}
            />
          )}
          <DataTable
            rows={pager.pageRows}
            rowKey={(row) => row.key}
            search={{ value: search, onChange: setSearch, placeholder: t("appearance.searchPlaceholder") }}
            cardHeader={
              <TableBar
                footer={pager.footer}
                noun="kinds"
                actions={
                  <ListDownload
                    label={t("table.download")}
                    fileName={`${status.host}-search-console-rich-results-${range.from}-${range.to}`}
                    rows={sorted}
                    columns={[
                      { header: t("table.richResult"), value: (row) => row.name },
                      { header: t("table.clicks"), value: (row) => row.clicks },
                      { header: t("table.change"), value: (row) => row.change },
                      { header: t("table.impressions"), value: (row) => row.impressions },
                      { header: `${t("table.ctr")} (%)`, value: (row) => filePercent(row.ctr) },
                      { header: t("table.position"), value: (row) => filePosition(row.position) },
                      { header: t("table.pages"), value: (row) => (row.counted ? row.pages : null) },
                    ]}
                  />
                }
              />
            }
            sort={tableSort}
            empty={{ icon: <Star className="h-8 w-8 text-muted/30" />, label: term ? t("table.noMatch") : t("appearance.empty") }}
            footer={pager.footer}
            columns={[
              // The lean table, as drawn (20 November 2026): Up or down took CTR's place.
              { key: "key", header: t("table.richResult"), sortable: true, className: `${CUT_COLUMN.first} min-w-[160px]`, cell: (row) => <span className="block truncate text-[13px] text-foreground" title={row.name}>{row.name}</span> },
              { key: "clicks", header: t("table.clicks"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.clicks)}</span> },
              { key: "change", header: t("table.change"), align: "right", sortable: true, className: "whitespace-nowrap", cell: (row) => <Change by={row.change} format={formatNumber} /> },
              { key: "impressions", header: <span title={t("table.shownTitle")}>{t("table.shown")}</span>, align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.impressions)}</span> },
              { key: "position", header: t("table.position"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatPosition(row.position)}</span> },
              { key: "pages", header: t("table.pages"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{!row.counted ? "–" : row.pages === null ? "…" : formatNumber(row.pages)}</span> },
            ]}
          />
        </SearchConsoleGate>
      ) : null}
    </div>
  );
}
