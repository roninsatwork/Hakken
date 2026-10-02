"use client";

import { useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarClock } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { CUT_COLUMN } from "../../../sites/_components/SiteCells";
import { SiteTableBar } from "../../../sites/_components/SiteTableBar";
import { formatNumber, formatShortDay } from "../../../sites/_components/siteFormat";
import { useSitePager } from "../../../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../sites/_components/useSiteSort";
import { SearchConsoleChart } from "../../_components/SearchConsoleChart";
import { ResultKindSwitch, SearchConsoleGate } from "../../_components/SearchConsoleNotices";
import { formatPosition } from "../../_components/searchConsoleFormat";
import { BeforeAfter, ClicksChange, PlacesMoved } from "../../_components/SearchConsoleTables";
import { useResultKind, useSearchConsoleSiteId, useSearchConsoleStatus } from "../../_components/useSearchConsole";

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

/**
 * Google updates (search-console-plan.md §13.3, drawn as "8 · Google
 * updates"): what each of Google's updates did to the website — clicks and
 * average position the 14 days before it began against the 14 days after it
 * finished — beside its clicks day by day with every update marked, as the
 * Sites charts mark them. The updates are Admin → Content → Google updates.
 */
export default function SearchConsoleUpdatesPage() {
  const t = useTranslations("searchConsole");
  const language = useLocale();
  const siteId = useSearchConsoleSiteId();
  const status = useSearchConsoleStatus();
  const [kind] = useResultKind();
  const [search, setSearch, term] = useSiteSearch();
  const [finished, setFinished] = useSiteParam<"" | "done" | "rolling">("finished", "", ["", "done", "rolling"]);
  const held = Boolean(status?.connection?.newestDay);
  const answer = useQuery(api.searchConsoleChanges.searchConsoleUpdates, held ? { siteId, searchType: kind, language } : "skip");
  const days = useQuery(
    api.searchConsoleReads.searchConsolePerformance,
    answer?.from && answer.to ? { siteId, searchType: kind, from: answer.from, to: answer.to } : "skip",
  );
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
  const notYet = (row: Update) => <span className="whitespace-nowrap text-[12px] text-muted">{t(row.state === "rolling" ? "updates.notFinished" : "updates.waiting")}</span>;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<CalendarClock className="h-5 w-5 text-brand" />} title={t("updates.title")} description={t("updates.description")} />
      {status ? (
        <SearchConsoleGate status={status} siteId={siteId}>
          <ResultKindSwitch />
          {days && answer?.from && answer.to ? (
            <SearchConsoleChart
              title={t("updates.chartTitle")}
              days={days.days}
              range={{ from: answer.from, to: answer.to, step: "day" }}
              held={{ from: answer.from, to: answer.to }}
              host={host}
              exportName={`${host}-search-console-google-updates`}
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
            cardHeader={<SiteTableBar footer={pager.footer} noun="updates" />}
            sort={tableSort}
            empty={{ icon: <CalendarClock className="h-8 w-8 text-muted/30" />, label: term || finished ? t("table.noMatch") : t("updates.empty") }}
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
              { key: "change", header: t("table.change"), align: "right", sortable: true, cell: (row) => (row.state !== "done" ? notYet(row) : <ClicksChange change={row.change} previousClicks={row.beforeClicks} clicks={row.afterClicks ?? 0} />) },
              { key: "position", header: t("table.position"), align: "right", sortable: true, cell: (row) => <BeforeAfter before={row.beforePosition} now={row.afterPosition} format={formatPosition} /> },
              { key: "moved", header: t("table.moved"), align: "right", sortable: true, cell: (row) => (row.state !== "done" ? notYet(row) : <PlacesMoved change={row.moved} />) },
            ]}
          />
        </SearchConsoleGate>
      ) : null}
    </div>
  );
}
