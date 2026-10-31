"use client";

import { useSeesPart } from "@/src/ui/components/screens/hakkenSeesStore";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAction, useConvex } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useTranslations } from "next-intl";
import { SearchX } from "lucide-react";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { DataTable, type DataTableColumn } from "@/src/ui/components/screens/DataTable";
import { DownloadButton, saveTextFile } from "@/src/ui/components/screens/DownloadButton";
import { Notice } from "@/src/ui/components/screens/Notice";
import { TableBar, type TableNoun } from "@/src/ui/components/screens/TableBar";
import { toCsv } from "../../sites/_components/siteFormat";
import { useSiteListPage } from "../../sites/_components/useSitePagedTable";
import { TABLE_PAGE_KEY, useSetSiteParams, useSiteSearch } from "../../sites/_components/useSiteParam";
import { useSiteSort } from "../../sites/_components/useSiteSort";
import { CUT_COLUMN } from "../../sites/_components/SiteCells";
import { ChangeCell, ConversionsCell, ConversionsChangeCell, ConversionsHereCell, FigureCell, MoneyCell, NextPageCell, PageLink, RateCell, ShareCell, TextFigure, ViewsChangeCell } from "./AnalyticsCells";
import { formatPercent, formatPerVisit, formatTime, pathOf } from "./analyticsFormat";
import { MOST_PLOTTED, MOVE_VIEWS, type PageMove } from "@/convex/utils/pageMoves";
import { NO_PAGE_KIND } from "@/convex/utils/sees/analyticsChannel";
import { AI_ASSISTANTS_CHANNEL } from "@/convex/utils/aiAssistants";
import { useAnalyticsArgs, useAnalyticsSiteId, useAnalyticsStatus, useDevice, usePeriod, periodWord } from "./useAnalytics";
import { AnalyticsGate } from "./AnalyticsNotices";
import { DetailHeader, PageHeader } from "@/src/ui/components/screens/PageHeader";

export type ListPageAnswer = FunctionReturnType<typeof api.googleAnalyticsReads.analyticsListPage>;
export type ShownRow = ListPageAnswer["rows"][number];
export type ListKind = "channel" | "source" | "landing" | "groups" | "page" | "campaign" | "adKeyword" | VisitorList;
/** Visitors' lists (§18.2 board 15). */
export type VisitorList = "visitorType" | "browser" | "system" | "age" | "gender" | "interest";
type Column = "tick" | "name" | "source" | "share" | "elsewhere" | "started" | "landsMost" | "visits" | "engaged" | "bounce" | "pages" | "people" | "time" | "views" | "viewsChange" | "conversions" | "rate" | "conversionsChange" | "value" | "change" | "left" | "onward" | "next";

/** Visitors' columns, each group with the classification it lands on most (ga-conversions-visitors-plan.md CV7). */
const VISITOR_COLUMNS: readonly Column[] = ["name", "people", "visits", "engaged", "conversions", "change", "landsMost"];

/**
 * Each list's columns, as drawn (§11, §15; the second round, §18.2 boards 18
 * and 20): every table fits the page at 1440 and 1366 pixels. Landing pages
 * shows bounce rate and pages a visit, leaving value to Conversions and each
 * page's own screen (GA26). All pages (all-pages-rethink-plan.md AP4) has no
 * money: a tick box to draw the page on its chart, its visits and views, the
 * views against the span before, dwell time, the conversions made there with
 * their rate, and those against the span before.
 */
