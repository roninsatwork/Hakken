"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAction, useConvex } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useTranslations } from "next-intl";
import { SearchX } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable, type DataTableColumn } from "@/src/ui/components/screens/DataTable";
import { DownloadButton, saveTextFile } from "@/src/ui/components/screens/DownloadButton";
import { Notice } from "@/src/ui/components/screens/Notice";
import { TableBar, type TableNoun } from "@/src/ui/components/screens/TableBar";
import { toCsv } from "../../sites/_components/siteFormat";
import { useSiteListPage } from "../../sites/_components/useSitePagedTable";
import { useSiteSearch } from "../../sites/_components/useSiteParam";
import { useSiteSort } from "../../sites/_components/useSiteSort";
import { ChangeCell, ConversionsCell, FigureCell, MoneyCell, PageLink, TextFigure } from "./AnalyticsCells";
import { formatPercent, formatTime } from "./analyticsFormat";
import { useAnalyticsArgs, useAnalyticsSiteId, useAnalyticsStatus, useDevice, usePeriod } from "./useAnalytics";
import { AnalyticsGate } from "./AnalyticsNotices";
import { DetailHeader, PageHeader } from "@/src/ui/components/screens/PageHeader";

export type ShownRow = FunctionReturnType<typeof api.googleAnalyticsReads.analyticsListPage>["rows"][number];
export type ListKind = "channel" | "source" | "landing" | "groups" | "page";
type Column = "name" | "visits" | "engaged" | "time" | "views" | "conversions" | "value" | "change";

/** Each list's columns, as drawn (§11): every table fits the page at 1440 and 1366 pixels. */
const COLUMNS: Record<ListKind, readonly Column[]> = {
  channel: ["name", "visits", "engaged", "conversions", "value", "change"],
  source: ["name", "visits", "engaged", "conversions", "value", "change"],
  landing: ["name", "visits", "engaged", "time", "conversions", "value", "change"],
  groups: ["name", "visits", "engaged", "time", "conversions", "value", "change"],
  page: ["name", "views", "time", "conversions", "value"],
};

/** Which way each heading's first press runs: the most first, names A to Z. */
const FIRSTS = {
  name: "asc", visits: "desc", engaged: "desc", time: "desc", views: "desc", conversions: "desc", value: "desc", change: "desc",
} as const;

/**
 * A Google Analytics list as the standard table (§5; Anthony, 2026-10-09:
 * "Any long table like this needs to be this standard"): its search box,
 * filters, table bar with the download, sorting headings over the whole list
 * and numbered pages of 25, 50, 75 or 100 rows, searched, sorted and paged on
 * the server. A page list for one device is asked of Google live, its every
 * device rows shown meanwhile (GA20; §11 board 19).
 */
export function AnalyticsListScreen({ header, ...table }: Parameters<typeof AnalyticsTable>[0] & {
  /** The page's own title above its table: a top page's, or a record's with the way back. */
  header: { icon: ReactNode; title: string; description: string; back?: { label: string; href: string } };
}) {
  const status = useAnalyticsStatus();
  const siteId = useAnalyticsSiteId();
  return (
    <div className="flex flex-col gap-6">
      {header.back ? (
        <DetailHeader back={header.back} icon={header.icon} title={header.title} description={header.description} />
      ) : (
        <PageHeader icon={header.icon} title={header.title} description={header.description} />
      )}
      {status ? (
        <AnalyticsGate status={status} siteId={siteId}>
          <AnalyticsTable {...table} />
        </AnalyticsGate>
      ) : null}
    </div>
  );
}

