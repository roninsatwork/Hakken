"use client";

import { useRouter } from "next/navigation";
import { useConvex } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useTranslations } from "next-intl";
import { SearchX } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { DataTable, type DataTableColumn } from "@/src/ui/components/screens/DataTable";
import { DownloadButton, saveTextFile } from "@/src/ui/components/screens/DownloadButton";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { formatNumber, toCsv } from "../../sites/_components/siteFormat";
import { useSiteListPage } from "../../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../sites/_components/useSiteParam";
import { useSiteSort } from "../../sites/_components/useSiteSort";
import { CUT_COLUMN, RecordLinkCell } from "../../sites/_components/SiteCells";
import { formatPosition, formatRate } from "../../search-console/_components/searchConsoleFormat";
import { FEW_IMPRESSIONS, useBingHref, useBingSiteId, useBingStatus, usePeriod } from "./useBing";
import { BingGate } from "./BingNotices";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";

/**
 * A Bing list as the standard table (bing-webmaster-plan.md §5, boards 3, 5
 * and 6): its search box and filters, the table bar with the download,
 * sorting headings over the whole list and numbered pages, searched, sorted
 * and paged on the server. Every row carries Google's figure for the same
 * keyword or page beside Bing's (BW10); a rate or position from fewer than 10
 * impressions is greyed (BW14).
 */

export type BingListAnswer = FunctionReturnType<typeof api.bingWebmasterReads.bingListPage>;
type Row = BingListAnswer["rows"][number];
export type BingTableKind = "keywords" | "pages" | "versus";

const FIRSTS = {
  name: "asc", clicks: "desc", impressions: "desc", ctr: "desc", position: "asc", googleClicks: "desc", googlePosition: "asc", gap: "desc",
} as const;

/** Which engine ranks the website higher for a row, as the server's own rule (`whoRanksHigher`). */
function whoOf(row: Row): "BING" | "GOOGLE" | "SAME" | "ONLY_BING" | null {
  if (row.position === null) return null;
  if (row.googlePosition === null || !row.googleImpressions) return "ONLY_BING";
  const gap = row.googlePosition - row.position;
  return Math.abs(gap) < 0.5 ? "SAME" : gap > 0 ? "BING" : "GOOGLE";
}

const BANDS = ["all", "top3", "top10", "top20", "rest"] as const;
const GOOGLES = ["all", "both", "onlyBing"] as const;
const WHOS = ["all", "BING", "GOOGLE", "ONLY_BING"] as const;

/**
 * A Bing list page: its own title above its table, as every list screen reads
 * (screen-kit.md), and the table once there are figures to show.
 */
export function BingListScreen({ header, ...table }: Parameters<typeof BingListTable>[0] & {
  header: { icon: React.ReactNode; title: string; description: string };
}) {
  const status = useBingStatus();
  const siteId = useBingSiteId();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={header.icon} title={header.title} description={header.description} />
      {status ? (
        <BingGate status={status} siteId={siteId}>
          <BingListTable {...table} />
        </BingGate>
      ) : null}
    </div>
  );
}

