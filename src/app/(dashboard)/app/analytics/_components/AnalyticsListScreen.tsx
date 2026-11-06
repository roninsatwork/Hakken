"use client";

import { useSeesPart } from "@/src/ui/components/screens/hakkenSeesStore";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAction, useConvex } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useTranslations } from "next-intl";
import { SearchX } from "lucide-react";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { api } from "@/convex/_generated/api";
import { NOT_SET } from "@/convex/utils/landingFlow";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { pageName } from "@/convex/utils/pageNames";
import { TickActions, TickCount, tickColumn, type TableTicks } from "@/src/ui/components/screens/TableTicks";
import type { DataTableColumn } from "@/src/ui/components/screens/DataTable";
import { ListTable } from "@/src/ui/components/screens/ListTable";
import { DownloadButton, saveTextFile } from "@/src/ui/components/screens/DownloadButton";
import { Notice } from "@/src/ui/components/screens/Notice";
import type { TableNoun } from "@/src/ui/components/screens/TableBar";
import { toCsv } from "../../sites/_components/siteFormat";
import { useSiteListPage } from "../../sites/_components/useSitePagedTable";
import { TABLE_PAGE_KEY, useSetSiteParams, useSiteSearch } from "../../sites/_components/useSiteParam";
import { useSiteSort } from "../../sites/_components/useSiteSort";
import { CUT_COLUMN } from "../../sites/_components/SiteCells";
import { ChangeCell, ConversionsCell, ConversionsChangeCell, ConversionsHereCell, FigureCell, NextPageCell, PageLink, RateCell, ShareCell, TextFigure, UpOrDownCell, ViewsChangeCell } from "./AnalyticsCells";
import { formatPercent, formatPerVisit, formatTime, pathOf } from "./analyticsFormat";
import { MOST_PLOTTED, MOVE_VIEWS, type PageMove } from "@/convex/utils/pageMoves";
import { NO_PAGE_KIND } from "@/convex/utils/sees/analyticsChannel";
import { AI_ASSISTANTS_CHANNEL } from "@/convex/utils/aiAssistants";
import { useAnalyticsArgs, useAnalyticsSiteId, useAnalyticsStatus, useDevice, usePeriod, periodWord } from "./useAnalytics";
import { AnalyticsGate } from "./AnalyticsNotices";
import { readListInParts } from "./readListInParts";
import { withoutMoney } from "./useEyeFigures";
import { spansOfList, useSpanInWords, useSpanName } from "./VisitsCharts";
import { DetailHeader, PageHeader } from "@/src/ui/components/screens/PageHeader";

export type ListPageAnswer = FunctionReturnType<typeof api.googleAnalyticsReads.analyticsListPage>;
export type ShownRow = ListPageAnswer["rows"][number];
export type ListKind = "channel" | "source" | "landing" | "groups" | "page" | "campaign" | "adKeyword" | VisitorList;
/** Visitors' lists (§18.2 board 15). */
export type VisitorList = "visitorType" | "browser" | "system" | "age" | "gender" | "interest";
export type Column = "tick" | "name" | "source" | "cameFrom" | "visitsNow" | "visitsBefore" | "visitsChange" | "bought" | "share" | "elsewhere" | "started" | "landsMost" | "visits" | "engaged" | "bounce" | "pages" | "people" | "time" | "views" | "viewsChange" | "conversions" | "rate" | "conversionsChange" | "change" | "left" | "onward" | "next";

/** Visitors' columns, each group with the classification it lands on most (ga-conversions-visitors-plan.md CV7). */
const VISITOR_COLUMNS: readonly Column[] = ["name", "people", "visits", "engaged", "conversions", "change", "landsMost"];

/**
 * Each list's columns, as drawn (§11, §15; the second round, §18.2 boards 18
 * and 20): every table fits the page at 1440 and 1366 pixels. No list shows
 * money, on screen or in its download (Anthony, 2026-11-03: "Take money off").
 * All pages (all-pages-way-6-plan-2026-11-04.md, step 5): a tick box to draw the
 * page on its chart, its visits and views, the views against the span before,
 * time on page, the conversions made there with their rate under them, and those
 * against the span before.
 */
