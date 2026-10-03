"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { BANDS, figuresOf, filterRows, type Band, type Filters } from "@/convex/utils/searchConsoleViews";
import { PAGE_TYPES, RANK_INTENTS } from "@/convex/utils/siteShapes";
import { useToast } from "@/src/context/ToastContext";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { Change } from "@/src/ui/components/screens/Change";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { DownloadButton, saveTextFile } from "@/src/ui/components/screens/DownloadButton";
import type { DataTableColumn } from "@/src/ui/components/screens/DataTable";
import { Select } from "@/src/ui/components/screens/Select";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { formatNumber } from "../../sites/_components/siteFormat";
import { useSiteListPage, useSitePager } from "../../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../sites/_components/useSiteParam";
import { useSiteSort, useSiteSortedList, type SiteSortColumns } from "../../sites/_components/useSiteSort";
import { DaysBeforeChange } from "./SearchConsoleFigures";
import { formatPosition, formatRate } from "./searchConsoleFormat";
import { useLiveAsk } from "./searchConsoleRecords";
import {
  countryArg,
  isReadyMade,
  useResultKind,
  useSearchConsoleCountry,
  useSearchConsoleRange,
  useSearchConsoleSiteId,
  useSearchConsoleStatus,
} from "./useSearchConsole";

/**
 * What every Search Console table shares (search-console-plan.md §13.1,
 * "Tables exactly as Sites'"): a list read a page at a time on the server —
 * searched, filtered and ordered over the whole of it by the heading pressed,
 * the best first — from the ready-made periods, all countries' or the
 * country chosen's when the website keeps it ready; asked of Google instead
 * for other dates, any other country, or one device, and paged here by the
 * same rules (`convex/utils/searchConsoleViews.ts`). Filters are chips on the
 * search row, as on Sites — the country is the page's own choice, beside the
 * dates (search-console-plan.md §16), never a chip; a Track tick first in
 * every keyword and page table, held to the website's limits; its download.
 */

export type ListRow = FunctionReturnType<typeof api.searchConsoleLists.searchConsoleListPage>["rows"][number];
type View = NonNullable<FunctionArgs<typeof api.searchConsoleLists.searchConsoleListPage>["view"]>;

/** Each heading's first press: the best first — a top position, a name A to Z, any other figure the most. */
const FIRSTS = {
  key: "asc", clicks: "desc", change: "desc", impressions: "desc", ctr: "desc", position: "asc", positionChange: "desc", share: "desc",
  count: "desc", top: "asc", volume: "desc", estimate: "desc", kind: "asc", brand: "asc", usualCtr: "desc", expected: "desc",
  topShare: "desc", next: "asc", nextShare: "desc", gap: "desc",
} as const;
export type SortKey = keyof typeof FIRSTS;

const LIVE_SORTS: SiteSortColumns<ListRow, SortKey> = {
  key: { value: (row) => row.key, first: "asc" },
  clicks: { value: (row) => row.clicks, first: "desc" },
  change: { value: (row) => row.change, first: "desc" },
  impressions: { value: (row) => row.impressions, first: "desc" },
  ctr: { value: (row) => row.ctr, first: "desc" },
  // A row Google did not show has no position: a blank, last, as the server orders it.
  position: { value: (row) => (row.impressions > 0 ? row.position : null), first: "asc" },
  positionChange: { value: (row) => row.positionChange, first: "desc" },
  share: { value: (row) => row.share, first: "desc" },
  count: { value: (row) => row.count, first: "desc" },
  top: { value: (row) => row.top, first: "asc" },
  volume: { value: (row) => row.volume, first: "desc" },
  estimate: { value: (row) => row.estimate, first: "desc" },
  kind: { value: (row) => row.kind, first: "asc" },
  brand: { value: (row) => (row.brand === null ? null : row.brand ? 0 : 1), first: "asc" },
  usualCtr: { value: (row) => row.usualCtr, first: "desc" },
  expected: { value: (row) => row.expected, first: "desc" },
  topShare: { value: (row) => row.topShare, first: "desc" },
  next: { value: (row) => row.next, first: "asc" },
  nextShare: { value: (row) => row.nextShare, first: "desc" },
  gap: { value: (row) => row.gap, first: "desc" },
};
const keyOf = (row: ListRow) => row.key;

