"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAction, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useTranslations } from "next-intl";
import { FileText, Search, SearchX } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { Notice } from "@/src/ui/components/screens/Notice";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { formatNumber } from "../../sites/_components/siteFormat";
import { ListDownload } from "../../sites/_components/SiteDownloads";
import { useSitePager } from "../../sites/_components/useSitePagedTable";
import { useSiteSearch } from "../../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../sites/_components/useSiteSort";
import { CUT_COLUMN } from "../../sites/_components/SiteCells";
import { formatPosition, formatRate } from "../../search-console/_components/searchConsoleFormat";
import { BingGate } from "./BingNotices";
import { BingRecordFigures, BingSees } from "./BingParts";
import { BingRecordChart } from "./BingCharts";
import { pathOf } from "./BingListTable";
import { FEW_IMPRESSIONS, useBingHref, useBingSiteId, useBingStatus, usePeriod } from "./useBing";

/**
 * A keyword's or a page's own screen (bing-webmaster-plan.md §5, boards 4
 * and 5b): the way back to its list; What Hakken sees; its figures beside
 * Google's for the menu's period; its weeks on Bing; and the pages Bing showed
 * for the keyword, or the keywords it showed the page for, asked of Bing when
 * the screen opens and held until the next collection (§4.1).
 */
export function BingRecordScreen({ list }: { list: "query" | "page" }) {
  const t = useTranslations("bingWebmaster.record");
  const status = useBingStatus();
  const siteId = useBingSiteId();
  const hrefFor = useBingHref(siteId);
  const ref = useSearchParams().get("ref") ?? "";
  const [period] = usePeriod();
  const record = useQuery(api.bingWebmasterReads.bingRecord, ref ? { siteId, list, ref, period } : "skip");
  const back = list === "query" ? { label: t("backKeywords"), href: hrefFor("keywords") } : { label: t("backPages"), href: hrefFor("pages") };
  const title = record ? (list === "page" ? record.title ?? pathOf(record.key) : record.key) : "";
  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        back={back}
        icon={list === "query" ? <Search className="h-5 w-5 text-brand" /> : <FileText className="h-5 w-5 text-brand" />}
        title={title}
        description={record === null ? t("notFound") : list === "query" ? t("keywordDescription") : t("pageDescription", { page: record ? pathOf(record.key) : "" })}
      />
      {status && record ? (
        <BingGate status={status} siteId={siteId}>
          <RecordBody list={list} record={record} host={status.host} />
        </BingGate>
      ) : null}
    </div>
  );
}

type RecordAnswer = NonNullable<FunctionReturnType<typeof api.bingWebmasterReads.bingRecord>>;
type LiveRow = { key: string; clicks: number; impressions: number; position: number | null };

const SORTS: SiteSortColumns<LiveRow, "key" | "clicks" | "impressions" | "ctr" | "position"> = {
  key: { value: (row) => row.key, first: "asc" },
  clicks: { value: (row) => row.clicks, first: "desc" },
  impressions: { value: (row) => row.impressions, first: "desc" },
  ctr: { value: (row) => (row.impressions > 0 ? row.clicks / row.impressions : null), first: "desc" },
  position: { value: (row) => row.position, first: "asc" },
};