const COLUMNS: Record<ListKind, readonly Column[]> = {
  // Channels (ga-channel-pages-plan.md CH9): dwell time, the conversions each started, and the page group most of its visits land on.
  channel: ["name", "visits", "time", "conversions", "started", "change", "landsMost"],
  source: ["name", "visits", "engaged", "conversions", "change"],
  // Each landing page's own funnel (landing-pages-flow-plan.md LF4): what its visits did next, no advice.
  landing: ["tick", "name", "visits", "left", "onward", "next", "conversions"],
  groups: ["name", "visits", "left", "onward", "next", "conversions"],
  page: ["tick", "name", "visits", "views", "viewsChange", "time", "conversions", "conversionsChange"],
  // Campaigns (campaigns-new-page-plan-2026-11-05.md, step 6): each campaign with where its link was, its visits against the
  // dates before, and what they did; and the words tagged links carry.
  campaign: ["name", "source", "visitsNow", "visitsBefore", "visitsChange", "bought", "conversions"],
  adKeyword: ["name", "visitsNow", "visitsBefore", "visitsChange", "bought", "conversions"],
  // Visitors (§18.2 board 15): each group's people beside its visits.
  visitorType: VISITOR_COLUMNS,
  browser: VISITOR_COLUMNS,
  system: VISITOR_COLUMNS,
  age: VISITOR_COLUMNS,
  gender: VISITOR_COLUMNS,
  interest: VISITOR_COLUMNS,
};

/** A channel's classifications (ga-channel-pages-plan.md CH7): each one's share of the channel's visits beside them. */
const CHANNEL_GROUP_COLUMNS: readonly Column[] = ["name", "share", "visits", "bounce", "time", "conversions", "change"];

/** A channel's own landing pages keep their approved columns (ga-channel-pages-plan.md CH7): the funnel is Landing pages' alone. */
const CHANNEL_LANDING_COLUMNS: readonly Column[] = ["name", "visits", "bounce", "pages", "time", "conversions", "change"];
const CHANNEL_LANDING_CSV: readonly Column[] = ["name", "visits", "engaged", "bounce", "pages", "time", "conversions", "change"];

/** AI assistants' own page (CH8): each assistant's visits Google filed outside its AI Assistant channel beside its visits. */
const ASSISTANT_COLUMNS: readonly Column[] = ["name", "visits", "elsewhere", "engaged", "conversions", "change"];

/** Each list's download: its columns, with engagement on the page lists as columns of their own. */
const CSV_COLUMNS: Record<ListKind, readonly Column[]> = {
  ...COLUMNS,
  landing: ["name", "visits", "left", "onward", "next", "engaged", "bounce", "pages", "time", "conversions", "change"],
  groups: ["name", "visits", "left", "onward", "next", "engaged", "bounce", "pages", "time", "conversions", "change"],
  // Campaigns' download says where a link was both ways, and keeps a campaign's name as it was tagged.
  campaign: ["name", "cameFrom", "source", "visitsNow", "visitsBefore", "visitsChange", "bought", "conversions"],
  // All pages' download keeps people (AP1, AP4).
  page: ["name", "visits", "views", "viewsChange", "people", "time", "conversions", "rate", "conversionsChange"],
};

/** The lists whose conversion rate sits beside the count on one line ("4 · 2.8%"), as Landing pages are drawn (§15). */
const ONE_LINE: ReadonlySet<ListKind> = new Set(["landing", "groups"]);

/** Which way each heading's first press runs: the most first, names A to Z. */
const FIRSTS = {
  share: "desc",
  elsewhere: "desc",
  started: "desc",
  name: "asc", visits: "desc", engaged: "desc", bounce: "asc", pages: "desc", people: "desc", time: "desc", views: "desc", conversions: "desc", change: "desc",
  viewsChange: "desc", rate: "desc", conversionsChange: "desc",
  // Campaigns' table.
  visitsBefore: "desc", visitsChange: "desc", bought: "desc",
  // Landing pages' funnel (LF4): the fewest leaving first, the most going on first, the strongest next step first.
  left: "asc", onward: "desc", next: "desc",
} as const;

const rowKeyOf = (row: ShownRow) => row.key;
const NO_TICKS: TableTicks = { keys: [], set: () => undefined, most: 0, limit: "" };
/** All pages: a page with views can be drawn; a page nobody viewed in these dates has nothing to draw. */
const canTickFor = (list: ListKind) => (list === "page" ? (row: ShownRow) => row.key.startsWith("~") && row.views > 0 : undefined);

