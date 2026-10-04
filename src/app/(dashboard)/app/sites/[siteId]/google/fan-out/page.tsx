"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useTranslations } from "next-intl";
import { Pin } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { Change } from "@/src/ui/components/screens/Change";
import { FigureWithMove } from "../../../../_components/FigureWithMove";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { useEngineLabel } from "@/src/ui/components/seo/engineLabel";
import { CUT_COLUMN, CheckedCell, PositionCell, RecordLinkCell } from "../../../_components/SiteCells";
import { formatNumber } from "../../../_components/siteFormat";
import { useSite, useSiteId } from "../../../_components/useSite";
import { useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { useSitePager } from "../../../_components/useSitePagedTable";
import { useSiteSortedList, type SiteSortColumns } from "../../../_components/useSiteSort";
import { ListDownload } from "../../../_components/SiteDownloads";
import { SEARCH_VERDICTS, SEARCH_VERDICT_TONES, STANDING_SORTS, type SearchVerdict } from "../../../_components/searchStanding";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";

type Standing = FunctionReturnType<typeof api.siteGoogle.listSearches>[number];
type FanOut = FunctionReturnType<typeof api.siteAngles.listTrackedFanOut>["rows"][number];
/** A tracked search, with what the assistants did with it. */
type Row = Standing & Omit<FanOut, "keyword">;

/**
 * The columns that sort (docs/plans/active/sites-table-sorting-plan.md): the
 * query A to Z, the most assistants and the most times seen first, and the
 * standing's own (`STANDING_SORTS`) — the position, top first, the order it
 * opens on. How it's doing is a label with a filter, and Track is yes or no,
 * so neither sorts.
 */
const SORTS: SiteSortColumns<Row, "query" | "askedBy" | "seen" | "position" | "change" | "best" | "checked"> = {
  query: { value: (row) => row.queryText, first: "asc" },
  askedBy: { value: (row) => (row.engines.length > 0 ? row.engines.length : null), first: "desc" },
  seen: { value: (row) => row.timesSeen, first: "desc" },
  ...STANDING_SORTS,
};
const queryOf = (row: Row) => row.queryText;
const NO_WRAP = "whitespace-nowrap";

/**
 * Tracked fan-out queries (Anthony, 2026-10-03): the searches the AI
 * assistants ran behind the scenes that the company has ticked to check on
 * Google every run, and where the site ranks for each. Ticking one on Fan-out
 * queries puts it on the site's tracked searches, so each is also among Your
 * searches; this is the focused view of them, built as that page is.
 *
 * Where the site stands is Your searches' own read, its rows from a fan-out
 * query that are running; which assistants ran each and how often come from
 * `listTrackedFanOut`, joined on the keyword. Unticking one takes it off the
 * tracked searches, as on Fan-out queries, and its row leaves the list. A row
 * opens the query's own screen, which leads back here. On a competitor the
 * queries are the site's it is compared with, and nothing can be unticked.
 */
export default function SiteTrackedFanOutPage() {
  const t = useTranslations("sites.trackedFanOut");
  const ts = useTranslations("sites.googleSearches");
  const ta = useTranslations("sites.aiSearched");
  const siteId = useSiteId();
  const site = useSite();
  const engineLabel = useEngineLabel();
  const [search, setSearch, settled] = useSiteSearch();
  const [verdict, setVerdict] = useSiteParam<SearchVerdict | "">("verdict", "", SEARCH_VERDICTS);
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);
  const trackQuery = useMutation(api.siteFanOutTracking.trackSiteFanOutQuery);
  const action = useAdminAction({ scope: "site-fan-out-track" });

  const standings = useQuery(api.siteGoogle.listSearches, { siteId });
  const fanOut = useQuery(api.siteAngles.listTrackedFanOut, { siteId });
  const own = fanOut?.own ?? false;
  const tracking = fanOut?.tracking ?? null;

  const rows = useMemo<Row[] | undefined>(() => {
    if (!standings || !fanOut) return undefined;
    const byKeyword = new Map(fanOut.rows.map((row) => [row.keyword, row]));
    // Running searches that came from a fan-out query: the ones ticked to check every run.
    return standings
      .filter((row) => row.fromFanOut && row.isActive)
      .map((row) => {
        const found = byKeyword.get(row.keyword);
        return { ...row, queryText: found?.queryText ?? row.keyword, prompt: found?.prompt ?? null, engines: found?.engines ?? [], timesSeen: found?.timesSeen ?? null };
      });
  }, [standings, fanOut]);

  const term = settled.toLowerCase();
  const matches = wordStartMatcher(term);
  const matching = rows?.filter((row) => (!matches || matches(row.queryText)) && (!verdict || row.verdict === verdict));
  const { rows: sorted, tableSort } = useSiteSortedList(matching, SORTS, { opening: "position", name: queryOf });
  const pager = useSitePager(sorted, { isLoading: rows === undefined });

  const askedBy = (row: Row) => row.engines.map(engineLabel).join(", ");

  const untrack = (row: Row) => {
    if (row.prompt === null) return;
    const prompt = row.prompt;
    void action.run(() => trackQuery({ siteId, prompt, queries: [row.keyword], track: false }), {
      key: `untrack:${row.keyword}`,
      fallbackMessage: ta("trackFailed"),
    });
  };

  const trackCell = (row: Row) => (
    // The tick is the row's own control: its click must not open the query.
    <span className="flex" onClick={(event) => event.stopPropagation()}>
      <Checkbox
        label={ta("untrackLabel", { query: row.queryText })}
        labelHidden
        checked
        // No question lists it any more: it can only be unticked where it is kept, on the tracked searches.
        disabled={row.prompt === null || action.isBusy(`untrack:${row.keyword}`)}
        // A disabled tick shows no tooltip of its own reason otherwise: say why it can't be unticked here.
        title={row.prompt === null ? t("cannotUntrack") : ta("untrackLabel", { query: row.queryText })}
        onChange={() => untrack(row)}
      />
    </span>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<Pin className="h-5 w-5 text-brand" />}
        title={t("title")}
        description={t("description", { place: site?.placeLabel ?? "" })}
      />

      <DataTable
        rows={pager.pageRows}
        rowKey={(row) => row.keyword}
        onRowClick={(row) => router.push(recordHref({ kind: "keyword", keyword: row.keyword }))}
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select chip={{ label: ts("verdictFilter"), choice: verdict ? ts(`verdicts.${verdict}`) : null }} value={verdict} onChange={(value) => setVerdict(value as SearchVerdict | "")}>
              <option value="">{ts("anyVerdict")}</option>
              {SEARCH_VERDICTS.map((entry) => <option key={entry} value={entry}>{ts(`verdicts.${entry}`)}</option>)}
            </Select>
          </>
        }
        cardHeader={
          <TableBar
            footer={pager.footer}
            noun="fanOutQueries"
            actions={
              <ListDownload
                fileName={`${site?.host ?? "site"}-tracked-fan-out-queries`}
                rows={sorted}
                columns={[
                  { header: t("columns.query"), value: (row) => row.queryText },
                  { header: t("columns.askedBy"), value: (row) => row.engines.join("; ") },
                  { header: t("columns.seen"), value: (row) => row.timesSeen },
                  { header: ts("columns.position"), value: (row) => row.lastPosition },
                  { header: ts("columns.best"), value: (row) => row.bestPosition },
                  { header: ts("columns.verdict"), value: (row) => ts(`verdicts.${row.verdict}`) },
                  { header: ts("columns.lastChecked"), value: (row) => row.lastCheckedDay },
                ]}
              />
            }
          >
            {tracking ? (
              <span className="text-[12px] text-secondary">· {ta("trackedCount", { count: tracking.count, limit: tracking.limit })}</span>
            ) : null}
          </TableBar>
        }
        empty={{ icon: <Pin className="h-8 w-8 text-muted/30" />, label: term || verdict ? t("noMatch") : t("empty") }}
        footer={pager.footer}
        sort={tableSort}
        columns={[
          ...(own ? [{ key: "track", header: ta("columns.track"), className: "w-[72px]", cell: trackCell }] : []),
          { key: "query", header: t("columns.query"), sortable: true, className: CUT_COLUMN.first, cell: (row) => <RecordLinkCell cut href={recordHref({ kind: "keyword", keyword: row.keyword })}>{row.queryText}</RecordLinkCell> },
          // Short headings stay on one line: an empty table has no rows to give its columns their widths (2026-10-04).
          { key: "askedBy", header: t("columns.askedBy"), sortable: true, className: NO_WRAP, cell: (row) => (row.engines.length > 0 ? <TagLabel>{askedBy(row)}</TagLabel> : <NoFigure />) },
          { key: "seen", header: t("columns.seen"), align: "right", sortable: true, className: NO_WRAP, cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.timesSeen)}</span> },
          // Its move folded underneath, and Best left to the download, so the
          // table fits the page (design-drift-plan D4, 2026-10-04).
          {
            key: "position",
            header: ts("columns.position"),
            align: "right",
            sortable: true,
            className: NO_WRAP,
            cell: (row) => {
              if (row.lastCheckedDay === null) return <span className="whitespace-nowrap text-[12px] text-muted">{ts("verdicts.NOT_CHECKED")}</span>;
              const move = row.lastPosition !== null && row.previousPosition !== null ? row.previousPosition - row.lastPosition : null;
              return <FigureWithMove figure={<PositionCell position={row.lastPosition} />} move={move ? <Change by={move} /> : null} />;
            },
          },
          { key: "verdict", header: ts("columns.verdict"), className: NO_WRAP, cell: (row) => <StatusLabel tone={SEARCH_VERDICT_TONES[row.verdict]}>{ts(`verdicts.${row.verdict}`)}</StatusLabel> },
          { key: "checked", header: ts("columns.lastChecked"), sortable: true, className: NO_WRAP, cell: (row) => <CheckedCell day={row.lastCheckedDay} /> },
        ]}
      />
    </div>
  );
}
