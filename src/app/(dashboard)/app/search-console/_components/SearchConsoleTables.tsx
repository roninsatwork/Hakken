"use client";

import { useAction } from "convex/react";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useToast } from "@/src/context/ToastContext";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { Button } from "@/src/ui/components/screens/Button";
import { formatNumber } from "../../sites/_components/siteFormat";
import { useSiteListPage } from "../../sites/_components/useSitePagedTable";
import { useSiteSearch } from "../../sites/_components/useSiteParam";
import { useSiteSort } from "../../sites/_components/useSiteSort";
import type { FunctionReturnType } from "convex/server";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { useSitePager } from "../../sites/_components/useSitePagedTable";
import { useSiteSortedList, type SiteSortColumns } from "../../sites/_components/useSiteSort";
import { useLiveAsk } from "./searchConsoleRecords";
import { useResultKind, useSearchConsoleRange, useSearchConsoleSiteId, useSearchConsoleStatus } from "./useSearchConsole";

/**
 * What the Searches and Pages tables share: a ready-made period's list read
 * a page at a time on the server, searched and ordered over the whole of it
 * by the heading pressed — the best first, as every Sites table orders
 * (docs/plans/active/sites-table-sorting-plan.md) — and its download. Dates
 * that are not a ready-made period are asked of Google when chosen and paged
 * here (search-console-plan.md §14.3, item 4). Each page draws its own header
 * and table, as the Sites pages do.
 */

/** Each heading's first press: the best first — a top position, a name A to Z, any other figure the most. */
const FIRSTS = { key: "asc", clicks: "desc", change: "desc", impressions: "desc", ctr: "desc", position: "asc", count: "desc", top: "asc" } as const;

type LiveRow = Extract<FunctionReturnType<typeof api.searchConsoleLists.searchConsoleLiveList>, { ok: true }>["rows"][number];
const LIVE_SORTS: SiteSortColumns<LiveRow, keyof typeof FIRSTS> = {
  key: { value: (row) => row.key, first: "asc" },
  clicks: { value: (row) => row.clicks, first: "desc" },
  change: { value: (row) => row.change, first: "desc" },
  impressions: { value: (row) => row.impressions, first: "desc" },
  ctr: { value: (row) => row.ctr, first: "desc" },
  position: { value: (row) => row.position, first: "asc" },
  count: { value: (row) => row.count, first: "desc" },
  top: { value: (row) => row.top, first: "asc" },
};
const keyOf = (row: LiveRow) => row.key;

export function useSearchConsoleList(dimension: "query" | "page") {
  const siteId = useSearchConsoleSiteId();
  const status = useSearchConsoleStatus();
  const [kind] = useResultKind();
  const range = useSearchConsoleRange(status?.connection?.newestDay);
  const [search, setSearch, term] = useSiteSearch();
  const order = useSiteSort<keyof typeof FIRSTS>(FIRSTS, "clicks");
  const held = Boolean(status?.connection?.newestDay);
  const ask = { siteId, searchType: kind, dimension, from: range.from, to: range.to };
  const server = useSiteListPage(
    api.searchConsoleLists.searchConsoleListPage,
    held ? { ...ask, ...(term ? { q: term } : {}), sort: order.key, direction: order.direction } : "skip",
  );
  const live = useLiveAsk(api.searchConsoleLists.searchConsoleLiveList, server.result?.live ? ask : null);
  const matches = wordStartMatcher(term.toLowerCase());
  const liveRows = live.answer === undefined ? undefined : live.answer.ok ? live.answer.rows.filter((row) => !matches || matches(row.key)) : [];
  const liveOrder = useSiteSortedList(liveRows, LIVE_SORTS, { opening: "clicks", name: keyOf });
  const livePages = useSitePager(liveOrder.rows, { isLoading: liveRows === undefined, cut: live.answer?.ok ? live.answer.cut : null });
  const isLive = Boolean(server.result?.live);
  const table = isLive
    ? { pageRows: livePages.pageRows, footer: livePages.footer, result: live.answer?.ok ? { named: live.answer.named, comparable: live.answer.comparable } : undefined }
    : { pageRows: server.pageRows, footer: server.footer, result: server.result ? { named: server.result.named, comparable: server.result.comparable } : undefined };
  const copy = { building: server.preparing, behind: false };
  return { siteId, status, kind, range, search, setSearch, term, order, table, copy, ask, live: isLive };
}

/** Clicks gained or lost on the days before; "New" for one not shown then; nothing when those days are not held. */
export function ClicksChange({ change, previousClicks, clicks }: { change: number | null; previousClicks: number | null; clicks: number }) {
  const t = useTranslations("searchConsole.table");
  if (change === null) return <span className="text-muted">–</span>;
  if (previousClicks === null && clicks > 0) return <span className="text-[12px] text-success">{t("new")}</span>;
  if (change > 0) return <span className="font-mono text-[12px] text-success">▲ {formatNumber(change)}</span>;
  if (change < 0) return <span className="font-mono text-[12px] text-destructive">▼ {formatNumber(-change)}</span>;
  return <span className="text-muted">–</span>;
}

/** Hand a file to the browser to save. */
function save(csv: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * A whole list as CSV, built on the server from the list's own copy — in the
 * order and with the search on screen — and saved here. A list held to the
 * rows a copy keeps says the file holds only those.
 */
export function SearchConsoleDownload({ ask, headers }: {
  ask: {
    siteId: Id<"companyWebsites">;
    searchType: "web" | "image" | "video" | "news" | "discover" | "googleNews";
    dimension: "query" | "page" | "country" | "device" | "appearance";
    from: string;
    to: string;
    q?: string;
    sort?: "key" | "clicks" | "change" | "impressions" | "ctr" | "position" | "share" | "count" | "top";
    direction?: "asc" | "desc";
  };
  headers: string[];
}) {
  const t = useTranslations("searchConsole.table");
  const build = useAction(api.searchConsoleLists.exportSearchConsoleList);
  const { run, isBusy } = useAdminAction({ scope: "search-console-download" });
  const { showToast } = useToast();
  const building = isBusy();
  return (
    <Button
      variant="quiet"
      disabled={building}
      onClick={async () => {
        const outcome = await run(() => build({ ...ask, headers }), { fallbackMessage: t("downloadFailed") });
        if (!outcome.ok) return;
        save(outcome.data.csv, outcome.data.fileName);
        if (outcome.data.cut !== null) showToast(t("downloadCut", { rows: formatNumber(outcome.data.rows) }), "info");
      }}
      className="inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-[12px]"
      aria-live="polite"
    >
      <Download className="h-3.5 w-3.5" aria-hidden="true" />
      {building ? t("downloading") : t("download")}
    </Button>
  );
}