function AnalyticsTable({ list, channel, group, noun, searchPlaceholder, rowHref, filters, opening = "value", emptyLabel }: {
  list: ListKind;
  channel?: string;
  group?: string;
  noun: TableNoun;
  searchPlaceholder: string;
  rowHref?: (row: ShownRow) => string | null;
  filters?: ReactNode;
  opening?: Column;
  emptyLabel: string;
}) {
  const t = useTranslations("googleAnalytics.table");
  const tf = useTranslations("googleAnalytics.filters");
  const router = useRouter();
  const status = useAnalyticsStatus();
  const args = useAnalyticsArgs();
  const [period] = usePeriod();
  const [device] = useDevice();
  const [search, setSearch, settled] = useSiteSearch();
  const order = useSiteSort(FIRSTS, opening);
  const base = {
    ...args,
    list,
    ...(channel !== undefined ? { channel } : {}),
    ...(group !== undefined ? { group } : {}),
    ...(settled ? { q: settled } : {}),
    sort: order.key,
    direction: order.direction,
  };
  const paged = useSiteListPage(api.googleAnalyticsReads.analyticsListPage, status?.connection?.newestDay ? base : "skip");
  const live = paged.result?.live === true;
  // A page list for one device is asked of Google once; its every device list is shown meanwhile.
  const everyDevice = useSiteListPage(api.googleAnalyticsReads.analyticsListPage, live ? { ...base, device: "" } : "skip");
  const asking = useLiveAsk(live && (list === "landing" || list === "page" || list === "groups") ? { siteId: args.siteId, period: args.period, device: args.device, pages: list === "page" ? "page" : "landing" } : null);
  const shown = live ? everyDevice : paged;
  const currency = status?.connection?.currency ?? null;
  const columns = COLUMNS[list].map((column) => columnOf(column, list, currency, rowHref, t));
  const bar = [tf(`periods.${period}`), tf(`devices.${device}`).toLowerCase(), live ? t("asking") : t("greyed")].join(" · ");

  return (
    <div className="flex flex-col gap-4">
      {live ? (
        <Notice>
          <span className="block font-medium text-foreground">{asking === "FAILED" ? t("askFailedTitle") : t("askingTitle", { device: tf(`devices.${device}`).toLowerCase() })}</span>
          <span className="block">{asking === "FAILED" ? t("askFailedBody") : t("askingBody", { device: tf(`devices.${device}`).toLowerCase() })}</span>
        </Notice>
      ) : null}
      <DataTable
        rows={shown.pageRows}
        rowKey={(row) => row.key}
        onRowClick={rowHref ? (row) => {
          const href = rowHref(row);
          if (href) router.push(href);
        } : undefined}
        search={{ value: search, onChange: setSearch, placeholder: searchPlaceholder }}
        filters={filters}
        cardHeader={
          <TableBar
            footer={shown.footer}
            noun={noun}
            actions={<AnalyticsDownload args={base} list={list} currency={currency} />}
          >
            <span className="text-[12px] text-secondary">{bar}</span>
          </TableBar>
        }
        empty={{ icon: <SearchX className="h-8 w-8 text-muted/30" />, label: settled ? t("noMatch") : emptyLabel }}
        footer={shown.footer}
        sort={order.tableSort}
        columns={columns}
      />
    </div>
  );
}