/** The filter chips a table can show, each kept in the address under its own key. The country is the page's, not a chip (§16). */
export type ChipId = "tracked" | "band" | "almostBand" | "intent" | "pageType" | "brand" | "move" | "verdict" | "missed" | "device";

const DEVICES = ["DESKTOP", "MOBILE", "TABLET"] as const;
/** Every intent and page type a Kind chip can hold: anything else in the address is ignored. */
const KINDS: readonly string[] = ["", ...new Set<string>([...RANK_INTENTS, ...PAGE_TYPES])];
const ALMOST_BANDS: readonly Band[] = ["4-10", "11-20"];

/** The filters chosen, read from the address: only those of the chips the table shows. */
function useChosen(chips: readonly ChipId[]) {
  const has = (chip: ChipId) => chips.includes(chip);
  const [tracked] = useSiteParam<"" | "yes" | "no">("tracked", "", ["", "yes", "no"]);
  const [band] = useSiteParam<"" | Band>("band", "", ["", ...BANDS]);
  const [kind] = useSiteParam<string>("kind", "", KINDS);
  const [brand] = useSiteParam<"" | "yes" | "no">("brand", "", ["", "yes", "no"]);
  const [move] = useSiteParam<"" | "win" | "loss">("move", "", ["", "win", "loss"]);
  const [verdict] = useSiteParam<"" | "high" | "low" | "close">("verdict", "", ["", "high", "low", "close"]);
  const [missed] = useSiteParam<"searched" | "untracked">("list", "searched", ["searched", "untracked"]);
  const [device] = useSiteParam<string>("device", "", ["", ...DEVICES]);
  const filters: Filters & { missed?: "searched" | "untracked" } = {
    ...(has("tracked") && tracked ? { tracked } : {}),
    ...((has("band") || has("almostBand")) && band ? { band } : {}),
    ...((has("intent") || has("pageType")) && kind ? { kind } : {}),
    ...(has("brand") && brand ? { brand } : {}),
    ...(has("move") && move ? { move } : {}),
    ...(has("verdict") && verdict ? { verdict } : {}),
    ...(has("missed") ? { missed } : {}),
  };
  return { filters, device: has("device") ? device : "" };
}

/**
 * A Search Console list for the page on screen: `dimension` keywords or
 * pages, a page's own rule (`view`), or one keyword's pages and one page's
 * keywords (`within`) — in the country chosen for the page.
 */