/** The pages drawn on All pages' chart, in the address (`plot`). None until someone ticks one: the chart opens on the whole website. */
const PLOT_KEY = "plot";

/** The ticked pages, by their page numbers, and the tick that changes them; the table stays on its page. */
function usePlotted(on: boolean): { keys: string[]; set: (keys: string[]) => void } | null {
  const params = useSearchParams();
  const set = useSetSiteParams();
  if (!on) return null;
  const keys = (params.get(PLOT_KEY) ?? "").split(",").filter((key) => key.startsWith("~")).slice(0, MOST_PLOTTED);
  return { keys, set: (now) => set({ [PLOT_KEY]: now.length > 0 ? now.join(",") : null, [TABLE_PAGE_KEY]: params.get(TABLE_PAGE_KEY) }) };
}

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

/** Tick boxes on a table: the pages ticked, the most at once, and what a full table says on hover. */

export type ChannelTable = {
  /** The channel's visits in these dates, for each classification's share. */
  visits: number;
  /** A page group's words, from its id or code (`useKindName`). */
  kindName: (kind: string) => string;
};

export function AnalyticsTable({ list, channel, filed, kindName, group, leaveOut = false, move, plot = false, ticks, noun, searchPlaceholder, rowHref, filters, columnsShown, barTitle, barDescription, headings, opening = "visits", emptyLabel, head, nameOf, ofChannel, seesPart, cameFrom, sourceName, nameHover, leaveOutColumns }: {
  /** Campaigns: only the links that were in this place (`utils/campaignNames.ts`). */
  cameFrom?: string;
  /** Campaigns: where a link was, in the reader's words. */
  sourceName?: (row: ShownRow) => string;
  /** A row's name as it's kept, on hover, where `nameOf` says it another way. */
  nameHover?: (row: ShownRow) => string | undefined;
  /** Standard columns this screen doesn't show: Bought, on a website with nothing bought. */
  leaveOutColumns?: readonly string[];
  /** The columns this screen shows, where it isn't the list's usual set: Overview's Top pages. */
  columnsShown?: readonly Column[];
  /** A title and a line in the table's bar, for a table that sits among others on its page. */
  barTitle?: string;
  barDescription?: string;
  /** A column's heading, where the page calls it something else: Overview's Events, on a website that doesn't sell. */
  headings?: Partial<Record<Column, ReactNode>>;
  /** The eye's name for this table's rows, where its page's own answer does not hold them (Channels; `useSeesPart`). */
  seesPart?: string;
  /**
   * A channel's own landing pages or classifications (ga-channel-pages-plan.md
   * CH7): every device's, as they are kept; each page with its classification,
   * each classification with its share of the channel's visits.
   */
  ofChannel?: ChannelTable;
  /** AI assistants' sources (CH8): only the visits Google filed under this channel. */
  filed?: string;
  /** A page group's words, for Channels' "Lands most on" (CH9). */
  kindName?: (kind: string) => string;
  /**
   * What the page shows between its title and its table, from the same
   * answer: its What Hakken sees, and a channel's own figures (§14, §15) —
   * and on All pages, its chart of the pages ticked (AP3).
   */
  head?: (answer: ListPageAnswer | undefined, plotted: readonly string[], shown: ListPageAnswer | undefined) => ReactNode;
  /** All pages' filter (AP5): the pages that gained, dropped, stayed static or had no visits. */
  move?: PageMove | "all";
  /** All pages: a tick box on each page to draw it on the chart above (AP3). */
  plot?: boolean;
  /** Tick boxes the page keeps itself: Funnel's, which choose the pages its route chart shows. */
  ticks?: TableTicks;
  /** All pages: without the shop's own search, basket and account pages (`isShopPage`). */
  leaveOut?: boolean;
  list: ListKind;
  channel?: string;
  group?: string;
  noun: TableNoun;
  searchPlaceholder: string;
  rowHref?: (row: ShownRow) => string | null;
  /** Beside the search box; given the answer, for filters that count what they hold (All pages, AP5). */
  filters?: ReactNode | ((answer: ListPageAnswer | undefined) => ReactNode);
  opening?: keyof typeof FIRSTS;
  emptyLabel: string;
  /** A row's name in the reader's words, where Google's is a code: Visitors' "new", "female", "unknown". */
  nameOf?: (row: ShownRow) => string;
}) {
  const t = useTranslations("googleAnalytics.table");
  const tf = useTranslations("googleAnalytics.filters");
  const router = useRouter();
  const { platformName } = useSystemSettings();
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
    ...(cameFrom !== undefined ? { cameFrom } : {}),
    ...(leaveOut ? { leaveOut: true } : {}),
    ...(filed !== undefined ? { filed } : {}),
    ...(settled ? { q: settled } : {}),
    ...(move !== undefined ? { move } : {}),
    sort: order.key,
    direction: order.direction,
  };
  const paged = useSiteListPage(api.googleAnalyticsReads.analyticsListPage, status?.connection?.newestDay ? base : "skip");
  // A device's list the next collection builds (ga-stored-figures-plan.md SF3): every device's is shown meanwhile.
  const live = paged.result?.live === true;
  const everyDevice = useSiteListPage(api.googleAnalyticsReads.analyticsListPage, live ? { ...base, device: "" } : "skip");
  const campaigns = list === "campaign" || list === "adKeyword";
  const shown = live ? everyDevice : paged;
  // The rows still carry money for Ask Hakken and Insights: never for the eye (Anthony, 2026-11-03: "Take money off").
  const seesRows = useMemo(() => (shown.result ? withoutMoney(shown.result) : shown.result), [shown.result]);
  useSeesPart(seesPart, seesRows);
  const pagePlot = usePlotted(plot && list === "page");
  const plotted: TableTicks | null = ticks ?? (pagePlot ? { ...pagePlot, most: MOST_PLOTTED, limit: t("tickLimit") } : null);
  // All pages' headings say which dates are set against which: "Views in October compared with September".
  const spans = spansOfList(paged.result);
  const inWords = useSpanInWords(...spans);
  const spanName = useSpanName();
  const assistants = list === "source" && channel === AI_ASSISTANTS_CHANNEL;
  const columns = (columnsShown ? columnsShown : ofChannel && list === "groups" ? CHANNEL_GROUP_COLUMNS : ofChannel && list === "landing" ? CHANNEL_LANDING_COLUMNS : assistants ? ASSISTANT_COLUMNS : COLUMNS[list])
    .filter((column) => (column !== "tick" || plotted !== null) && !leaveOutColumns?.includes(column))
    .map((column) => columnOf(column, list, rowHref, t, nameOf, plotted, ofChannel, assistants, kindName ?? ofChannel?.kindName, inWords, { sourceName, nameHover, spans: { now: spanName(spans[0]), before: spanName(spans[1]) } }))
    .map((column) => (headings?.[column.key as Column] ? { ...column, header: headings[column.key as Column] } : column));
  // Campaigns say the visits from no tagged link beside the list (§18.2 board 17).
  const untagged = shown.result?.untagged ?? null;
  const bar = [
    tf(`periods.${periodWord(period)}`), tf(`devices.${device}`).toLowerCase(),
    live ? t("collecting") : untagged !== null ? t(list === "adKeyword" ? "noAdKeyword" : "untagged", { count: untagged }) : t("greyed"),
  ].join(" · ");

  return (
    <div className="flex flex-col gap-4">
      {head ? head(paged.result, plotted?.keys ?? [], shown.result) : null}
      {live ? (
        <Notice>
          <span className="block font-medium text-foreground">{t("collectingTitle", { device: tf(`devices.${device}`).toLowerCase() })}</span>
          <span className="block">{t(campaigns ? "collectingBodyCampaigns" : "collectingBody", { device: tf(`devices.${device}`).toLowerCase(), platformName })}</span>
        </Notice>
      ) : null}
      <ListTable
        rows={shown.pageRows}
        rowKey={(row) => row.key}
        noun={noun}
        {...(barTitle ? { title: barTitle, description: barDescription } : {})}
        // All pages' and Funnel's bar is its count, how many are ticked and its buttons, with no sentence beside them.
        summary={(list === "page" || (list === "landing" && !ofChannel)) && !live ? (plotted ? <TickCount ticks={plotted} /> : null) : <span className="text-[12px] text-secondary">{bar}</span>}
        actions={
          <>
            {plotted ? <TickActions ticks={plotted} rows={shown.pageRows ?? []} rowKey={rowKeyOf} canTick={canTickFor(list)} /> : null}
            <AnalyticsDownload args={base} list={list} csvColumns={ofChannel && list === "landing" ? CHANNEL_LANDING_CSV : undefined} kindName={kindName ?? ofChannel?.kindName} sourceName={sourceName} leaveOutColumns={leaveOutColumns} />
          </>
        }
        onRowClick={rowHref ? (row) => {
          const href = rowHref(row);
          if (href) router.push(href);
        } : undefined}
        search={{ value: search, onChange: setSearch, placeholder: searchPlaceholder }}
        filters={typeof filters === "function" ? filters(paged.result) : filters}
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
  rowHref: ((row: ShownRow) => string | null) | undefined,
  t: (key: string, values?: Record<string, string | number>) => string,
  nameOf?: (row: ShownRow) => string,
  plotted?: TableTicks | null,
  ofChannel?: ChannelTable,
  /** AI assistants' own page: its sources are assistants. */
  assistants = false,
  kindName?: (kind: string) => string,
  /** All pages: the dates in its headings' hovers. */
  inWords?: { now: string; before: string },
  /** Campaigns: its words for a row, and each span's own name where it's a calendar month. */
  campaigns?: { sourceName?: (row: ShownRow) => string; nameHover?: (row: ShownRow) => string | undefined; spans: { now: string | null; before: string | null } },
): DataTableColumn<ShownRow> {
  switch (column) {
    case "tick":
      return tickColumn<ShownRow>(plotted ?? NO_TICKS, {
        rowKey: rowKeyOf,
        canTick: canTickFor(list),
        label: (row) => t("tick", { page: row.key === NOT_SET ? t("pageNotKnown") : pathOf(row.label) }),
        heading: t("tickColumn"),
      });
    case "name":
      return {
        key: "name",
        header: t(`columns.${list === "groups" ? (ofChannel ? "classification" : "group") : list === "landing" ? "page" : assistants ? "assistant" : list}`),
        sortable: true,
        // A page's title and address cut to a line each in their share of the table, as Sites' words are (CUT_COLUMN).
        ...(list === "landing" ? { className: CUT_COLUMN.first } : {}),
        // All pages' Page column keeps its room: where every row has a title it could shrink to one letter (2026-11-04).
        // No wider, or the table runs off the page at 1366 pixels.
        ...(list === "page" ? { className: `${CUT_COLUMN.first} min-w-[160px]` } : {}),
        cell: (row) => list === "landing" && !ofChannel && row.key === NOT_SET
          // The visits Google put to no page: said so, never a link.
          ? <span className="block truncate text-[13px] text-foreground">{t("pageNotKnown")}</span>
          : list === "landing" && ofChannel && row.kind === NO_PAGE_KIND
          // The visits Google put to no page: said so, never a link (ga-channel-pages-plan.md CH7).
          ? <PageLink address={row.label} href={null} title={ofChannel.kindName(NO_PAGE_KIND)} kind={t("noPageLost")} />
          : list === "landing" || list === "page"
          ? <PageLink address={row.label} href={rowHref ? rowHref(row) : null} title={row.title ?? (ofChannel ? undefined : pageName(row.label))} kind={ofChannel && row.kind ? ofChannel.kindName(row.kind) : undefined} />
          : list === "groups"
            ? (
              <span className="flex flex-col leading-tight">
                <span className="text-[13px] text-foreground">{ofChannel ? ofChannel.kindName(row.key) : row.label === "NOT_SORTED" ? t("notSorted") : row.label}</span>
                <span className="text-[11.5px] text-muted">{t("pagesCount", { count: row.members ?? 0 })}</span>
              </span>
            )
            // A campaign's name gives way before Came from does: a long one wraps, so the table never runs off the page and "Google" stays whole.
            : <span className={`text-[13px] text-foreground ${list === "campaign" || list === "adKeyword" ? "[overflow-wrap:anywhere]" : ""}`} title={campaigns?.nameHover?.(row)}>{nameOf ? nameOf(row) : row.label === "" ? t("noSource") : row.label}</span>,
      };
    case "source":
      return { key: "source", header: t("columns.cameFrom"), cell: (row) => <span className="block min-w-[52px] text-[12px] text-secondary [overflow-wrap:anywhere]" title={row.source}>{campaigns?.sourceName ? campaigns.sourceName(row) : row.source ?? ""}</span> };
    case "cameFrom":
      return { key: "cameFrom", header: t("columns.cameFrom"), cell: (row) => <span className="text-[12px] text-secondary">{campaigns?.sourceName ? campaigns.sourceName(row) : row.source ?? ""}</span> };
    case "visitsNow":
      return { key: "visits", header: <span title={t("columns.visitsNowTitle", { when: inWords?.now ?? "" })}>{campaigns?.spans.now ?? t("columns.visits")}</span>, align: "right", sortable: true, cell: (row) => <FigureCell value={row.visits} /> };
    case "visitsBefore":
      return { key: "visitsBefore", header: <span title={t("columns.visitsBeforeTitle", { before: inWords?.before ?? "" })}>{campaigns?.spans.before ?? t("columns.before")}</span>, align: "right", sortable: true, cell: (row) => <FigureCell value={row.visitsBefore ?? null} /> };
    case "visitsChange":
      return { key: "visitsChange", header: <span title={t("columns.visitsChangeTitle", { now: inWords?.now ?? "", before: inWords?.before ?? "" })}>{t("columns.upOrDown")}</span>, align: "right", sortable: true, cell: (row) => <UpOrDownCell now={row.visits} before={row.visitsBefore ?? null} /> };
    case "bought":
      return { key: "bought", header: <span title={t("columns.boughtTitle")}>{t("columns.bought")}</span>, align: "right", sortable: true, cell: (row) => <ConversionsHereCell conversions={row.purchases} rate={row.visits > 0 ? row.purchases / row.visits : null} fewVisits={row.fewVisits} /> };
    case "elsewhere":
      return { key: "elsewhere", header: <span title={t("columns.elsewhereTitle")}>{t("columns.elsewhere")}</span>, align: "right", sortable: true, cell: (row) => <FigureCell value={row.elsewhere ? row.elsewhere : null} quiet /> };
    case "started":
      return { key: "started", header: <span title={t("columns.startedTitle")}>{t("columns.started")}</span>, align: "right", sortable: true, cell: (row) => <FigureCell value={row.started ?? null} /> };
    case "landsMost":
      return {
        key: "landsMost",
        header: <span title={t("columns.landsMostTitle")}>{t("columns.landsMost")}</span>,
        cell: (row) => (row.landsMost ? (
          <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap text-[12px]">
            <span className="text-foreground">{landsMostName(row.landsMost, kindName)}</span>
            <span className="font-mono text-secondary">· {formatPercent(row.landsMost.share)}</span>
          </span>
        ) : <NoFigure />),
      };
    case "share":
      // Each row's visits over the channel's: it sorts as the visits do.
      return { key: "share", header: t("columns.share"), align: "right", sortable: true, cell: (row) => <TextFigure text={formatPercent(ofChannel && ofChannel.visits > 0 ? row.visits / ofChannel.visits : null)} /> };
    case "visits":
      return { key: "visits", header: t("columns.visits"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.visits} /> };
    case "views":
      return { key: "views", header: t("columns.views"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.views} /> };
    case "viewsChange":
      return { key: "viewsChange", header: <span title={t("columns.viewsChangeTitle", { now: inWords?.now ?? "", before: inWords?.before ?? "", most: MOVE_VIEWS - 1 })}>{t("columns.upOrDown")}</span>, align: "right", sortable: true, cell: (row) => <ViewsChangeCell views={row.views} before={row.viewsBefore} /> };
    case "rate":
      return { key: "rate", header: <span title={t("columns.rateTitle")}>{t("columns.rate")}</span>, align: "right", sortable: true, cell: (row) => <RateCell rate={row.conversionRate} fewVisits={row.fewVisits} /> };
    case "conversionsChange":
      return { key: "conversionsChange", header: <span title={t("columns.conversionsChangeTitle", { now: inWords?.now ?? "", before: inWords?.before ?? "" })}>{t("columns.upOrDown")}</span>, align: "right", sortable: true, cell: (row) => <ConversionsChangeCell conversions={row.conversions} before={row.conversionsBefore} /> };
    case "engaged":
      return { key: "engaged", header: <span title={t("columns.engagedTitle")}>{t("columns.engaged")}</span>, align: "right", sortable: true, cell: (row) => <TextFigure text={formatPercent(row.engagementRate)} /> };
    case "bounce":
      return { key: "bounce", header: <span title={t("columns.bounceTitle")}>{t("columns.bounce")}</span>, align: "right", sortable: true, cell: (row) => <TextFigure text={formatPercent(row.bounceRate)} /> };
    case "pages":
      return { key: "pages", header: <span title={t("columns.pagesTitle")}>{t("columns.pages")}</span>, align: "right", sortable: true, cell: (row) => <TextFigure text={formatPerVisit(row.pagesPerVisit)} /> };
    case "people":
      return { key: "people", header: <span title={t("columns.peopleTitle")}>{t("columns.people")}</span>, align: "right", sortable: true, cell: (row) => <FigureCell value={row.people} /> };
    case "time":
      // All pages and Channels call it dwell time (all-pages-rethink-plan.md AP4, ga-channel-pages-plan.md CH9); the other lists keep their approved "Time".
      return { key: "time", header: <span title={t("columns.timeTitle")}>{t(list === "page" ? "columns.timeOnPage" : list === "channel" ? "columns.dwell" : "columns.time")}</span>, align: "right", sortable: true, cell: (row) => <TextFigure text={formatTime(row.timePerVisit)} /> };
    case "conversions":
      return {
        key: "conversions",
        // A page's own conversions, or those of the visits that started on it, never both called "Conversions" (analytics-page-screen-plan.md PS1).
        header: list === "page" ? <span title={t("columns.conversionsHereTitle")}>{t("columns.conversions")}</span>
          // Funnel's table says Conversions, as the page has no other kind; a channel's own page keeps its approved heading.
          : list === "landing" || list === "groups" ? <span title={t("columns.conversionsStartedTitle")}>{t(ofChannel ? "columns.conversionsStarted" : "columns.conversionsOfVisit")}</span>
            : list === "campaign" || list === "adKeyword" ? <span title={t("columns.conversionsTimesTitle")}>{t("columns.conversions")}</span>
              : t("columns.conversions"),
        align: "right",
        sortable: true,
        cell: (row) => list === "page" || list === "campaign" || list === "adKeyword" || (list === "landing" && !ofChannel)
          // All pages and Funnel: the count, and its rate under it as "per 100 visits", as it counts times, not visits.
          ? <ConversionsHereCell conversions={row.conversions} rate={row.conversionRate} fewVisits={row.fewVisits} />
          : <ConversionsCell conversions={row.conversions} rate={row.conversionRate} fewVisits={row.fewVisits} oneLine={ONE_LINE.has(list)} />,
      };
    case "change":
      return { key: "change", header: <span title={t("columns.changeTitle")}>{t("columns.change")}</span>, align: "right", sortable: true, cell: (row) => <ChangeCell change={row.change} /> };
    case "left":
      return {
        key: "left",
        header: <span title={t("columns.leftTitle")}>{t("columns.left")}</span>,
        align: "right",
        sortable: true,
        cell: (row) => <ShareCell count={row.onward == null ? null : Math.max(0, row.visits - row.onward)} visits={row.visits} fewVisits={row.fewVisits} left />,
      };
    case "onward":
      return { key: "onward", header: <span title={t("columns.onwardTitle")}>{t("columns.onward")}</span>, align: "right", sortable: true, cell: (row) => <ShareCell count={row.onward} visits={row.visits} fewVisits={row.fewVisits} /> };
    case "next":
      return { key: "next", header: <span title={t("columns.nextTitle")}>{t("columns.next")}</span>, className: CUT_COLUMN.second, sortable: true, cell: (row) => <NextPageCell next={row.next} /> };
  }
}

