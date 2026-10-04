"use client";

import { useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarClock } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { Change } from "@/src/ui/components/screens/Change";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { CUT_COLUMN } from "../../../sites/_components/SiteCells";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { formatNumber, formatShortDay } from "../../../sites/_components/siteFormat";
import { ListDownload } from "../../../sites/_components/SiteDownloads";
import { useSitePager } from "../../../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../sites/_components/useSiteSort";
import { SearchConsoleChart } from "../../_components/SearchConsoleChart";
import { useSiteFiguresFor } from "../../_components/SearchConsoleFigures";
import { LiveProblem, ResultKindSwitch, SearchConsoleGate, liveProblemKey } from "../../_components/SearchConsoleNotices";
import { filePosition, formatPosition } from "../../_components/searchConsoleFormat";
import { useLiveAsk } from "../../_components/searchConsoleRecords";
import { BeforeAfter } from "../../_components/SearchConsoleTables";
import { countryArg, useResultKind, useSearchConsoleCountry, useSearchConsoleRange, useSearchConsoleSiteId, useSearchConsoleStatus } from "../../_components/useSearchConsole";

type Update = {
  key: string;
  title: string;
  startedOn: string;
  finishedOn: string | null;
  state: "done" | "rolling" | "waiting";
  beforeClicks: number | null;
  afterClicks: number | null;
  change: number | null;
  beforePosition: number | null;
  afterPosition: number | null;
  moved: number | null;
};

const SORTS: SiteSortColumns<Update, "title" | "dates" | "clicks" | "change" | "position" | "moved"> = {
  title: { value: (row) => row.title, first: "asc" },
  dates: { value: (row) => row.startedOn, first: "desc" },
  clicks: { value: (row) => row.afterClicks, first: "desc" },
  change: { value: (row) => row.change, first: "desc" },
  position: { value: (row) => row.afterPosition, first: "asc" },
  moved: { value: (row) => row.moved, first: "desc" },
};
const titleOf = (row: Update) => row.title;

/** The chart as drawn: clicks alone, with its one tick box. */
const CLICKS_ONLY = ["clicks"] as const;

/**
 * Google updates (search-console-plan.md §13.3, drawn as "8 · Google
 * updates"): what each of Google's updates did to the website — clicks and
 * average position the 14 days before it began against the 14 days after it
 * finished — beside its clicks day by day with every update marked, as the
 * Sites charts mark them — both in the dates and step chosen (2026-10-04).
 * The updates are Admin → Content → Google updates.
 * In the country chosen: from its own days when the website keeps it ready,
 * otherwise asked of Google (search-console-plan.md §16).
 */