export function useSearchConsoleList(options: {
  dimension: "query" | "page";
  view?: View;
  within?: { kind: "query" | "page"; key: string } | null;
  opening?: SortKey;
  chips: readonly ChipId[];
}) {
  const siteId = useSearchConsoleSiteId();
  const status = useSearchConsoleStatus();
  const [kind] = useResultKind();
  const range = useSearchConsoleRange(status?.connection?.newestDay);
  const [search, setSearch, term] = useSiteSearch();
  const opening = options.opening ?? "clicks";
  const order = useSiteSort<SortKey>(FIRSTS, opening);
  const [country] = useSearchConsoleCountry();
  const { filters, device } = useChosen(options.chips);
  const held = Boolean(status?.connection?.newestDay);
  const within = options.within ?? undefined;
  const base = {
    siteId,
    searchType: kind,
    dimension: options.dimension,
    ...(options.view ? { view: options.view } : {}),
    ...(within ? { within } : {}),
    from: range.from,
    to: range.to,
    ...countryArg(country),
  };
  // Other dates, or one device, are asked of Google: the periods are kept for the whole website and each country kept ready.
  // One keyword's pages, one page's keywords and Pages competing read a period's pairs: past 30 days, Google is asked.
  const readsPairs = Boolean(within) || options.view === "competing";
  const asksGoogle = Boolean(device) || !isReadyMade(range, status?.connection?.newestDay) || (readsPairs && range.days > 30);
  const ready = held && (within === undefined || Boolean(within.key));
  // A country the website does not keep ready — or keeps, before its first collection — the server answers `live`.
  // That answer is held for these dates and this country, so a search, a filter or an order, worked out here from
  // Google's answer, never asks the server, or Google, again.
  const baseKey = JSON.stringify(base);
  const [liveFor, setLiveFor] = useState<string | null>(null);
  const toldLive = liveFor === baseKey;
  const server = useSiteListPage(
    api.searchConsoleLists.searchConsoleListPage,
    ready && !asksGoogle && !toldLive ? { ...base, ...filters, ...(term ? { q: term } : {}), sort: order.key, direction: order.direction } : "skip",
  );
  if (server.result?.live && !toldLive) setLiveFor(baseKey);
  const isLive = asksGoogle || toldLive || server.result?.live === true;
  const live = useLiveAsk(
    api.searchConsoleLists.searchConsoleLiveList,
    isLive && ready ? { ...base, ...(filters.missed ? { missed: filters.missed } : {}), ...(device ? { device } : {}) } : null,
  );
  // Google's answer is asked once; what the company tracks follows every tick.
  const trackedNow = useQuery(api.searchConsoleTracking.searchConsoleTrackedKeys, isLive && ready ? { siteId, kind: within ? (within.kind === "query" ? "page" : "query") : options.dimension } : "skip");
  const ticked = trackedNow ? new Set(trackedNow) : null;
  const answered = live.answer?.ok ? live.answer.rows.flat().map((row) => (ticked ? { ...row, tracked: ticked.has(row.key) } : row)) : null;
  // A tracked list: a row unticked leaves it at once, and its figures with it.
  const tracksOnly = options.view === "tracked";
  const listedLive = answered && tracksOnly ? answered.filter((row) => row.tracked) : answered;
  const liveRows = live.answer === undefined ? undefined : listedLive ? filterRows(listedLive, { ...filters, q: term }) : [];
  const liveOrder = useSiteSortedList(liveRows, LIVE_SORTS, { opening, name: keyOf });
  const livePages = useSitePager(liveOrder.rows, { isLoading: liveRows === undefined, cut: live.answer?.ok ? live.answer.cut : null });
  const table = isLive
    ? {
      pageRows: livePages.pageRows,
      footer: livePages.footer,
      named: live.answer?.ok ? live.answer.named : null,
      comparable: live.answer?.ok ? live.answer.comparable : false,
      problem: live.answer && !live.answer.ok ? live.answer.problem : null,
    }
    : {
      pageRows: server.pageRows,
      footer: server.footer,
      named: server.result?.named ?? null,
      comparable: server.result?.comparable ?? false,
      problem: null,
    };
  const filtered = Boolean(term) || Object.keys(filters).some((key) => key !== "missed") || Boolean(device);
  const liveSummary = live.answer?.ok
    ? (tracksOnly && listedLive ? { ...live.answer.summary, ...figuresOf(listedLive, live.answer.comparable) } : live.answer.summary)
    : null;
  const summary = isLive ? liveSummary : (server.result?.summary ?? null);
  return {
    summary,
    siteId,
    status,
    kind,
    range,
    search,
    setSearch,
    term,
    order,
    table,
    filtered,
    preparing: server.preparing,
    live: isLive,
    retry: live.retry,
    download: { ...base, ...filters, ...(term ? { q: term } : {}), sort: order.key, direction: order.direction },
  };
}

export type ListSummary = NonNullable<FunctionReturnType<typeof api.searchConsoleLists.searchConsoleListPage>["summary"]>;

/**
 * The hero boxes' figures for a list other than the one on screen (Missed
 * demand's two lists, Types): read from the ready-made period — all
 * countries', or the country chosen's when the website keeps it ready — or
 * asked of Google for other dates and any other country.
 */
