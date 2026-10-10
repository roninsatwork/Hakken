"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useTranslations } from "next-intl";
import { Telescope } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { useEngineLabel } from "@/src/ui/components/seo/engineLabel";
import { CUT_COLUMN, IntentText, RecordLinkCell } from "../../../_components/SiteCells";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { formatNumber } from "../../../_components/siteFormat";
import { useSiteId } from "../../../_components/useSite";
import { SiteSees } from "../../../_components/SiteSees";
import { useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { useSitePager } from "../../../_components/useSitePagedTable";
import { useSiteSortedList, type SiteSortColumns } from "../../../_components/useSiteSort";
import { ListDownload } from "../../../_components/SiteDownloads";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";

const INTENTS = ["BUYING", "RESEARCHING", "BRANDED", "IRRELEVANT", "OTHER", "UNJUDGED"] as const;

type Angle = FunctionReturnType<typeof api.siteAngles.listAngles>["rows"][number];

/**
 * The columns that sort (docs/plans/active/sites-table-sorting-plan.md): the
 * search A to Z, the most times seen — the order it opens on — and the site's
 * position, top first, a search with none last.
 */
const SORTS: SiteSortColumns<Angle, "search" | "times" | "position"> = {
  search: { value: (row) => row.queryText, first: "asc" },
  times: { value: (row) => row.timesSeen, first: "desc" },
  position: { value: (row) => row.position?.value ?? null, first: "asc" },
};
const queryOf = (row: Angle) => row.queryText;

/**
 * Fan-out queries: the searches the AI assistants ran behind the scenes for
 * the site's questions, most persistent first — named with the industry's own
 * term (Anthony, 2026-09-25) — wordings that say the same thing one row, a
 * topic (docs/plans/active/fan-out-angles-plan.md, FA5).
 *
 * Four columns since 2026-09-29 (Anthony: "its getting very wide … we can do
 * this on the page it clicks to"): Track, the search with what the searcher
 * wants and which assistants searched it on a second line, Times seen and the
 * site's position. The question it answered, its other wordings, the day it
 * was checked and the site's page for it are on the page each row opens
 * (`keywordAngle`); the download keeps them all. The Track tick chooses which
 * are checked on Google every run, up to the website's limit — the same rule
 * as admin's (`siteFanOutTracking.ts`). A competitor's topics are shown
 * without the tick or a position, which are about the company's own site. The
 * list is bounded on the server, so the search and filters narrow it in place.
 */
export default function SiteSearchedPage() {
  const t = useTranslations("sites.aiSearched");
  const tc = useTranslations("sites.common");
  const siteId = useSiteId();
  const engineLabel = useEngineLabel();
  const [search, setSearch, settled] = useSiteSearch();
  const [question, setQuestion] = useSiteParam<string>("question", "");
  const [intent, setIntent] = useSiteParam<string>("intent", "");
  const [tracked, setTracked] = useSiteParam<string>("tracked", "");
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);
  const answer = useQuery(api.siteAngles.listAngles, { siteId });
  const trackQuery = useMutation(api.siteFanOutTracking.trackSiteFanOutQuery);
  const action = useAdminAction({ scope: "site-fan-out-track" });
  const tracking = answer?.tracking ?? null;
  const full = tracking !== null && tracking.count >= tracking.limit;
  const rows = answer?.rows;
  const own = answer?.own ?? false;

  const term = settled.toLowerCase();
  const matches = wordStartMatcher(term);
  const matching = rows?.filter((row) =>
    (!matches || matches(row.queryText, row.prompt, ...row.otherWordings))
    && (!question || row.prompt === question)
    && (!intent || (row.intent ?? "UNJUDGED") === intent)
    && (!tracked || (tracked === "yes") === row.tracked));
  const { rows: sorted, tableSort } = useSiteSortedList(matching, SORTS, { opening: "times", name: queryOf });
  const pager = useSitePager(sorted, { isLoading: rows === undefined, cut: answer?.cut });
  const questions = [...new Set((rows ?? []).map((row) => row.prompt))].sort();

  const positionCell = (row: Angle) => {
    if (!row.position) {
      return <span className="whitespace-nowrap text-[12px] text-muted">{row.tracked ? t("notCheckedYet") : t("notTracked")}</span>;
    }
    return row.position.value === null
      ? <span className="whitespace-nowrap text-[12px] text-secondary">{t("notInTop100")}</span>
      : <span className="font-mono text-[13px] text-foreground">{formatNumber(row.position.value)}</span>;
  };

  const changeTracking = (row: Angle, track: boolean) =>
    void action.run(() => trackQuery({ siteId, prompt: row.prompt, queries: [row.query, ...row.otherWordings], track }), {
      key: `track:${row.key}`,
      fallbackMessage: t("trackFailed"),
    });

  const trackCell = (row: Angle) => {
    // Full: an empty box cannot be ticked, and says why.
    const reason = !row.tracked && full && tracking ? t("full", { limit: tracking.limit, query: row.queryText }) : undefined;
    return (
      // The tick is the row's own control: its click must not open the search.
      <span className="flex" title={reason} onClick={(event) => event.stopPropagation()}>
        <Checkbox
          label={row.tracked ? t("untrackLabel", { query: row.queryText }) : t("trackLabel", { query: row.queryText })}
          labelHidden
          checked={row.tracked}
          disabled={Boolean(reason) || action.isBusy(`track:${row.key}`)}
          title={reason}
          onChange={(next) => changeTracking(row, next)}
        />
      </span>
    );
  };

  const searchCell = (row: Angle) => (
    <span className="flex min-w-0 flex-col gap-0.5">
      <RecordLinkCell cut href={recordHref({ kind: "keyword", keyword: row.query })}>{row.queryText}</RecordLinkCell>
      <span className="truncate text-[11px] text-muted">
        <IntentText intent={row.intent} /> · {row.engines.map(engineLabel).join(", ")}
      </span>
    </span>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Telescope className="h-5 w-5 text-brand" />} title={t("title")} description={t(own ? "description" : "descriptionCompetitor")} />
      <SiteSees screen="aiSearched" seen={answer?.seen} />
      {answer && !answer.built ? <p className="text-[12px] text-muted">{t("notBuilt")}</p> : null}
      <div className="flex flex-col gap-3">
        <DataTable
          rows={pager.pageRows}
          rowKey={(row) => row.key}
          onRowClick={(row) => router.push(recordHref({ kind: "keyword", keyword: row.query }))}
          search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
          filters={
            <>
              <Select
                chip={{ label: t("questionFilter"), choice: question || null }}
                className="max-w-[20rem]"
                value={question}
                onChange={setQuestion}
              >
                <option value="">{t("anyQuestion")}</option>
                {questions.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
              </Select>
              <Select chip={{ label: tc("intentFilter"), choice: intent ? tc(`intents.${intent}`) : null }} value={intent} onChange={setIntent}>
                <option value="">{tc("anyIntent")}</option>
                {INTENTS.map((entry) => <option key={entry} value={entry}>{tc(`intents.${entry}`)}</option>)}
              </Select>
              <Select chip={{ label: t("trackedFilter"), choice: tracked === "yes" ? t("onlyTracked") : tracked === "no" ? t("onlyUntracked") : null }} value={tracked} onChange={setTracked}>
                <option value="">{t("anyTracked")}</option>
                <option value="yes">{t("onlyTracked")}</option>
                <option value="no">{t("onlyUntracked")}</option>
              </Select>
            </>
          }
          cardHeader={
            <TableBar
              footer={pager.footer}
              noun="angles"
              actions={
                <ListDownload
                  fileName="fan-out-queries"
                  rows={sorted}
                  columns={[
                    { header: t("columns.search"), value: (row) => row.queryText },
                    { header: t("columns.otherWordings"), value: (row) => row.otherWordings.join("; ") },
                    { header: t("columns.question"), value: (row) => row.prompt },
                    { header: t("columns.intent"), value: (row) => tc(`intents.${row.intent ?? "UNJUDGED"}`) },
                    { header: t("columns.engines"), value: (row) => row.engines.join("; ") },
                    { header: t("columns.times"), value: (row) => row.timesSeen },
                    { header: t("columns.lastChecked"), value: (row) => row.lastSeenDay },
                    ...(own ? [
                      { header: t("columns.position"), value: (row: Angle) => row.position?.value ?? null },
                      { header: t("columns.positionFrom"), value: (row: Angle) => (row.position ? row.position.from : null) },
                      { header: t("columns.page"), value: (row: Angle) => row.page?.url ?? (row.page ? row.page.verdict : null) },
                    ] : []),
                    { header: t("columns.tracked"), value: (row) => (row.tracked ? tc("yes") : "") },
                  ]}
                />
              }
            >
              <span className="text-[12px] text-secondary">{t("fromQueries", { count: answer?.wordings ?? 0 })}</span>
              {tracking ? (
                <span className="text-[12px] text-foreground">· {t("trackedCount", { count: tracking.count, limit: tracking.limit })}</span>
              ) : null}
            </TableBar>
          }
          empty={{ icon: <Telescope className="h-8 w-8 text-muted/30" />, label: term || question || intent || tracked ? t("noMatch") : t("empty") }}
          footer={pager.footer}
          sort={tableSort}
          rowClassName={(row) => (row.tracked && own ? "bg-brand/5" : "")}
          columns={own ? [
            { key: "track", header: t("columns.track"), className: "w-[72px]", cell: trackCell },
            { key: "search", header: t("columns.search"), sortable: true, className: CUT_COLUMN.first, cell: searchCell },
            { key: "times", header: t("columns.times"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px]">{formatNumber(row.timesSeen)}</span> },
            { key: "position", header: t("columns.position"), align: "right", sortable: true, cell: positionCell },
          ] : [
            { key: "search", header: t("columns.search"), sortable: true, className: CUT_COLUMN.first, cell: searchCell },
            { key: "times", header: t("columns.times"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px]">{formatNumber(row.timesSeen)}</span> },
            { key: "tracked", header: t("columns.tracked"), cell: (row) => (row.tracked ? <StatusLabel tone="success">{tc("yes")}</StatusLabel> : <NoFigure />) },
          ]}
        />
      </div>
    </div>
  );
}
