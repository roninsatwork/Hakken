"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { ExternalUrlCell, PageTypeText } from "../../../sites/_components/SiteCells";
import { ListDownload } from "../../../sites/_components/SiteDownloads";
import { SiteViewSwitch } from "../../../sites/_components/SiteViewSwitch";
import { formatVisits } from "../../../sites/_components/siteFormat";
import { formatDate } from "@/src/lib/dates";
import { useSitePager } from "../../../sites/_components/useSitePagedTable";
import { useSiteParam } from "../../../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../sites/_components/useSiteSort";
import { LookupState } from "../../_components/LookupState";
import { WhereYouAre, WhoLabel } from "../../_components/WhereYouAre";
import { FigureCell, usePlaceIn, useProblemWords } from "../../_components/ResearchCells";
import { readableAddress } from "../../_components/researchWords";
import { useLookupId, useLookupOverview } from "../../_components/useLookup";
import { ResearchSees } from "../../_components/ResearchSees";
import { resultsSees } from "@/convex/sees/research";

type Results = NonNullable<FunctionReturnType<typeof api.keywordResearch.lookupResults>>;
type Row = Results["rows"][number];

/** The order Google gave, as it opens; then the strongest, the most linked, visited and ranking first. */
const SORTS: SiteSortColumns<Row, "position" | "strength" | "linking" | "visits" | "keywords"> = {
  position: { value: (row) => row.position, first: "asc" },
  strength: { value: (row) => row.strength, first: "desc" },
  linking: { value: (row) => row.linkingSites, first: "desc" },
  visits: { value: (row) => row.visits, first: "desc" },
  keywords: { value: (row) => row.keywords, first: "desc" },
};
const urlOf = (row: Row) => row.url;
const VIEWS = ["all", "ours"] as const;


/**
 * Google's results (board 3 of the approved drawings, docs/plans/active/
 * keyword-research-plan.md): the top ten in Google's order, each page's
 * strength, the websites linking to it, its visits, the searches it ranks for
 * and its top one — the website's own rows marked — then where the website
 * and its competitors are in the top 100. Opening it the first time buys the
 * top ten's figures (`openResults`); the table fills in as they arrive.
 */
export default function LookupResultsPage() {
  const t = useTranslations("keywordResearch.results");
  const tk = useTranslations("keywordResearch");
  const problemWords = useProblemWords();
  const tc = useTranslations("keywordResearch.columns");
  const placeIn = usePlaceIn();
  const lookupId = useLookupId();
  const lookup = useLookupOverview();
  const results = useQuery(api.keywordResearch.lookupResults, { lookupId });
  const openResults = useMutation(api.keywordResearch.openResults);
  const { run } = useAdminAction({ scope: "keyword-research-results" });
  const [view, setView] = useSiteParam<(typeof VIEWS)[number]>("show", "all", VIEWS);

  // Opened: the top ten's strength, linking websites and top keyword are bought
  // the first time, and again once older than the company's days. Once a lookup.
  const opened = useRef<string | null>(null);
  const ready = lookup?.state === "READY" && lookup.canLookUp;
  useEffect(() => {
    if (!ready || opened.current === lookupId) return;
    opened.current = lookupId;
    void run(() => openResults({ lookupId }), { fallbackMessage: t("openFailed") });
  }, [ready, lookupId, openResults, run, t]);

  const measured = Boolean(lookup?.forWebsite);
  const shown = results?.rows.filter((row) => view === "all" || !measured || row.who !== null);
  const { rows: sorted, tableSort } = useSiteSortedList(shown, SORTS, { opening: "position", name: urlOf });
  const paged = useSitePager(sorted);
  if (!lookup) return null;


  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<Search className="h-6 w-6 text-brand" />}
        title={t("title")}
        description={results?.from ? t("descriptionFrom", { city: results.from }) : t("description", { place: placeIn(lookup.locationCode, lookup.country) })}
      />
      <ResearchSees screen="results" seen={results ? resultsSees(results) : results} />
      {results?.sample ? <Notice>{tk("sample")}</Notice> : null}
      {lookup.state !== "READY" ? <LookupState lookup={lookup} /> : null}
      {results?.state === "WAITING" ? <Notice>{t("waiting")}</Notice> : null}
      {lookup.state === "READY" && results?.state === "FAILED" ? <Notice tone="warning">{problemWords(results.problem, t("failed"))}</Notice> : null}
      {measured ? (
        <SiteViewSwitch
          label={t("which")}
          value={view}
          onChange={setView}
          options={[{ value: "all", label: t("every") }, { value: "ours", label: t("ours") }]}
        />
      ) : null}

      <DataTable
        rows={paged.pageRows}
        rowKey={(row) => `${row.position}-${row.url}`}
        rowClassName={(row) => (row.who === "YOU" ? "bg-brand/5" : "")}
        cardHeader={
          <TableBar
            footer={paged.footer}
            noun="pages"
            actions={
              <ListDownload
                fileName="google-results"
                rows={sorted}
                columns={[
                  { header: "#", value: (row) => row.position },
                  { header: tc("page"), value: (row) => row.url },
                  { header: tc("title"), value: (row) => row.title },
                  { header: tc("kind"), value: (row) => row.kind },
                  { header: tc("strength"), value: (row) => row.strength },
                  { header: tc("linkingWebsites"), value: (row) => row.linkingSites },
                  { header: tc("traffic"), value: (row) => row.visits },
                  { header: tc("keywords"), value: (row) => row.keywords },
                  { header: tc("topKeyword"), value: (row) => row.topKeyword },
                ]}
              />
            }
          >
            {results?.checkedAt ? <TagLabel>{t("checked", { day: formatDate(results.checkedAt) })}</TagLabel> : null}
          </TableBar>
        }
        empty={{ icon: <Search className="h-8 w-8 text-muted/30" />, label: view === "ours" && measured ? t("noneOurs") : t("empty") }}
        footer={{ ...paged.footer, note: t("note") }}
        sort={tableSort}
        columns={[
          { key: "position", header: "#", sortable: true, className: "w-12", cell: (row) => <span className="font-mono text-[12px] tabular-nums text-secondary">{row.position}</span> },
          {
            key: "page",
            header: tc("page"),
            className: "w-[28%]",
            cell: (row) => (
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="break-words text-[13px] text-foreground">{row.title}</span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <ExternalUrlCell url={row.url} label={readableAddress(row.url)} />
                  <WhoLabel who={row.who} />
                </span>
              </span>
            ),
          },
          { key: "kind", header: tc("kind"), cell: (row) => <PageTypeText type={row.kind} /> },
          { key: "strength", header: tc("strength"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.strength} /> },
          { key: "linking", header: tc("linkingWebsites"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.linkingSites} /> },
          { key: "visits", header: tc("traffic"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.visits} text={formatVisits(row.visits)} /> },
          { key: "keywords", header: tc("keywords"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.keywords} /> },
          {
            key: "topKeyword",
            header: tc("topKeyword"),
            className: "w-[15%]",
            cell: (row) => (row.topKeyword ? <span className="break-words text-[13px] text-foreground">{row.topKeyword}</span> : <NoFigure />),
          },
        ]}
      />

      {results ? <WhereYouAre beyond={results.beyond} /> : null}
    </div>
  );
}