export default function SearchConsoleUpdatesPage() {
  const t = useTranslations("searchConsole");
  const language = useLocale();
  const siteId = useSearchConsoleSiteId();
  const status = useSearchConsoleStatus();
  const [kind] = useResultKind();
  const [country] = useSearchConsoleCountry();
  const [search, setSearch, term] = useSiteSearch();
  const [finished, setFinished] = useSiteParam<"" | "done" | "rolling">("finished", "", ["", "done", "rolling"]);
  const range = useSearchConsoleRange(status?.connection?.newestDay);
  const held = Boolean(status?.connection?.newestDay);
  const dates = { from: range.from, to: range.to };
  const kept = useQuery(api.searchConsoleChanges.searchConsoleUpdates, held ? { siteId, searchType: kind, language, ...countryArg(country), ...dates } : "skip");
  // A country the website does not keep ready: the same answer, asked of Google.
  const live = useLiveAsk(api.searchConsoleChanges.searchConsoleLiveUpdates, held && country && kept?.live ? { siteId, searchType: kind, language, country, ...dates } : null);
  const answer = kept?.live ? (live.answer === undefined ? undefined : live.answer.ok ? live.answer : { from: null, to: null, updates: [] }) : kept;
  const problem = kept?.live && live.answer && !live.answer.ok ? live.answer.problem : null;
  const days = useSiteFiguresFor(held ? { siteId, searchType: kind, ...dates } : null);
  // Google out of reach for the updates, or for the days the chart draws.
  const chartProblem = problem ?? days.problem;
  const rows: Update[] | undefined = answer?.updates.map((update) => ({
    key: update.id,
    title: update.title,
    startedOn: update.startedOn,
    finishedOn: update.finishedOn,
    state: update.state,
    beforeClicks: update.before?.clicks ?? null,
    afterClicks: update.after?.clicks ?? null,
    change: update.before && update.after ? update.after.clicks - update.before.clicks : null,
    beforePosition: update.before?.position ?? null,
    afterPosition: update.after?.position ?? null,
    moved: update.before && update.after ? update.before.position - update.after.position : null,
  }));
  const matches = wordStartMatcher(term.toLowerCase());
  const matching = rows?.filter((row) => (!matches || matches(row.title)) && (!finished || (finished === "done" ? row.state !== "rolling" : row.state === "rolling")));
  const { rows: sorted, tableSort } = useSiteSortedList(matching, SORTS, { opening: "dates", name: titleOf });
  const pager = useSitePager(sorted, { isLoading: rows === undefined });
  const host = status?.host ?? "";
  const notYet = (row: Update) => <span className="whitespace-nowrap text-[12px] text-muted">{(row.state === "rolling" ? t("updates.notFinished") : t("updates.waiting", { days: status?.limits.updateWindowDays ?? "…" }))}</span>;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<CalendarClock className="h-5 w-5 text-brand" />} title={t("updates.title")} description={t("updates.description", { days: status?.limits.updateWindowDays ?? "…" })} />
      {status ? (
        <SearchConsoleGate status={status} siteId={siteId}>
          <ResultKindSwitch />
          {chartProblem ? (
            <LiveProblem problem={chartProblem} retry={problem ? live.retry : days.retry} />
          ) : days.figures ? (
            <SearchConsoleChart
              title={t("updates.chartTitle")}
              hint={t("updates.chartHint")}
              measures={CLICKS_ONLY}
              days={days.figures.days}
              range={range}
              held={{ from: status.connection?.oldestDay ?? null, to: status.connection?.newestDay ?? null }}
              host={host}
              exportName={`${host}-search-console-google-updates-${range.from}-to-${range.to}`}
            />
          ) : (
            <div className="h-[340px] animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />
          )}
          <DataTable
            rows={pager.pageRows}
            rowKey={(row) => row.key}
            minWidthClassName="min-w-[760px]"
            search={{ value: search, onChange: setSearch, placeholder: t("updates.searchPlaceholder") }}
            filters={
              <Select
                chip={{ label: t("updates.finishedOrNot"), choice: finished ? t(finished === "done" ? "updates.finished" : "updates.rolling") : null }}
                value={finished}
                onChange={(next) => setFinished(next as "" | "done" | "rolling")}
              >
                <option value="">{t("updates.finishedOrNot")}</option>
                <option value="done">{t("updates.finished")}</option>
                <option value="rolling">{t("updates.rolling")}</option>
              </Select>
            }
            cardHeader={
              <TableBar
                footer={pager.footer}
                noun="updates"
                actions={
                  <ListDownload
                    label={t("table.download")}
                    fileName={`${host}-search-console-google-updates`}
                    rows={sorted}
                    columns={[
                      { header: t("table.update"), value: (row) => row.title },
                      { header: t("updates.started"), value: (row) => row.startedOn },
                      { header: t("updates.finished"), value: (row) => row.finishedOn },
                      { header: t("moves.clicksBefore"), value: (row) => row.beforeClicks },
                      { header: t("table.clicks"), value: (row) => row.afterClicks },
                      { header: t("table.change"), value: (row) => (row.state === "done" ? row.change : null) },
                      { header: t("moves.positionBefore"), value: (row) => filePosition(row.beforePosition) },
                      { header: t("table.position"), value: (row) => filePosition(row.afterPosition) },
                      { header: t("table.moved"), value: (row) => (row.state === "done" ? filePosition(row.moved) : null) },
                    ]}
                  />
                }
              />
            }
            sort={tableSort}
            empty={{ icon: <CalendarClock className="h-8 w-8 text-muted/30" />, label: problem ? t(liveProblemKey(problem)) : term || finished ? t("table.noMatch") : t("updates.empty") }}
            footer={pager.footer}
            columns={[
              { key: "title", header: t("table.update"), sortable: true, className: CUT_COLUMN.first, cell: (row) => <span className="block truncate text-[13px] text-foreground">{row.title}</span> },
              {
                key: "dates",
                header: t("table.dates"),
                sortable: true,
                cell: (row) => (
                  <span className="whitespace-nowrap text-[12px] text-secondary">
                    {formatShortDay(row.startedOn)} – {row.finishedOn ? formatShortDay(row.finishedOn) : t("updates.rollingOut")}
                  </span>
                ),
              },
              { key: "clicks", header: t("table.clicks"), align: "right", sortable: true, cell: (row) => <BeforeAfter before={row.beforeClicks} now={row.afterClicks} format={formatNumber} /> },
              { key: "change", header: t("table.change"), align: "right", sortable: true, cell: (row) => (row.state !== "done" ? notYet(row) : <Change by={row.change} isNew={row.change !== null && row.beforeClicks === null && (row.afterClicks ?? 0) > 0} format={formatNumber} />) },
              { key: "position", header: t("table.position"), align: "right", sortable: true, cell: (row) => <BeforeAfter before={row.beforePosition} now={row.afterPosition} format={formatPosition} /> },
              { key: "moved", header: t("table.moved"), align: "right", sortable: true, cell: (row) => (row.state !== "done" ? notYet(row) : <Change by={row.moved} kind="places" same format={formatPosition} />) },
            ]}
          />
        </SearchConsoleGate>
      ) : null}
    </div>
  );
}