export function useSearchConsoleSummary(ask: { dimension: "query" | "page"; view?: View; missed?: "searched" | "untracked" }): ListSummary | null {
  const siteId = useSearchConsoleSiteId();
  const status = useSearchConsoleStatus();
  const [kind] = useResultKind();
  const [country] = useSearchConsoleCountry();
  const range = useSearchConsoleRange(status?.connection?.newestDay);
  const base = { siteId, searchType: kind, from: range.from, to: range.to, ...ask, ...countryArg(country) };
  const held = Boolean(status?.connection?.newestDay);
  const readyMade = isReadyMade(range, status?.connection?.newestDay);
  const server = useQuery(api.searchConsoleLists.searchConsoleListPage, held && readyMade ? { ...base, page: 1, rows: 25 } : "skip");
  const asksGoogle = !readyMade || server?.live === true;
  const live = useLiveAsk(api.searchConsoleLists.searchConsoleLiveList, held && asksGoogle ? base : null);
  if (asksGoogle) return live.answer?.ok ? live.answer.summary : null;
  return server?.summary ?? null;
}

/** A count against the same days before, as a hero box's line under it. `neutral` for a count whose rise is not good news. */
export function CountChange({ now, before, days, neutral = false }: { now: number | null; before: number | null; days: number; neutral?: boolean }) {
  return <DaysBeforeChange by={now === null || before === null ? null : now - before} days={days} neutral={neutral} write={formatNumber} />;
}

/** How many keywords and pages the company tracks on the website, against its limits. */
export function useSearchConsoleTracking(siteId: Id<"companyWebsites">) {
  const counts = useQuery(api.searchConsoleTracking.searchConsoleTracking, { siteId });
  const track = useMutation(api.searchConsoleTracking.trackSearchConsoleItem);
  const action = useAdminAction({ scope: "search-console-track" });
  const t = useTranslations("searchConsole.track");
  return {
    counts: counts ?? null,
    change: (kind: "query" | "page", key: string, next: boolean) =>
      void action.run(() => track({ siteId, kind, key, track: next }), { key: `${kind}:${key}`, fallbackMessage: t("failed") }),
    busy: (kind: "query" | "page", key: string) => action.isBusy(`${kind}:${key}`),
  };
}

export type Tracking = ReturnType<typeof useSearchConsoleTracking>;

/** The Track column: a tick to add a keyword or page to the website's tracked list, untick to take it off. */
export function trackColumn<Row extends { key: string; tracked: boolean }>(
  /** The caller's own wording, in its "searchConsole" namespace. */
  say: (key: string, values?: Record<string, string | number>) => string,
  tracking: Tracking,
  kind: "query" | "page",
  label: (row: Row) => string,
): DataTableColumn<Row> {
  const counts = tracking.counts ? (kind === "query" ? tracking.counts.keywords : tracking.counts.pages) : null;
  const full = counts !== null && counts.count >= counts.limit;
  return {
    key: "track",
    header: say("track.column"),
    className: "w-[72px]",
    cell: (row) => {
      const name = label(row);
      // Full: an empty box cannot be ticked, and says why.
      const reason = !row.tracked && full && counts ? say("track.full", { limit: formatNumber(counts.limit), name }) : undefined;
      return (
        // The tick is the row's own control: its click must not open the row.
        <span className="flex" title={reason} onClick={(event) => event.stopPropagation()}>
          <Checkbox
            label={row.tracked ? say("track.untrackLabel", { name }) : say("track.trackLabel", { name })}
            labelHidden
            checked={row.tracked}
            disabled={Boolean(reason) || tracking.busy(kind, row.key)}
            title={reason}
            onChange={(next) => tracking.change(kind, row.key, next)}
          />
        </span>
      );
    },
  };
}

/** "6 of 100 tracked" beside a table's count. */
export function TrackedCount({ tracking, kind, wording = "count" }: {
  tracking: Tracking;
  kind: "query" | "page";
  /** On a record's screen the count says it is the whole website's. */
  wording?: "count" | "keywordsOnSite" | "pagesOnSite";
}) {
  const t = useTranslations("searchConsole.track");
  const counts = tracking.counts ? (kind === "query" ? tracking.counts.keywords : tracking.counts.pages) : null;
  if (!counts) return null;
  return <span className="text-[12px] text-foreground">· {t(wording, { count: formatNumber(counts.count), limit: formatNumber(counts.limit) })}</span>;
}