function BingListTable({ kind, head }: {
  kind: BingTableKind;
  /** What the page shows between its title and its table, from the same answer: its What Hakken sees and its figures. */
  head?: (answer: BingListAnswer | undefined) => React.ReactNode;
}) {
  const t = useTranslations("bingWebmaster.table");
  const tf = useTranslations("bingWebmaster.filters");
  const tk = useTranslations("bingWebmaster.keywords");
  const tp = useTranslations("bingWebmaster.pages");
  const router = useRouter();
  const siteId = useBingSiteId();
  const hrefFor = useBingHref(siteId);
  const [period] = usePeriod();
  const [search, setSearch, settled] = useSiteSearch();
  const [band, setBand] = useSiteParam<(typeof BANDS)[number]>("band", "all", BANDS);
  const [google, setGoogle] = useSiteParam<(typeof GOOGLES)[number]>("google", "all", GOOGLES);
  const [who, setWho] = useSiteParam<(typeof WHOS)[number]>("who", "all", WHOS);
  const [pageKind, setPageKind] = useSiteParam<string>("kind", "all");
  const order = useSiteSort(FIRSTS, kind === "versus" ? "gap" : "clicks");
  const list = kind === "pages" ? "page" : "query";
  const base = {
    siteId,
    list,
    // Bing against Google reads the 90 days, Search Console's comparable period.
    period: kind === "versus" ? "90" : period,
    ...(settled ? { q: settled } : {}),
    ...(kind === "keywords" && band !== "all" ? { band } : {}),
    ...(kind === "keywords" && google !== "all" ? { google } : {}),
    ...(kind === "versus" && who !== "all" ? { who } : {}),
    ...(kind === "pages" && pageKind !== "all" ? { kind: pageKind } : {}),
    sort: order.key,
    direction: order.direction,
  } as const;
  const paged = useSiteListPage(api.bingWebmasterReads.bingListPage, base);
  const recordHref = (row: Row) => hrefFor(kind === "pages" ? "pages/page" : "keywords/keyword", { ref: row.ref });

  const filters = kind === "keywords" ? (
    <>
      <Select chip={{ label: t("filters.position"), choice: band === "all" ? null : t(`filters.positions.${band}`) }} value={band} onChange={(next) => setBand(next as typeof band)}>
        {BANDS.map((entry) => <option key={entry} value={entry}>{t(`filters.positions.${entry}`)}</option>)}
      </Select>
      <Select chip={{ label: t("filters.google"), choice: google === "all" ? null : t(`filters.googles.${google}`) }} value={google} onChange={(next) => setGoogle(next as typeof google)}>
        {GOOGLES.map((entry) => <option key={entry} value={entry}>{t(`filters.googles.${entry}`)}</option>)}
      </Select>
    </>
  ) : kind === "pages" && (paged.result?.kinds.length ?? 0) > 0 ? (
    <Select
      chip={{ label: t("filters.kind"), choice: pageKind === "all" ? null : nameOfKind(paged.result?.kinds ?? [], pageKind, t("filters.notSorted")) }}
      value={pageKind}
      onChange={setPageKind}
    >
      <option value="all">{t("filters.allKinds")}</option>
      {(paged.result?.kinds ?? []).map((entry) => <option key={entry.id} value={entry.id}>{entry.name ?? t("filters.notSorted")}</option>)}
    </Select>
  ) : kind === "versus" ? (
    <Select chip={{ label: t("filters.who"), choice: who === "all" ? null : t(`filters.whos.${who}`) }} value={who} onChange={(next) => setWho(next as typeof who)}>
      {WHOS.map((entry) => <option key={entry} value={entry}>{t(`filters.whos.${entry}`)}</option>)}
    </Select>
  ) : undefined;

  return (
    <div className="flex flex-col gap-6">
      {head ? head(paged.result) : null}
      <DataTable
        rows={paged.pageRows}
        rowKey={(row) => row.ref}
        onRowClick={(row) => router.push(recordHref(row))}
        search={{ value: search, onChange: setSearch, placeholder: kind === "pages" ? tp("searchPlaceholder") : tk("searchPlaceholder") }}
        filters={filters}
        cardHeader={
          <TableBar footer={paged.footer} noun={kind === "pages" ? "pages" : "keywords"} actions={<BingDownload args={base} kind={kind} />}>
            <span className="text-[12px] text-secondary">{t("bar", { period: tf(`periods.${base.period}`) })}</span>
          </TableBar>
        }
        empty={{ icon: <SearchX className="h-8 w-8 text-muted/30" />, label: settled ? t("noMatch") : t("empty") }}
        footer={paged.footer}
        sort={order.tableSort}
        columns={columnsOf(kind, t, recordHref)}
      />
    </div>
  );
}

/** A classification's name for the chip, Not sorted for none. */
function nameOfKind(kinds: readonly { id: string; name: string | null }[], id: string, notSorted: string): string {
  return kinds.find((entry) => entry.id === id)?.name ?? notSorted;
}

/** A rate or position from too few impressions to trust, greyed with why (BW14). */
function Trusted({ text, impressions }: { text: string; impressions: number }) {
  const t = useTranslations("bingWebmaster.table");
  const few = impressions < FEW_IMPRESSIONS;
  return (
    <span className={`font-mono text-[12px] tabular-nums ${few ? "text-muted" : "text-foreground"}`} title={few ? t("fewImpressions") : undefined}>
      {text}
    </span>
  );
}

const figure = (value: number | null) => <span className="font-mono text-[12px] tabular-nums text-foreground">{formatNumber(value)}</span>;