/**
 * Ask Google once for an event's funnel (ga-stored-figures-plan.md SF8), the
 * one figure a screen still asks for: started when the screen first needs
 * it, never again for the same ask. "FAILED" when Google could not answer;
 * the screen keeps what it has.
 */
export function useEventFunnel(ask: { siteId: string; period: string; device: string; country?: string; event: string } | null): "ASKING" | "FAILED" | "IDLE" {
  const t = useTranslations("googleAnalytics.eventScreen");
  const askLive = useAction(api.googleAnalyticsLive.askEventFunnel);
  const { run } = useAdminAction({ scope: "google-analytics-live" });
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const asked = useRef(new Set<string>());
  const key = ask ? JSON.stringify(ask) : null;
  useEffect(() => {
    if (!key || asked.current.has(key)) return;
    asked.current.add(key);
    // The screen says when Google could not answer: a notice, not a toast.
    const asking = async () => {
      const outcome = await run(() => askLive(JSON.parse(key) as Parameters<typeof askLive>[0]), { key, suppressErrorToast: true, fallbackMessage: t("askFailed") });
      if (!outcome.ok || !outcome.data.ok) setFailed((before) => new Set([...before, key]));
    };
    void asking();
  }, [key, askLive, run, t]);
  if (!key) return "IDLE";
  return failed.has(key) ? "FAILED" : "ASKING";
}