const COLUMNS: Record<ListKind, readonly Column[]> = {
  // Channels (ga-channel-pages-plan.md CH9): dwell time, the conversions each started, and the page group most of its visits land on.
  channel: ["name", "visits", "time", "conversions", "started", "change", "landsMost"],
  source: ["name", "visits", "engaged", "conversions", "value", "change"],
  // Each landing page's own funnel (landing-pages-flow-plan.md LF4): what its visits did next, no advice.
  landing: ["name", "visits", "left", "onward", "next", "conversions"],
  groups: ["name", "visits", "left", "onward", "next", "conversions"],
  page: ["tick", "name", "visits", "views", "viewsChange", "time", "conversions", "rate", "conversionsChange"],
  // Campaigns (§18.2 board 17): each campaign with where its link was, and the words tagged links carry.
  campaign: ["name", "source", "visits", "engaged", "conversions", "value", "change"],
  adKeyword: ["name", "visits", "engaged", "conversions", "value", "change"],
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
const CHANNEL_LANDING_CSV: readonly Column[] = ["name", "visits", "engaged", "bounce", "pages", "time", "conversions", "value", "change"];

/** AI assistants' own page (CH8): each assistant's visits Google filed outside its AI Assistant channel beside its visits. */
const ASSISTANT_COLUMNS: readonly Column[] = ["name", "visits", "elsewhere", "engaged", "conversions", "value", "change"];

/** Each list's download: its columns, with the value — and on the page lists engagement too — as columns of their own. */
const CSV_COLUMNS: Record<ListKind, readonly Column[]> = {
  ...COLUMNS,
  landing: ["name", "visits", "left", "onward", "next", "engaged", "bounce", "pages", "time", "conversions", "value", "change"],
  groups: ["name", "visits", "left", "onward", "next", "engaged", "bounce", "pages", "time", "conversions", "value", "change"],
  // All pages' download keeps people and leaves out money (AP1, AP4).
  page: ["name", "visits", "views", "viewsChange", "people", "time", "conversions", "rate", "conversionsChange"],
};

/** The lists whose conversion rate sits beside the count on one line ("4 · 2.8%"), as Landing pages are drawn (§15). */
const ONE_LINE: ReadonlySet<ListKind> = new Set(["landing", "groups"]);

/** Which way each heading's first press runs: the most first, names A to Z. */
const FIRSTS = {
  share: "desc",
  elsewhere: "desc",
  started: "desc",
  name: "asc", visits: "desc", engaged: "desc", bounce: "asc", pages: "desc", people: "desc", time: "desc", views: "desc", conversions: "desc", value: "desc", change: "desc",
  viewsChange: "desc", rate: "desc", conversionsChange: "desc",
  // Landing pages' funnel (LF4): the fewest leaving first, the most going on first, the strongest next step first.
  left: "asc", onward: "desc", next: "desc",
} as const;

/** The pages drawn on All pages' chart, in the address (`plot`): none ticked yet reads as the five at the top of the table. */
const PLOT_KEY = "plot";
/** Every tick taken off: nothing drawn but the website. */
const NOTHING_PLOTTED = "-";

/** The ticked pages, by their page numbers, and the tick that changes them; the table stays on its page. */
function usePlotted(rows: readonly ShownRow[], on: boolean): { keys: string[]; tick: (key: string, next: boolean) => void } | null {
  const params = useSearchParams();
  const set = useSetSiteParams();
  if (!on) return null;
  const raw = params.get(PLOT_KEY);
  const keys = raw === null
    ? rows.filter((row) => row.key.startsWith("~") && row.views > 0).slice(0, MOST_PLOTTED).map((row) => row.key)
    : raw.split(",").filter((key) => key.startsWith("~")).slice(0, MOST_PLOTTED);
  const tick = (key: string, next: boolean) => {
    const now = next ? [...keys.filter((one) => one !== key), key] : keys.filter((one) => one !== key);
    set({ [PLOT_KEY]: now.length > 0 ? now.join(",") : NOTHING_PLOTTED, [TABLE_PAGE_KEY]: params.get(TABLE_PAGE_KEY) });
  };
  return { keys, tick };
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

export type ChannelTable = {
  /** The channel's visits in these dates, for each classification's share. */
  visits: number;
  /** A page group's words, from its id or code (`useKindName`). */
  kindName: (kind: string) => string;
};

export function AnalyticsTable({ list, channel, filed, kindName, group, move, plot = false, noun, searchPlaceholder, rowHref, filters, opening = "value", emptyLabel, head, nameOf, ofChannel, seesPart }: {
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
  head?: (answer: ListPageAnswer | undefined, plotted: readonly string[]) => ReactNode;
  /** All pages' filter (AP5): the pages that gained, dropped, stayed static or had no visits. */
  move?: PageMove | "all";
  /** All pages: a tick box on each page to draw it on the chart above (AP3). */
  plot?: boolean;
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
  useSeesPart(seesPart, shown.result);
  const currency = status?.connection?.currency ?? null;
  const plotted = usePlotted(shown.pageRows ?? [], plot && list === "page");
  const assistants = list === "source" && channel === AI_ASSISTANTS_CHANNEL;
  const columns = (ofChannel && list === "groups" ? CHANNEL_GROUP_COLUMNS : ofChannel && list === "landing" ? CHANNEL_LANDING_COLUMNS : assistants ? ASSISTANT_COLUMNS : COLUMNS[list])
    .filter((column) => column !== "tick" || plotted !== null)
    .map((column) => columnOf(column, list, currency, rowHref, t, nameOf, plotted, ofChannel, assistants, kindName ?? ofChannel?.kindName));
  // Campaigns say the visits from no tagged link beside the list (§18.2 board 17).
  const untagged = shown.result?.untagged ?? null;
  const bar = [
    tf(`periods.${periodWord(period)}`), tf(`devices.${device}`).toLowerCase(),
    ...(list === "page" && !live ? [t("moveRule", { views: MOVE_VIEWS })] : []),
    live ? t("collecting") : untagged !== null ? t("untagged", { count: untagged }) : t("greyed"),
  ].join(" · ");

  return (
    <div className="flex flex-col gap-4">
      {head ? head(paged.result, plotted?.keys ?? []) : null}
      {live ? (
        <Notice>
          <span className="block font-medium text-foreground">{t("collectingTitle", { device: tf(`devices.${device}`).toLowerCase() })}</span>
          <span className="block">{t(campaigns ? "collectingBodyCampaigns" : "collectingBody", { device: tf(`devices.${device}`).toLowerCase(), platformName })}</span>
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
        filters={typeof filters === "function" ? filters(paged.result) : filters}
        cardHeader={
          <TableBar
            footer={shown.footer}
            noun={noun}
            actions={<AnalyticsDownload args={base} list={list} currency={currency} csvColumns={ofChannel && list === "landing" ? CHANNEL_LANDING_CSV : undefined} />}
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
  nameOf?: (row: ShownRow) => string,
  plotted?: { keys: string[]; tick: (key: string, next: boolean) => void } | null,
  ofChannel?: ChannelTable,
  /** AI assistants' own page: its sources are assistants. */
  assistants = false,
  kindName?: (kind: string) => string,
): DataTableColumn<ShownRow> {
  switch (column) {
    case "tick":
      return {
        key: "tick",
        header: "",
        hiddenHeader: t("tickColumn"),
        className: "w-11",
        cell: (row) => {
          // A page with views can be drawn; a page nobody viewed in these dates has nothing to draw.
          if (!plotted || !row.key.startsWith("~") || row.views === 0) return null;
          const checked = plotted.keys.includes(row.key);
          const reason = !checked && plotted.keys.length >= MOST_PLOTTED ? t("tickLimit") : undefined;
          return (
            // The tick is the row's own control: its click must not open the row.
            <span className="flex" title={reason} onClick={(event) => event.stopPropagation()}>
              <Checkbox
                label={t("tick", { page: pathOf(row.label) })}
                labelHidden
                checked={checked}
                disabled={Boolean(reason)}
                title={reason}
                onChange={(next) => plotted.tick(row.key, next)}
              />
            </span>
          );
        },
      };
    case "name":
      return {
        key: "name",
        header: t(`columns.${list === "groups" ? (ofChannel ? "classification" : "group") : list === "landing" ? "page" : assistants ? "assistant" : list}`),
        sortable: true,
        // A page's title and address cut to a line each in their share of the table, as Sites' words are (CUT_COLUMN).
        ...(list === "landing" || list === "page" ? { className: CUT_COLUMN.first } : {}),
        cell: (row) => list === "landing" && ofChannel && row.kind === NO_PAGE_KIND
          // The visits Google put to no page: said so, never a link (ga-channel-pages-plan.md CH7).
          ? <PageLink address={row.label} href={null} title={ofChannel.kindName(NO_PAGE_KIND)} kind={t("noPageLost")} />
          : list === "landing" || list === "page"
          ? <PageLink address={row.label} href={rowHref ? rowHref(row) : null} title={row.title} kind={ofChannel && row.kind ? ofChannel.kindName(row.kind) : undefined} />
          : list === "groups"
            ? (
              <span className="flex flex-col leading-tight">
                <span className="text-[13px] text-foreground">{ofChannel ? ofChannel.kindName(row.key) : row.label === "NOT_SORTED" ? t("notSorted") : row.label}</span>
                <span className="text-[11.5px] text-muted">{t("pagesCount", { count: row.members ?? 0 })}</span>
              </span>
            )
            : <span className="text-[13px] text-foreground">{nameOf ? nameOf(row) : row.label === "" ? t("noSource") : row.label}</span>,
      };
    case "source":
      return { key: "source", header: t("columns.source"), cell: (row) => <span className="text-[12px] text-secondary">{row.source ?? ""}</span> };
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
            <span className="text-foreground">{row.landsMost.name ?? kindName?.(row.landsMost.kind) ?? row.landsMost.kind}</span>
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
      return { key: "viewsChange", header: <span title={t("columns.viewsChangeTitle")}>{t("columns.viewsChange")}</span>, align: "right", sortable: true, cell: (row) => <ViewsChangeCell views={row.views} before={row.viewsBefore} /> };
    case "rate":
      return { key: "rate", header: <span title={t("columns.rateTitle")}>{t("columns.rate")}</span>, align: "right", sortable: true, cell: (row) => <RateCell rate={row.conversionRate} fewVisits={row.fewVisits} /> };
    case "conversionsChange":
      return { key: "conversionsChange", header: <span title={t("columns.conversionsChangeTitle")}>{t("columns.conversionsChange")}</span>, align: "right", sortable: true, cell: (row) => <ConversionsChangeCell conversions={row.conversions} before={row.conversionsBefore} /> };
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
      return { key: "time", header: <span title={t("columns.timeTitle")}>{t(list === "page" || list === "channel" ? "columns.dwell" : "columns.time")}</span>, align: "right", sortable: true, cell: (row) => <TextFigure text={formatTime(row.timePerVisit)} /> };
    case "conversions":
      return {
        key: "conversions",
        // A page's own conversions, or those of the visits that started on it, never both called "Conversions" (analytics-page-screen-plan.md PS1).
        header: list === "page" ? <span title={t("columns.conversionsShortTitle")}>{t("columns.conversionsShort")}</span>
          : list === "landing" || list === "groups" ? <span title={t("columns.conversionsStartedTitle")}>{t("columns.conversionsStarted")}</span>
            : t("columns.conversions"),
        align: "right",
        sortable: true,
        cell: (row) => list === "page"
          // No money on All pages (AP1): the count alone.
          ? <ConversionsHereCell conversions={row.conversions} value={0} currency={currency} />
          : <ConversionsCell conversions={row.conversions} rate={row.conversionRate} fewVisits={row.fewVisits} oneLine={ONE_LINE.has(list)} />,
      };
    case "value":
      return { key: "value", header: t("columns.value"), align: "right", sortable: true, cell: (row) => <MoneyCell value={row.value} currency={currency} /> };
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

/** The whole list, in the order on screen, as CSV: read when pressed. */
function AnalyticsDownload({ args, list, currency, csvColumns }: {
  args: Record<string, unknown>;
  list: ListKind;
  currency: string | null;
  /** A channel's own landing pages: their own columns, not Landing pages' funnel. */
  csvColumns?: readonly Column[];
}) {
  const t = useTranslations("googleAnalytics.table");
  const convex = useConvex();
  const { run, isBusy } = useAdminAction({ scope: "google-analytics-download" });
  const columns = csvColumns ?? CSV_COLUMNS[list];
  return (
    <DownloadButton
      label={t("download")}
      busyLabel={t("downloading")}
      busy={isBusy()}
      onClick={async () => {
        const outcome = await run(
          () => convex.query(api.googleAnalyticsReads.analyticsListAll, args as Parameters<typeof convex.query<typeof api.googleAnalyticsReads.analyticsListAll>>[1]),
          { fallbackMessage: t("downloadFailed") },
        );
        if (!outcome.ok) return;
        const headers = columns.map((column) => t(`csv.${column}`, { currency: currency ?? "" }));
        const rows = outcome.data.rows.map((row) => columns.map((column) => csvValue(row, column)));
        saveTextFile(toCsv(headers, rows), `google-analytics-${list}.csv`);
      }}
    />
  );
}

function csvValue(row: ShownRow, column: Column): string | number | null {
  switch (column) {
    case "name": return row.label;
    case "visits": return row.visits;
    case "source": return row.source ?? "";
    case "views": return row.views;
    case "engaged": return row.engagementRate === null ? null : Math.round(row.engagementRate * 1000) / 10;
    case "bounce": return row.bounceRate === null ? null : Math.round(row.bounceRate * 1000) / 10;
    case "pages": return row.pagesPerVisit === null ? null : Math.round(row.pagesPerVisit * 10) / 10;
    case "people": return row.people;
    case "time": return row.timePerVisit === null ? null : Math.round(row.timePerVisit);
    case "conversions": return row.conversions;
    case "value": return row.value / 100;
    case "change": return row.change === null ? null : Math.round(row.change * 1000) / 10;
    case "viewsChange": return row.viewsBefore === null ? null : row.views - row.viewsBefore;
    case "rate": return row.conversionRate === null ? null : Math.round(row.conversionRate * 1000) / 10;
    case "conversionsChange": return row.conversionsBefore === null ? null : row.conversions - row.conversionsBefore;
    case "share": return null;
    case "elsewhere": return row.elsewhere ?? null;
    case "started": return row.started ?? null;
    case "landsMost": return row.landsMost ? row.landsMost.name ?? row.landsMost.kind : null;
    case "tick": return null;
    case "left": return row.onward == null ? null : Math.max(0, row.visits - row.onward);
    case "onward": return row.onward ?? null;
    case "next": return row.next ? pathOf(row.next.page) : null;
  }
}