function columnsOf(
  kind: BingTableKind,
  t: (key: string, values?: Record<string, string | number>) => string,
  recordHref: (row: Row) => string,
): DataTableColumn<Row>[] {
  const name: DataTableColumn<Row> = {
    key: "name",
    header: kind === "pages" ? t("columns.page") : t("columns.keyword"),
    sortable: true,
    className: CUT_COLUMN.first,
    // A keyword in white, a page's address in blue under its title, each cut to a line (`CUT_COLUMN`).
    cell: (row) => kind === "pages" ? (
      <span className="flex min-w-0 flex-col">
        {row.title ? <RecordLinkCell href={recordHref(row)} cut>{row.title}</RecordLinkCell> : null}
        <RecordLinkCell href={recordHref(row)} cut className="text-[12px] text-info">{pathOf(row.key)}</RecordLinkCell>
      </span>
    ) : <RecordLinkCell href={recordHref(row)}>{row.key}</RecordLinkCell>,
  };
  const clicks: DataTableColumn<Row> = { key: "clicks", header: kind === "versus" ? t("columns.bingClicks") : t("columns.clicks"), align: "right", sortable: true, cell: (row) => figure(row.clicks) };
  const impressions: DataTableColumn<Row> = { key: "impressions", header: t("columns.impressions"), align: "right", sortable: true, cell: (row) => figure(row.impressions) };
  const ctr: DataTableColumn<Row> = { key: "ctr", header: t("columns.ctr"), align: "right", sortable: true, cell: (row) => <Trusted text={formatRate(row.ctr)} impressions={row.impressions} /> };
  const position: DataTableColumn<Row> = { key: "position", header: kind === "versus" ? t("columns.bingPosition") : t("columns.position"), align: "right", sortable: true, cell: (row) => <Trusted text={formatPosition(row.position)} impressions={row.impressions} /> };
  const googlePosition: DataTableColumn<Row> = {
    key: "googlePosition",
    header: t("columns.googlePosition"),
    align: "right",
    sortable: true,
    cell: (row) => row.googlePosition === null ? <span className="whitespace-nowrap text-[12px] text-muted">{t("notOnGoogle")}</span> : figureText(formatPosition(row.googlePosition)),
  };
  const googleClicks: DataTableColumn<Row> = {
    key: "googleClicks",
    header: t("columns.googleClicks"),
    align: "right",
    sortable: true,
    cell: (row) => row.googleClicks === null ? <span className="text-[12px] text-muted">–</span> : figure(row.googleClicks),
  };
  const who: DataTableColumn<Row> = {
    key: "gap",
    header: t("columns.who"),
    sortable: true,
    cell: (row) => {
      const higher = whoOf(row);
      if (!higher) return <span className="text-[12px] text-muted">–</span>;
      const gap = row.position !== null && row.googlePosition !== null ? Math.abs(Math.round((row.googlePosition - row.position) * 10) / 10) : 0;
      return (
        <StatusLabel tone={higher === "BING" ? "success" : higher === "GOOGLE" ? "warning" : higher === "ONLY_BING" ? "info" : "neutral"}>
          {t(`who.${higher}`, { gap: gap.toLocaleString("en-GB") })}
        </StatusLabel>
      );
    },
  };
  if (kind === "keywords") return [name, clicks, impressions, ctr, position, googlePosition];
  if (kind === "pages") return [name, clicks, impressions, ctr, position, googleClicks];
  return [name, position, googlePosition, clicks, googleClicks, who];
}

const figureText = (text: string) => <span className="font-mono text-[12px] tabular-nums text-foreground">{text}</span>;

/** A page's path, as the tables show it under its title. */
export function pathOf(address: string): string {
  try {
    const url = new URL(address);
    return `${url.pathname}${url.search}`;
  } catch {
    return address;
  }
}

/** The whole list, in the order on screen, as CSV: read when pressed. */
function BingDownload({ args, kind }: { args: Record<string, unknown>; kind: BingTableKind }) {
  const t = useTranslations("bingWebmaster.table");
  const convex = useConvex();
  const { run, isBusy } = useAdminAction({ scope: "bing-webmaster-download" });
  return (
    <DownloadButton
      label={t("download")}
      busyLabel={t("downloading")}
      busy={isBusy()}
      onClick={async () => {
        const outcome = await run(
          () => convex.query(api.bingWebmasterReads.bingListAll, args as Parameters<typeof convex.query<typeof api.bingWebmasterReads.bingListAll>>[1]),
          { fallbackMessage: t("downloadFailed") },
        );
        if (!outcome.ok) return;
        const headers = [
          kind === "pages" ? t("columns.page") : t("columns.keyword"),
          t("columns.clicks"), t("columns.impressions"), t("columns.ctr"), t("columns.position"),
          t("columns.googleClicks"), t("columns.googlePosition"),
        ];
        const rows = outcome.data.map((row) => [
          row.key,
          row.clicks,
          row.impressions,
          row.ctr === null ? null : Math.round(row.ctr * 10_000) / 100,
          row.position === null ? null : Math.round(row.position * 10) / 10,
          row.googleClicks,
          row.googlePosition === null ? null : Math.round(row.googlePosition * 10) / 10,
        ]);
        saveTextFile(toCsv(headers, rows), `bing-webmaster-${kind}.csv`);
      }}
    />
  );
}
