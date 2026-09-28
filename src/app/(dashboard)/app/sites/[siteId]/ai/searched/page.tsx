"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useTranslations } from "next-intl";
import { Info, Telescope } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { useEngineLabel } from "@/src/ui/components/seo/engineLabel";
import { CUT_COLUMN, IntentPill, RecordLinkCell } from "../../../_components/SiteCells";
import { SiteTableBar } from "../../../_components/SiteTableBar";
import { formatDay, formatNumber } from "../../../_components/siteFormat";
import { useSite, useSiteId } from "../../../_components/useSite";
import { useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { useSitePager } from "../../../_components/useSitePagedTable";
import { useSiteSortedList, type SiteSortColumns } from "../../../_components/useSiteSort";
import { ListDownload } from "../../../_components/SiteDownloads";
import { wordStartMatcher } from "@/convex/utils/wordStarts";

const INTENTS = ["BUYING", "RESEARCHING", "BRANDED", "IRRELEVANT", "OTHER", "UNJUDGED"] as const;
const PAGE_FILTERS = ["missing", "answered", "offTopic", "unjudged"] as const;
type PageFilter = (typeof PAGE_FILTERS)[number];

type Angle = FunctionReturnType<typeof api.siteAngles.listAngles>["rows"][number];

/**
 * The columns that sort (docs/plans/active/sites-table-sorting-plan.md): the
 * search A to Z, the most engines running it, the most times seen — the order
 * it opens on — and the site's position, top first, a search with none last.
 */
const SORTS: SiteSortColumns<Angle, "search" | "engines" | "times" | "position"> = {
  search: { value: (row) => row.queryText, first: "asc" },
  engines: { value: (row) => row.engines.length, first: "desc" },
  times: { value: (row) => row.timesSeen, first: "desc" },
  position: { value: (row) => row.position?.value ?? null, first: "asc" },
};
const queryOf = (row: Angle) => row.queryText;

/** Which of the page filters a row falls under. */
function pageKind(row: Angle): PageFilter {
  if (!row.page || row.page.verdict === "UNSURE") return "unjudged";
  if (row.page.verdict === "NONE") return "missing";
  if (row.page.verdict === "OFF_TOPIC") return "offTopic";
  return "answered";
}

/**
 * Fan-out queries: the searches the AI assistants ran behind the scenes for
 * the site's questions, most persistent first — named with the industry's own
 * term (Anthony, 2026-09-25). Since 2026-09-28 (docs/plans/active/
 * fan-out-angles-plan.md, FA1 and FA5) wordings that say the same thing are
 * one row, an angle, with the site's position for it and the page that
 * answers it; *Missing angles* turns the table into the list of angles the
 * site has no page for. Read-only: tracking a search is done in admin. For a
 * competitor the angles are shown without the two columns, which are about
 * the company's own site. The list is bounded on the server, so the search
 * and filters narrow it in place.
 */
export default function SiteSearchedPage() {
  const t = useTranslations("sites.aiSearched");
  const tc = useTranslations("sites.common");
  const siteId = useSiteId();
  const site = useSite();
  const engineLabel = useEngineLabel();
  const [search, setSearch, settled] = useSiteSearch();
  const [question, setQuestion] = useSiteParam<string>("question", "");
  const [intent, setIntent] = useSiteParam<string>("intent", "");
  const [tracked, setTracked] = useSiteParam<string>("tracked", "");
  const [pageFilter, setPageFilter] = useSiteParam<string>("page", "");
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);
  const answer = useQuery(api.siteAngles.listAngles, { siteId });
  const rows = answer?.rows;
  const own = answer?.own ?? false;
  const missingOnly = own && pageFilter === "missing";

  const term = settled.toLowerCase();
  const matches = wordStartMatcher(term);
  const matching = rows?.filter((row) =>
    (!matches || matches(row.queryText, row.prompt, ...row.otherWordings))
    && (!question || row.prompt === question)
    && (!intent || (row.intent ?? "UNJUDGED") === intent)
    && (!tracked || (tracked === "yes") === row.tracked)
    && (!own || !pageFilter || pageKind(row) === pageFilter));
  const { rows: sorted, tableSort } = useSiteSortedList(matching, SORTS, { opening: "times", name: queryOf });
  const pager = useSitePager(sorted, { isLoading: rows === undefined, cut: answer?.cut });
  const questions = [...new Set((rows ?? []).map((row) => row.prompt))].sort();

  const positionCell = (row: Angle) => {
    if (!row.position) {
      return <span className="whitespace-nowrap text-[12px] text-muted">{row.tracked ? t("notCheckedYet") : t("notTracked")}</span>;
    }
    const from = row.position.from === "CHECKED"
      ? t("positionFrom.CHECKED", { day: formatDay(row.position.day) })
      : t(`positionFrom.${row.position.from}`);
    return (
      <span className="flex flex-col items-end gap-0.5">
        {row.position.value === null
          ? <span className="whitespace-nowrap text-[12px] text-secondary">{t("notInTop100")}</span>
          : <span className="font-mono text-[13px] text-foreground">{formatNumber(row.position.value)}</span>}
        <span className="whitespace-nowrap text-[11px] text-muted">{from}</span>
      </span>
    );
  };

  const pageCell = (row: Angle) => {
    if (!row.page) return <span className="text-[12px] text-muted">{t("pageVerdict.unjudged")}</span>;
    if (row.page.verdict === "NONE") return <StatusPill tone="warning">{t("pageVerdict.NONE")}</StatusPill>;
    if (row.page.verdict !== "ANSWERED" || !row.page.page) {
      return <span className="text-[12px] text-muted">{t(`pageVerdict.${row.page.verdict === "OFF_TOPIC" ? "OFF_TOPIC" : "UNSURE"}`)}</span>;
    }
    return (
      <RecordLinkCell cut href={recordHref({ kind: "page", page: row.page.page })} className="text-[13px] text-info">
        {row.page.page}
      </RecordLinkCell>
    );
  };

  const judgedAgainst = () => {
    const ranked = site?.counts.pages ?? 0;
    if (!answer?.audit) return t("judgedAgainstNoAudit", { ranked });
    return answer.audit.maxPages === null
      ? t("judgedAgainstNoLimit", { crawled: answer.audit.pagesCrawled, ranked })
      : t("judgedAgainst", { crawled: answer.audit.pagesCrawled, limit: answer.audit.maxPages, ranked });
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Telescope className="h-5 w-5 text-brand" />} title={t("title")} description={t(own ? "description" : "descriptionCompetitor")} />
      {answer && !answer.built ? <p className="text-[12px] text-muted">{t("notBuilt")}</p> : null}
      {/* What "None" was judged against, before the search box, as a list screen's explanation sits. */}
      {own ? (
        <p className="flex items-start gap-2 text-[12px] text-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          {judgedAgainst()}
        </p>
      ) : null}
      <div className="flex flex-col gap-3">
        <DataTable
          rows={pager.pageRows}
          rowKey={(row) => row.key}
          onRowClick={(row) => router.push(recordHref({ kind: "keyword", keyword: row.query }))}
          minWidthClassName={own ? "min-w-[1040px]" : "min-w-[760px]"}
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
              {own ? (
                <Select
                  chip={{ label: t("pageFilter"), choice: pageFilter ? t(`pageFilters.${pageFilter as PageFilter}`) : null }}
                  value={pageFilter}
                  onChange={setPageFilter}
                >
                  <option value="">{t("anyPage")}</option>
                  {PAGE_FILTERS.map((entry) => <option key={entry} value={entry}>{t(`pageFilters.${entry}`)}</option>)}
                </Select>
              ) : null}
            </>
          }
          cardHeader={
            <SiteTableBar
              footer={pager.footer}
              noun="angles"
              actions={
                <ListDownload
                  fileName={missingOnly ? "missing-topics" : "fan-out-queries"}
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
              <span className="text-[12px] text-secondary">
                {missingOnly ? t("mostSeenFirst") : t("fromQueries", { count: answer?.wordings ?? 0 })}
              </span>
            </SiteTableBar>
          }
          empty={{ icon: <Telescope className="h-8 w-8 text-muted/30" />, label: term || question || intent || tracked || pageFilter ? t("noMatch") : t("empty") }}
          footer={pager.footer}
          sort={tableSort}
          columns={[
            {
              key: "search",
              header: t("columns.search"),
              sortable: true,
              className: CUT_COLUMN.first,
              cell: (row) => (
                <span className="flex min-w-0 flex-col gap-0.5">
                  <RecordLinkCell cut href={recordHref({ kind: "keyword", keyword: row.query })}>{row.queryText}</RecordLinkCell>
                  <span title={row.prompt} className="truncate text-[11px] text-muted">{t("fromQuestion", { question: row.prompt })}</span>
                  {row.otherWordings.length > 0 ? (
                    <span title={row.otherWordings.join(", ")} className="truncate text-[11px] text-secondary">
                      {t("alsoSearchedAs", { wordings: row.otherWordings.map((wording) => `“${wording}”`).join(", ") })}
                    </span>
                  ) : null}
                </span>
              ),
            },
            { key: "intent", header: t("columns.intent"), cell: (row) => <IntentPill intent={row.intent} /> },
            { key: "engines", header: t("columns.engines"), sortable: true, cell: (row) => <span className="text-[12px] text-secondary">{row.engines.map(engineLabel).join(", ")}</span> },
            { key: "times", header: t("columns.times"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px]">{formatNumber(row.timesSeen)}</span> },
            ...(own ? [
              { key: "position", header: t("columns.position"), align: "right" as const, sortable: true, cell: positionCell },
              { key: "page", header: t("columns.page"), className: CUT_COLUMN.second, cell: pageCell },
            ] : []),
            { key: "tracked", header: t("columns.tracked"), cell: (row) => (row.tracked ? <StatusPill tone="success">{tc("yes")}</StatusPill> : <span className="text-muted">–</span>) },
          ]}
        />
      </div>
    </div>
  );
}
