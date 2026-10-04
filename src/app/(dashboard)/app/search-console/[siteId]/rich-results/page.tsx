"use client";

import { useQuery } from "convex/react";
import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { CUT_COLUMN } from "../../../sites/_components/SiteCells";
import { Figure } from "@/src/ui/components/screens/Figure";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { ListDownload } from "../../../sites/_components/SiteDownloads";
import { formatNumber } from "../../../sites/_components/siteFormat";
import { useSitePager } from "../../../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../sites/_components/useSiteSort";
import { useSiteFiguresFor } from "../../_components/SearchConsoleFigures";
import { ResultKindSwitch, SearchConsoleGate } from "../../_components/SearchConsoleNotices";
import { filePercent, filePosition, formatPosition, formatRate } from "../../_components/searchConsoleFormat";
import { useLiveAsk } from "../../_components/searchConsoleRecords";
import { SearchConsoleChips, type ChipId, type ListRow } from "../../_components/SearchConsoleTables";
import {
  countryArg,
  isReadyMade,
  useResultKind,
  useSearchConsoleCountry,
  useSearchConsoleRange,
  useSearchConsoleSiteId,
  useSearchConsoleStatus,
} from "../../_components/useSearchConsole";

const CHIPS: readonly ChipId[] = ["device"];

/** A kind of rich result; `counted` false when its pages are not counted (past the kinds counted), as against still coming (`pages` null). */
type Kind = { key: string; clicks: number; impressions: number; ctr: number; position: number; pages: number | null; counted: boolean };
const SORTS: SiteSortColumns<Kind, "key" | "clicks" | "impressions" | "ctr" | "position" | "pages"> = {
  key: { value: (row) => row.key, first: "asc" },
  clicks: { value: (row) => row.clicks, first: "desc" },
  impressions: { value: (row) => row.impressions, first: "desc" },
  ctr: { value: (row) => row.ctr, first: "desc" },
  position: { value: (row) => row.position, first: "asc" },
  pages: { value: (row) => row.pages, first: "desc" },
};
const nameOf = (row: Kind) => row.key;

/** Google's name for a kind of rich result, in words: "REVIEW_SNIPPET" reads "Review snippet". */
function kindName(key: string, known: (key: string) => string | null): string {
  return known(key) ?? key.toLowerCase().replace(/_/g, " ").replace(/^./, (first) => first.toUpperCase());
}