/** The whole list, in the order on screen, as CSV: read a part at a time when pressed. */
function AnalyticsDownload({ args, list, csvColumns, kindName, sourceName, leaveOutColumns }: {
  sourceName?: (row: ShownRow) => string;
  leaveOutColumns?: readonly string[];
  args: Record<string, unknown>;
  list: ListKind;
  /** A channel's own landing pages: their own columns, not Landing pages' funnel. */
  csvColumns?: readonly Column[];
  /** A page group's words, the same in the file's "Lands most on" as in the table's. */
  kindName?: (kind: string) => string;
}) {
  const t = useTranslations("googleAnalytics.table");
  const convex = useConvex();
  const { run, isBusy } = useAdminAction({ scope: "google-analytics-download" });
  const columns = (csvColumns ?? CSV_COLUMNS[list]).filter((column) => !leaveOutColumns?.includes(column));
  return (
    <DownloadButton
      label={t("download")}
      busyLabel={t("downloading")}
      busy={isBusy()}
      onClick={async () => {
        const outcome = await run(
          () => readListInParts((part) => convex.query(api.googleAnalyticsReads.analyticsListAll, { ...args, part } as Parameters<typeof convex.query<typeof api.googleAnalyticsReads.analyticsListAll>>[1])),
          { fallbackMessage: t("downloadFailed") },
        );
        if (!outcome.ok) return;
        const headers = columns.map((column) => t(`csv.${column}`));
        const rows = outcome.data.map((row) => columns.map((column) => (column === "cameFrom" && sourceName ? sourceName(row) : csvValue(row, column, kindName))));
        saveTextFile(toCsv(headers, rows), `google-analytics-${list}.csv`);
      }}
    />
  );
}