function RecordBody({ list, record, host }: { list: "query" | "page"; record: RecordAnswer; host: string }) {
  const t = useTranslations("bingWebmaster.record");
  const tt = useTranslations("bingWebmaster.table");
  const tk = useTranslations("bingWebmaster.keywords");
  const tp = useTranslations("bingWebmaster.pages");
  const tw = useTranslations("bingWebmaster.seen.record");
  const siteId = useBingSiteId();
  const ask = `${list === "query" ? "keywordPages" : "pageKeywords"}|${record.key}`.slice(0, 900);
  const rows = useQuery(api.bingWebmasterReads.bingLiveRows, { siteId, ask });
  const asking = useAsk(rows === null ? { siteId, list, key: record.key } : null);
  const [search, setSearch, settled] = useSiteSearch();
  const matches = wordStartMatcher(settled.toLowerCase());
  const shown = rows?.filter((row) => !matches || matches(row.key.toLowerCase()));
  const { rows: sorted, tableSort } = useSiteSortedList(shown ?? (rows === null ? undefined : []), SORTS, { opening: "clicks", name: (row) => row.key });
  const paged = useSitePager(sorted, { isLoading: sorted === undefined });
  const figures = record.figures;
  const few = (impressions: number) => impressions < FEW_IMPRESSIONS;

  return (
    <div className="flex flex-col gap-6">
      {figures ? (
        <BingSees screen="record" data={{ list, record, rows }} says={[
          list === "query"
            ? figures.googlePosition !== null
              ? tw("keyword", { bing: formatPosition(figures.position), google: formatPosition(figures.googlePosition), clicks: formatNumber(figures.clicks), impressions: formatNumber(figures.impressions) })
              : tw("keywordOnlyBing", { bing: formatPosition(figures.position), clicks: formatNumber(figures.clicks), impressions: formatNumber(figures.impressions) })
            : tw("page", { clicks: formatNumber(figures.clicks), impressions: formatNumber(figures.impressions), googleClicks: formatNumber(figures.googleClicks), googleImpressions: formatNumber(figures.googleImpressions) }),
        ]} />
      ) : null}
      <BingRecordFigures row={figures} />
      <BingRecordChart weeks={record.weeks} measure={list === "query" ? "position" : "clicks"} host={host} />
      {asking === "FAILED" ? <Notice>{t("askFailed")}</Notice> : null}
      <DataTable
        rows={paged.pageRows}
        rowKey={(row) => row.key}
        search={{ value: search, onChange: setSearch, placeholder: list === "query" ? tp("searchPlaceholder") : tk("searchPlaceholder") }}
        cardHeader={
          <TableBar
            footer={paged.footer}
            noun={list === "query" ? "pages" : "keywords"}
            title={list === "query" ? t("pagesTitle") : t("keywordsTitle")}
            actions={
              <ListDownload
                fileName={`bing-webmaster-${list === "query" ? "keyword-pages" : "page-keywords"}`}
                rows={sorted}
                columns={[
                  { header: list === "query" ? tt("columns.page") : tt("columns.keyword"), value: (row) => row.key },
                  { header: tt("columns.clicks"), value: (row) => row.clicks },
                  { header: tt("columns.impressions"), value: (row) => row.impressions },
                  { header: tt("columns.position"), value: (row) => (row.position === null ? null : Math.round(row.position * 10) / 10) },
                ]}
              />
            }
          >
            {rows === null ? <span className="text-[12px] text-secondary">{t("asking")}</span> : null}
          </TableBar>
        }
        empty={{ icon: <SearchX className="h-8 w-8 text-muted/30" />, label: rows === null ? t("asking") : settled ? tt("noMatch") : t("noRows") }}
        footer={paged.footer}
        sort={tableSort}
        columns={[
          {
            key: "key",
            header: list === "query" ? tt("columns.page") : tt("columns.keyword"),
            sortable: true,
            className: CUT_COLUMN.first,
            cell: (row) => list === "query"
              ? <span className="block truncate text-[12px] text-info" title={row.key}>{pathOf(row.key)}</span>
              : <span className="text-[13px] text-foreground">{row.key}</span>,
          },
          { key: "clicks", header: tt("columns.clicks"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] tabular-nums text-foreground">{formatNumber(row.clicks)}</span> },
          { key: "impressions", header: tt("columns.impressions"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] tabular-nums text-foreground">{formatNumber(row.impressions)}</span> },
          {
            key: "ctr",
            header: tt("columns.ctr"),
            align: "right",
            sortable: true,
            cell: (row) => <span title={few(row.impressions) ? tt("fewImpressions") : undefined} className={`font-mono text-[12px] tabular-nums ${few(row.impressions) ? "text-muted" : "text-foreground"}`}>{formatRate(row.impressions > 0 ? row.clicks / row.impressions : null)}</span>,
          },
          {
            key: "position",
            header: tt("columns.position"),
            align: "right",
            sortable: true,
            cell: (row) => <span title={few(row.impressions) ? tt("fewImpressions") : undefined} className={`font-mono text-[12px] tabular-nums ${few(row.impressions) ? "text-muted" : "text-foreground"}`}>{formatPosition(row.position)}</span>,
          },
        ]}
      />
    </div>
  );
}

/** Ask Bing once for what a record's screen needs, never again for the same ask. "FAILED" when Bing could not answer. */
function useAsk(ask: { siteId: string; list: "query" | "page"; key: string } | null): "ASKING" | "FAILED" | "IDLE" {
  const t = useTranslations("bingWebmaster.record");
  const askLive = useAction(api.bingWebmasterReads.askBingLive);
  const { run } = useAdminAction({ scope: "bing-webmaster-live" });
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const asked = useRef(new Set<string>());
  const key = ask ? JSON.stringify(ask) : null;
  useEffect(() => {
    if (!key || asked.current.has(key)) return;
    asked.current.add(key);
    const asking = async () => {
      const outcome = await run(() => askLive(JSON.parse(key) as Parameters<typeof askLive>[0]), { key, suppressErrorToast: true, fallbackMessage: t("askFailed") });
      if (!outcome.ok || !outcome.data.ok) setFailed((before) => new Set([...before, key]));
    };
    void asking();
  }, [key, askLive, run, t]);
  if (!key) return "IDLE";
  return failed.has(key) ? "FAILED" : "ASKING";
}