/**
 * Rich results (search-console-plan.md §13.3, drawn as "16 · Rich results"):
 * the special kinds of result Google showed the website's pages in — review
 * stars, videos, translated results and the rest — and the clicks each
 * brought, with how many pages it showed in each — in the country chosen,
 * asked of Google when the website does not keep it ready
 * (search-console-plan.md §16). The pages for each kind are counted after
 * each collection for the ready-made periods (drift fixes, 2026-10-03), so
 * only other dates, one device or a country not kept ready ask Google.
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
  const [device] = useSiteParam<string>("device", "", ["", "DESKTOP", "MOBILE", "TABLET"]);
  const dates = { siteId, searchType: kind, from: range.from, to: range.to };
  // Other dates or one device are asked of Google; so is a country the website does not keep ready, the server says.
  const asksGoogle = Boolean(device) || !isReadyMade(range, status?.connection?.newestDay);
  const split = useQuery(
    api.searchConsoleLists.searchConsoleSplitList,
    held && !asksGoogle ? { ...dates, dimension: "appearance", ...countryArg(country) } : "skip",
  );
  const fromLive = asksGoogle || split?.live === true;
  const liveSplit = useLiveAsk(
    api.searchConsoleLists.searchConsoleLiveList,
    held && fromLive ? { ...dates, dimension: "appearance" as const, ...countryArg(country), ...(device ? { device } : {}) } : null,
  );
  const appearances: ListRow[] | undefined = fromLive ? (liveSplit.answer === undefined ? undefined : liveSplit.answer.ok ? liveSplit.answer.rows.flat() : []) : split?.rows;
  const performance = useSiteFiguresFor(held ? dates : null).figures;
  // Counted after each collection: a ready-made list carries each kind's pages, a negative count for a kind past those counted.
  const countedReady = !fromLive && appearances !== undefined && appearances.every((row) => row.count !== null);
  const kinds = appearances?.map((row) => row.key) ?? [];
  const pages = useLiveAsk(api.searchConsoleLists.searchConsoleAppearancePages, held && !countedReady && kinds.length > 0 ? { ...dates, kinds, ...countryArg(country) } : null);
  const pagesOf = new Map(pages.answer?.ok ? pages.answer.pages.map((entry) => [entry.kind, entry.pages]) : []);
  const known = (key: string) => (t.has(`appearance.names.${key}`) ? t(`appearance.names.${key}`) : null);
  const rows: Kind[] | undefined = appearances?.map((row) => {
    const counted = countedReady ? (row.count ?? 0) >= 0 : pages.answer === undefined || pagesOf.has(row.key);
    return {
      key: kindName(row.key, known),
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
      pages: !counted ? null : countedReady ? row.count : (pagesOf.get(row.key) ?? null),
      counted,
    };
  });
  const matches = wordStartMatcher(term.toLowerCase());
  const matching = rows?.filter((row) => !matches || matches(row.key));
  const { rows: sorted, tableSort } = useSiteSortedList(matching, SORTS, { opening: "clicks", name: nameOf });
  const pager = useSitePager(sorted, { isLoading: rows === undefined });
  const clicks = (rows ?? []).reduce((sum, row) => sum + row.clicks, 0);
  const impressions = (rows ?? []).reduce((sum, row) => sum + row.impressions, 0);
  const all = performance?.totals?.clicks ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Star className="h-5 w-5 text-brand" />} title={t("appearance.title")} description={t("appearance.description")} />
      {status ? (
        <SearchConsoleGate status={status} siteId={siteId}>
          <ResultKindSwitch />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Figure label={t("appearance.kinds")} value={rows ? formatNumber(rows.length) : "…"} detail={<span className="text-secondary">{t("common.inLast", { days: range.days })}</span>} />
            <Figure label={t("appearance.clicks")} value={rows ? formatNumber(clicks) : "…"} detail={<span className="text-secondary">{t("appearance.ofAll", { share: all > 0 ? formatRate(clicks / all) : "–" })}</span>} />
            <Figure label={t("appearance.impressions")} value={rows ? formatNumber(impressions) : "…"} detail={<span className="text-secondary">{t("common.inLast", { days: range.days })}</span>} />
          </div>
          <DataTable
            rows={pager.pageRows}
            rowKey={(row) => row.key}
            minWidthClassName="min-w-[640px]"
            search={{ value: search, onChange: setSearch, placeholder: t("appearance.searchPlaceholder") }}
            filters={<SearchConsoleChips chips={CHIPS} />}
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
                      { header: t("table.richResult"), value: (row) => row.key },
                      { header: t("table.clicks"), value: (row) => row.clicks },
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
              { key: "key", header: t("table.richResult"), sortable: true, className: CUT_COLUMN.first, cell: (row) => <span className="block truncate text-[13px] text-foreground">{row.key}</span> },
              { key: "clicks", header: t("table.clicks"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.clicks)}</span> },
              { key: "impressions", header: t("table.impressions"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.impressions)}</span> },
              { key: "ctr", header: t("table.ctr"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatRate(row.ctr)}</span> },
              { key: "position", header: t("table.position"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatPosition(row.position)}</span> },
              { key: "pages", header: t("table.pages"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{!row.counted ? "–" : row.pages === null ? "…" : formatNumber(row.pages)}</span> },
            ]}
          />
        </SearchConsoleGate>
      ) : null}
    </div>
  );
}