/** The filter chips on a table's search row, each a Sites chip kept in the address. */
export function SearchConsoleChips({ chips }: { chips: readonly ChipId[] }) {
  const t = useTranslations("searchConsole.filters");
  const tc = useTranslations("sites.common");
  const tp = useTranslations("searchConsole.places");
  const [tracked, setTracked] = useSiteParam<string>("tracked", "", ["", "yes", "no"]);
  const [band, setBand] = useSiteParam<string>("band", "", ["", ...BANDS]);
  const [kind, setKind] = useSiteParam<string>("kind", "", KINDS);
  const [brand, setBrand] = useSiteParam<string>("brand", "", ["", "yes", "no"]);
  const [move, setMove] = useSiteParam<string>("move", "", ["", "win", "loss"]);
  const [verdict, setVerdict] = useSiteParam<string>("verdict", "", ["", "high", "low", "close"]);
  const [missed, setMissed] = useSiteParam<string>("list", "searched", ["searched", "untracked"]);
  const [device, setDevice] = useSiteParam<string>("device", "", ["", ...DEVICES]);
  const bandWord = (value: string) => t(`bands.${value}`);
  return (
    <>
      {chips.map((chip) => {
        switch (chip) {
          case "tracked":
            return (
              <Select key={chip} chip={{ label: t("tracked"), choice: tracked ? t(tracked === "yes" ? "onlyTracked" : "onlyUntracked") : null }} value={tracked} onChange={setTracked}>
                <option value="">{t("anyTracked")}</option>
                <option value="yes">{t("onlyTracked")}</option>
                <option value="no">{t("onlyUntracked")}</option>
              </Select>
            );
          case "band":
          case "almostBand": {
            const bands = chip === "band" ? BANDS : ALMOST_BANDS;
            return (
              <Select key={chip} chip={{ label: t("position"), choice: band && bands.includes(band as Band) ? bandWord(band) : null }} value={band} onChange={setBand}>
                <option value="">{t(chip === "band" ? "anyPosition" : "almostAny")}</option>
                {bands.map((entry) => <option key={entry} value={entry}>{bandWord(entry)}</option>)}
              </Select>
            );
          }
          case "intent":
            return (
              <Select key={chip} chip={{ label: tc("intentFilter"), choice: kind ? tc(`intents.${kind}`) : null }} value={kind} onChange={setKind}>
                <option value="">{tc("anyIntent")}</option>
                {RANK_INTENTS.map((entry) => <option key={entry} value={entry}>{tc(`intents.${entry}`)}</option>)}
              </Select>
            );
          case "pageType":
            return (
              <Select key={chip} chip={{ label: t("pageType"), choice: kind ? tc(`pageTypes.${kind}`) : null }} value={kind} onChange={setKind}>
                <option value="">{t("anyPageType")}</option>
                {PAGE_TYPES.map((entry) => <option key={entry} value={entry}>{tc(`pageTypes.${entry}`)}</option>)}
              </Select>
            );
          case "brand":
            return (
              <Select key={chip} chip={{ label: t("brand"), choice: brand ? t(brand === "yes" ? "brandYes" : "brandNo") : null }} value={brand} onChange={setBrand}>
                <option value="">{t("anyBrand")}</option>
                <option value="yes">{t("brandYes")}</option>
                <option value="no">{t("brandNo")}</option>
              </Select>
            );
          case "move":
            return (
              <Select key={chip} chip={{ label: t("move"), choice: move ? t(move === "win" ? "wins" : "losses") : null }} value={move} onChange={setMove}>
                <option value="">{t("anyMove")}</option>
                <option value="win">{t("wins")}</option>
                <option value="loss">{t("losses")}</option>
              </Select>
            );
          case "verdict":
            return (
              <Select key={chip} chip={{ label: t("verdict"), choice: verdict ? t(`verdicts.${verdict}`) : null }} value={verdict} onChange={setVerdict}>
                <option value="">{t("anyVerdict")}</option>
                {(["high", "low", "close"] as const).map((entry) => <option key={entry} value={entry}>{t(`verdicts.${entry}`)}</option>)}
              </Select>
            );
          case "missed":
            return (
              <Select key={chip} chip={{ label: t("missed"), choice: t(missed === "untracked" ? "missedUntracked" : "missedSearched") }} value={missed} onChange={setMissed}>
                <option value="searched">{t("missedSearched")}</option>
                <option value="untracked">{t("missedUntracked")}</option>
              </Select>
            );
          case "device":
            return (
              <Select key={chip} chip={{ label: t("device"), choice: device ? tp(`deviceNames.${device}`) : null }} value={device} onChange={setDevice}>
                <option value="">{t("anyDevice")}</option>
                {DEVICES.map((entry) => <option key={entry} value={entry}>{tp(`deviceNames.${entry}`)}</option>)}
              </Select>
            );
          default:
            return null;
        }
      })}
    </>
  );
}