/** The page group a row lands on most, in the words its table and its download share. */
function landsMostName(lands: NonNullable<ShownRow["landsMost"]>, kindName?: (kind: string) => string): string {
  return lands.name ?? kindName?.(lands.kind) ?? lands.kind;
}

function csvValue(row: ShownRow, column: Column, kindName?: (kind: string) => string): string | number | null {
  switch (column) {
    case "name": return row.label;
    case "visits": return row.visits;
    case "source": return row.source ?? "";
    case "cameFrom": return row.source ?? "";
    case "visitsNow": return row.visits;
    case "visitsBefore": return row.visitsBefore ?? null;
    case "visitsChange": return row.visitsBefore == null ? null : row.visits - row.visitsBefore;
    case "bought": return row.purchases;
    case "views": return row.views;
    case "engaged": return row.engagementRate === null ? null : Math.round(row.engagementRate * 1000) / 10;
    case "bounce": return row.bounceRate === null ? null : Math.round(row.bounceRate * 1000) / 10;
    case "pages": return row.pagesPerVisit === null ? null : Math.round(row.pagesPerVisit * 10) / 10;
    case "people": return row.people;
    case "time": return row.timePerVisit === null ? null : Math.round(row.timePerVisit);
    case "conversions": return row.conversions;
    case "change": return row.change === null ? null : Math.round(row.change * 1000) / 10;
    case "viewsChange": return row.viewsBefore === null ? null : row.views - row.viewsBefore;
    case "rate": return row.conversionRate === null ? null : Math.round(row.conversionRate * 1000) / 10;
    case "conversionsChange": return row.conversionsBefore === null ? null : row.conversions - row.conversionsBefore;
    case "share": return null;
    case "elsewhere": return row.elsewhere ?? null;
    case "started": return row.started ?? null;
    case "landsMost": return row.landsMost ? landsMostName(row.landsMost, kindName) : null;
    case "tick": return null;
    case "left": return row.onward == null ? null : Math.max(0, row.visits - row.onward);
    case "onward": return row.onward ?? null;
    case "next": return row.next ? pathOf(row.next.page) : null;
  }
}
