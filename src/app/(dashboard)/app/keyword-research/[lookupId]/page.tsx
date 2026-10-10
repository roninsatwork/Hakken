"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, ListChecks, TextSearch } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/src/ui/components/screens/Button";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { Meter } from "@/src/ui/components/screens/Meter";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { CUT_COLUMN, PositionCell } from "../../sites/_components/SiteCells";
import { SiteViewSwitch } from "../../sites/_components/SiteViewSwitch";
import { formatCpc, formatNumber, formatVisits } from "../../sites/_components/siteFormat";
import { useSitePager } from "../../sites/_components/useSitePagedTable";
import { useSiteParam } from "../../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../sites/_components/useSiteSort";
import { LookupState } from "../_components/LookupState";
import { AnswersCard, ForWebsiteSection, IdeasCardWaiting, MonthsChart, SearchesByCountry, TopFive } from "../_components/OverviewParts";
import { DifficultyCell, FigureCell, IntentWord, ResearchSection, useCountryName, usePlaceIn } from "../_components/ResearchCells";
import { KeywordOpener, useOpenKeyword } from "../_components/KeywordActions";
import { IDEA_KEYS, IDEA_KINDS, difficultyWord, ideaKindOf, isIntent, type IdeaKey } from "../_components/researchWords";
import { ideasHref, lookupHref, useLookupIdeas, useLookupOverview, type LookupIdeas, type LookupOverview } from "../_components/useLookup";
import { ResearchSees } from "../_components/ResearchSees";
import { lookupSees } from "@/convex/sees/research";

/**
 * A keyword's overview (board 2 of the approved drawings, docs/plans/active/
 * keyword-research-plan.md): how many search for it, how hard the top ten
 * is, the visits the top result gets and what searchers want; what it means
 * for the website it is measured against; its last 24 months; its searches
 * by country; the first of its keyword ideas; Google's top five; and what
 * the AI says. While the Keyword research agent buys it the page says so and
 * fills in by itself; a lookup that failed says why, with Look up again.
 *
 * Opening the overview never buys the ideas or the AI's answers: each card
 * shows them once they are held, and until then says what they cost and
 * opens their own screen, which buys them.
 */
export default function LookupOverviewPage() {
  const t = useTranslations("keywordResearch.overview");
  const tk = useTranslations("keywordResearch");
  const lookup = useLookupOverview();
  // The lookup's layout draws the loading and not-found states.
  if (!lookup) return null;

  const host = lookup.forWebsite?.host ?? null;
  const figures = lookup.overview;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<TextSearch className="h-6 w-6 text-brand" />}
        title={t("title")}
        description={host ? t("description", { host }) : t("descriptionNoWebsite")}
      />
      <ResearchSees screen="overview" seen={lookupSees(lookup)} />
      {lookup.sample ? <Notice>{tk("sample")}</Notice> : null}
      <LookupState lookup={lookup} />
      {figures ? (
        <>
          <OverviewFigures lookup={lookup} figures={figures} />
          {lookup.forWebsite ? <ForWebsiteSection lookup={lookup} forWebsite={lookup.forWebsite} figures={figures} /> : null}
          <OverviewCharts lookup={lookup} figures={figures} />
          <IdeasPreview lookup={lookup} />
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <TopFive lookup={lookup} />
            <AnswersCard lookup={lookup} />
          </div>
        </>
      ) : lookup.state === "WAITING" ? (
        <div className="h-[104px] animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />
      ) : null}
    </div>
  );
}

type Figures = NonNullable<LookupOverview["overview"]>;

/** The four figures across the top: searches a month, difficulty, the visits the top result gets, and intent. */
function OverviewFigures({ lookup, figures }: { lookup: LookupOverview; figures: Figures }) {
  const t = useTranslations("keywordResearch.overview");
  const tk = useTranslations("keywordResearch");
  const ts = useTranslations("sites.keywordRecord.about.searchIntents");
  const countryName = useCountryName();
  const top = lookup.topResult;
  return (
    <FigureRow>
      <Figure
        label={t("volume")}
        value={figures.volume === null ? <NoFigure /> : formatNumber(figures.volume)}
        detail={<span className="text-secondary">{t("volumeDetail", { country: countryName(lookup.locationCode, lookup.country), cpc: formatCpc(figures.cpc) })}</span>}
      />
      <Figure
        label={t("difficulty")}
        value={figures.difficulty === null ? <NoFigure /> : (
          <>
            {figures.difficulty} <span className="text-[13px] font-normal text-secondary">{tk(`difficulty.${difficultyWord(figures.difficulty)}`)}</span>
          </>
        )}
        detail={
          <div className="mt-1 flex flex-col gap-2">
            <Meter value={figures.difficulty === null ? null : figures.difficulty / 100} size="md" />
            {figures.topTenLinkingSites !== null ? (
              <span className="text-secondary">{t("difficultyDetail", { count: formatNumber(figures.topTenLinkingSites) })}</span>
            ) : null}
          </div>
        }
      />
      <Figure
        label={t("topVisits")}
        href={lookupHref(lookup.lookupId, "results")}
        value={top ? formatVisits(top.visits) : <NoFigure />}
        detail={top ? (
          <span className="text-secondary">
            {top.keywords === null ? t("topVisitsDomain", { domain: top.domain }) : t("topVisitsDetail", { keywords: formatNumber(top.keywords), domain: top.domain })}
          </span>
        ) : undefined}
      />
      <Figure
        label={t("intent")}
        value={isIntent(figures.intent) ? tk(`intents.${figures.intent}`) : <NoFigure />}
        detail={isIntent(figures.intent) ? <span className="text-secondary">{ts(figures.intent)}</span> : undefined}
      />
    </FigureRow>
  );
}