/** A figure before and now, as "31 → 43"; "…" for a now still to come. */
export function BeforeAfter({ before, now, format }: { before: number | null; now: number | null; format: (value: number) => string }) {
  return (
    <span className="whitespace-nowrap font-mono text-[12px]">
      <span className="text-secondary">{before === null ? "–" : format(before)}</span>
      <span className="text-muted"> → </span>
      <span className="text-foreground">{now === null ? "…" : format(now)}</span>
    </span>
  );
}

type Figure = "clicks" | "change" | "impressions" | "ctr" | "position" | "moved";

/**
 * The figure columns most tables share, right-aligned and sortable: with
 * `change`, the clicks gained or lost on the days before ("New" for a row not
 * shown then), and `moved`, the places risen or fallen — Wins and losses'
 * and the tracked lists' alike.
 */
export function figureColumns(say: (key: string) => string, which: readonly Figure[]): DataTableColumn<ListRow>[] {
  const all: Record<Figure, DataTableColumn<ListRow>> = {
    clicks: { key: "clicks", header: say("table.clicks"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.clicks)}</span> },
    change: {
      key: "change",
      header: say("table.change"),
      align: "right",
      sortable: true,
      cell: (row) => <Change by={row.change} isNew={row.change !== null && row.previousClicks === null && row.clicks > 0} format={formatNumber} />,
    },
    impressions: { key: "impressions", header: say("table.impressions"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.impressions)}</span> },
    ctr: { key: "ctr", header: say("table.ctr"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatRate(row.ctr)}</span> },
    position: { key: "position", header: say("table.position"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.impressions > 0 ? formatPosition(row.position) : "–"}</span> },
    moved: {
      key: "positionChange",
      header: say("table.moved"),
      align: "right",
      sortable: true,
      cell: (row) => <Change by={row.positionChange} kind="places" same format={formatPosition} />,
    },
  };
  return which.map((key) => all[key]);
}

/** Sites' word for a keyword's intent or a page's type: a kind, so the kit's `TagLabel`. */
export function KindText({ kind, of }: { kind: string | null; of: "intent" | "pageType" }) {
  const tc = useTranslations("sites.common");
  if (!kind) return <span className="text-muted">–</span>;
  return <TagLabel>{tc(`${of === "intent" ? "intents" : "pageTypes"}.${kind}`)}</TagLabel>;
}

/**
 * A whole list as CSV, built on the server from the ready-made period — in
 * the order and with the search, filters and country on screen — and saved
 * here.
 */
export function SearchConsoleDownload({ ask, headers, fields }: {
  ask: Omit<FunctionArgs<typeof api.searchConsoleLists.exportSearchConsoleList>, "headers" | "fields">;
  headers: string[];
  fields: FunctionArgs<typeof api.searchConsoleLists.exportSearchConsoleList>["fields"];
}) {
  const t = useTranslations("searchConsole.table");
  const build = useAction(api.searchConsoleLists.exportSearchConsoleList);
  const { run, isBusy } = useAdminAction({ scope: "search-console-download" });
  const { showToast } = useToast();
  const building = isBusy();
  return (
    <DownloadButton
      label={t("download")}
      busyLabel={t("downloading")}
      busy={building}
      onClick={async () => {
        const outcome = await run(() => build({ ...ask, headers, fields }), { fallbackMessage: t("downloadFailed") });
        if (!outcome.ok) return;
        saveTextFile(outcome.data.csv, outcome.data.fileName);
        if (outcome.data.cut !== null) showToast(t("downloadCut", { rows: formatNumber(outcome.data.rows) }), "info");
      }}
    />
  );
}