function columnOf(
  column: Column,
  list: ListKind,
  currency: string | null,
  rowHref: ((row: ShownRow) => string | null) | undefined,
  t: (key: string, values?: Record<string, string | number>) => string,
): DataTableColumn<ShownRow> {
  switch (column) {
    case "name":
      return {
        key: "name",
        header: t(`columns.${list === "channel" ? "channel" : list === "source" ? "source" : list === "groups" ? "group" : "page"}`),
        sortable: true,
        cell: (row) => list === "landing" || list === "page"
          ? <PageLink address={row.label} href={rowHref ? rowHref(row) : null} />
          : list === "groups"
            ? (
              <span className="flex flex-col leading-tight">
                <span className="text-[13px] text-foreground">{row.label === "NOT_SORTED" ? t("notSorted") : row.label}</span>
                <span className="text-[11.5px] text-muted">{t("pagesCount", { count: row.members ?? 0 })}</span>
              </span>
            )
            : <span className="text-[13px] text-foreground">{row.label === "" ? t("noSource") : row.label}</span>,
      };
    case "visits":
      return { key: "visits", header: t("columns.visits"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.visits} /> };
    case "views":
      return { key: "views", header: t("columns.views"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.views} /> };
    case "engaged":
      return { key: "engaged", header: <span title={t("columns.engagedTitle")}>{t("columns.engaged")}</span>, align: "right", sortable: true, cell: (row) => <TextFigure text={formatPercent(row.engagementRate)} /> };
    case "time":
      return { key: "time", header: <span title={t("columns.timeTitle")}>{t("columns.time")}</span>, align: "right", sortable: true, cell: (row) => <TextFigure text={formatTime(row.timePerVisit)} /> };
    case "conversions":
      return {
        key: "conversions",
        header: t("columns.conversions"),
        align: "right",
        sortable: true,
        cell: (row) => list === "page"
          ? <FigureCell value={row.conversions} />
          : <ConversionsCell conversions={row.conversions} rate={row.conversionRate} fewVisits={row.fewVisits} />,
      };
    case "value":
      return { key: "value", header: t("columns.value"), align: "right", sortable: true, cell: (row) => <MoneyCell value={row.value} currency={currency} /> };
    case "change":
      return { key: "change", header: <span title={t("columns.changeTitle")}>{t("columns.change")}</span>, align: "right", sortable: true, cell: (row) => <ChangeCell change={row.change} /> };
  }
}

/**
 * Ask Google once for a list a screen needs (GA20): started when the screen
 * first needs it, never again for the same ask. "FAILED" when Google could not
 * answer; the screen keeps what it has.
 */
export function useLiveAsk(ask: { siteId: string; period: string; device: string; pages?: "landing" | "page"; page?: { ref: string; path: string } } | null): "ASKING" | "FAILED" | "IDLE" {
  const askLive = useAction(api.googleAnalyticsLive.askGoogleAnalyticsLive);
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const asked = useRef(new Set<string>());
  const key = ask ? JSON.stringify(ask) : null;
  useEffect(() => {
    if (!key || asked.current.has(key)) return;
    asked.current.add(key);
    const fail = () => setFailed((before) => new Set([...before, key]));
    askLive(JSON.parse(key) as Parameters<typeof askLive>[0])
      .then((answer) => {
        if (!answer.ok) fail();
      })
      .catch(fail);
  }, [key, askLive]);
  if (!key) return "IDLE";
  return failed.has(key) ? "FAILED" : "ASKING";
}

/** The whole list, in the order on screen, as CSV: read when pressed. */
function AnalyticsDownload({ args, list, currency }: {
  args: Record<string, unknown>;
  list: ListKind;
  currency: string | null;
}) {
  const t = useTranslations("googleAnalytics.table");
  const convex = useConvex();
  const [busy, setBusy] = useState(false);
  const columns = COLUMNS[list];
  return (
    <DownloadButton
      label={t("download")}
      busyLabel={t("downloading")}
      busy={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const all = await convex.query(api.googleAnalyticsReads.analyticsListAll, args as Parameters<typeof convex.query<typeof api.googleAnalyticsReads.analyticsListAll>>[1]);
          const headers = columns.map((column) => t(`csv.${column}`, { currency: currency ?? "" }));
          const rows = all.rows.map((row) => columns.map((column) => csvValue(row, column)));
          saveTextFile(toCsv(headers, rows), `google-analytics-${list}.csv`);
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

function csvValue(row: ShownRow, column: Column): string | number | null {
  switch (column) {
    case "name": return row.label;
    case "visits": return row.visits;
    case "views": return row.views;
    case "engaged": return row.engagementRate === null ? null : Math.round(row.engagementRate * 1000) / 10;
    case "time": return row.timePerVisit === null ? null : Math.round(row.timePerVisit);
    case "conversions": return row.conversions;
    case "value": return row.value / 100;
    case "change": return row.change === null ? null : Math.round(row.change * 1000) / 10;
  }
}