/** The 24 months beside the searches by country, as drawn: the chart the wider. */
function OverviewCharts({ lookup, figures }: { lookup: LookupOverview; figures: Figures }) {
  const placeIn = usePlaceIn();
  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <MonthsChart lookup={lookup} figures={figures} place={placeIn(lookup.locationCode, lookup.country)} />
      <SearchesByCountry lookup={lookup} />
    </div>
  );
}

/** The Overview shows the first eight ideas of a kind, as drawn; the rest are on Keyword ideas. */
const IDEAS_SHOWN = 8;

type Idea = LookupIdeas["rows"][number];

const IDEA_SORTS: SiteSortColumns<Idea, "keyword" | "intent" | "volume" | "difficulty" | "position"> = {
  keyword: { value: (row) => row.keyword, first: "asc" },
  intent: { value: (row) => row.intent, first: "asc" },
  volume: { value: (row) => row.volume, first: "desc" },
  difficulty: { value: (row) => row.difficulty, first: "asc" },
  position: { value: (row) => row.position, first: "asc" },
};
const ideaKeyword = (row: Idea) => row.keyword;

/**
 * Keyword ideas on the Overview (board 2): the first eight of each kind, the
 * most searched first, once the ideas are held — and until then a line on
 * what they cost and the way to Keyword ideas, which buys them.
 */
function IdeasPreview({ lookup }: { lookup: LookupOverview }) {
  const t = useTranslations("keywordResearch.overview");
  const ti = useTranslations("keywordResearch.ideas");
  const tc = useTranslations("keywordResearch.columns");
  const router = useRouter();
  const [key, setKey] = useSiteParam<IdeaKey>("idea", "terms", IDEA_KEYS);
  const kind = ideaKindOf(key);
  const ideas = useLookupIdeas(kind);
  const first = ideas?.rows.slice(0, IDEAS_SHOWN);
  const { rows: sorted, tableSort } = useSiteSortedList(first, IDEA_SORTS, { opening: "volume", name: ideaKeyword, table: "ideas" });
  const pager = useSitePager(sorted, { table: "ideas" });
  const opener = useOpenKeyword({ locationCode: lookup.locationCode, siteId: lookup.forWebsite?.siteId ?? null });
  const counts = ideas?.counts ?? null;
  const held = counts !== null && IDEA_KINDS.some((entry) => counts[entry.kind] !== null);
  const total = counts?.[kind] ?? 0;

  if (!held) return <IdeasCardWaiting lookup={lookup} waiting={ideas?.state === "WAITING"} />;

  return (
    <ResearchSection title={t("ideasTitle")} description={t("ideasHint")}>
      <SiteViewSwitch
        label={ti("kindLabel")}
        value={key}
        onChange={setKey}
        options={IDEA_KINDS.map((entry) => ({
          value: entry.key,
          label: counts[entry.kind] !== null ? ti("kindWithCount", { kind: ti(`kinds.${entry.key}.title`), count: formatNumber(counts[entry.kind]) }) : ti(`kinds.${entry.key}.title`),
        }))}
      />
      <DataTable
        rows={pager.pageRows}
        rowKey={ideaKeyword}
        onRowClick={lookup.canLookUp ? (row) => void opener.open(row.keyword) : undefined}
        cardHeader={
          <TableBar
            title={ti(`kinds.${key}.title`)}
            noun="ideas"
            footer={{ isLoading: ideas === undefined, totalCount: total }}
            actions={
              total > 0 ? (
                <Button variant="quiet" onClick={() => router.push(ideasHref(lookup.lookupId, key))} className="inline-flex items-center gap-1.5">
                  {t("seeAllIdeas", { count: formatNumber(total) })}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              ) : undefined
            }
          />
        }
        empty={{ icon: <ListChecks className="h-8 w-8 text-muted/30" />, label: t("ideasKindNotYet") }}
        footer={{
          ...pager.footer,
          note: ti(`kinds.${key}.hint`, { keyword: lookup.keyword }),
          labels: { showing: (start: number, end: number) => t("ideasShowing", { start, end, total: formatNumber(total) }) },
        }}
        sort={tableSort}
        columns={[
          { key: "keyword", header: tc("keyword"), sortable: true, className: CUT_COLUMN.first, cell: (row) => <KeywordOpener keyword={row.keyword} canLookUp={lookup.canLookUp} opener={opener} /> },
          { key: "intent", header: tc("intent"), sortable: true, cell: (row) => <IntentWord intent={row.intent} /> },
          { key: "volume", header: tc("volume"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.volume} /> },
          { key: "difficulty", header: tc("difficulty"), align: "right", sortable: true, cell: (row) => <DifficultyCell value={row.difficulty} /> },
          {
            key: "position",
            header: tc("position"),
            align: "right",
            sortable: true,
            cell: (row) => (row.position === null ? <NoFigure /> : <PositionCell position={row.position} />),
          },
        ]}
      />
    </ResearchSection>
  );
}
