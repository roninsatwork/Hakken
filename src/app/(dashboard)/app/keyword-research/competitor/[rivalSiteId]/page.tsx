"use client";

import { useState } from "react";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { TextSearch } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import Header from "@/src/ui/components/layout/Header";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { DataTable, type DataTableColumn } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { BackRow, DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { CUT_COLUMN, IntentText } from "../../../sites/_components/SiteCells";
import { ListDownload } from "../../../sites/_components/SiteDownloads";
import { formatNumber } from "../../../sites/_components/siteFormat";
import { useSitePager } from "../../../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../sites/_components/useSiteSort";
import { CompetitorPicker, useCompetitorStarts, usePreparedGap } from "../../_components/CompetitorStarts";
import { AddTickedToList, KeywordOpener, useOpenKeyword } from "../../_components/KeywordActions";
import { DifficultyCell, FigureCell } from "../../_components/ResearchCells";
import { KEYWORD_RESEARCH_HREF } from "../../_components/useLookup";

type Gap = NonNullable<FunctionReturnType<typeof api.keywordResearchCompetitors.competitorGap>>;
type Row = Gap["rows"][number];

/** The most searched first, as it opens; a keyword A to Z; its best position; the easiest. */
const SORTS: SiteSortColumns<Row, "keyword" | "theirs" | "yours" | "volume" | "difficulty" | "intent"> = {
  keyword: { value: (row) => row.keyword, first: "asc" },
  theirs: { value: (row) => row.position, first: "asc" },
  // Always blank: a gap is a search the website does not rank for at all.
  yours: { value: () => null, first: "asc" },
  volume: { value: (row) => row.volume, first: "desc" },
  difficulty: { value: (row) => row.difficulty, first: "asc" },
  intent: { value: (row) => row.intent, first: "asc" },
};
const keywordOf = (row: Row) => row.keyword;
/** Sites' own words for what a search is for: the rank intents Content gap carries. */
const INTENT_CHOICES = ["", "BUYING", "RESEARCHING", "BRANDED", "IRRELEVANT", "OTHER"] as const;

/**
 * Start from a competitor (board 6 of the approved drawings,
 * docs/plans/active/keyword-research-plan.md): the searches a competitor
 * ranks for on Google that the website doesn't rank for at all, the most
 * searched first — Content gap, from what Websites already holds, so there is
 * no cost. Tick keywords to add them to a research list; open one to look it
 * up, at the usual cost.
 */
export default function CompetitorStartPage() {
  const t = useTranslations("keywordResearch.start");
  const tk = useTranslations("keywordResearch");
  const tc = useTranslations("keywordResearch.columns");
  const ti = useTranslations("sites.common.intents");
  const pathname = usePathname();
  const params = useParams<{ rivalSiteId: string }>();
  const search = useSearchParams();
  const setup = useQuery(api.keywordResearch.researchSetup, {});
  const asked = search.get("site");
  const website = setup?.websites.find((entry) => entry.siteId === asked) ?? setup?.websites[0] ?? null;
  const siteId = (website?.siteId ?? null) as Id<"companyWebsites"> | null;
  const rivalSiteId = params.rivalSiteId as Id<"companyWebsites">;
  const starts = useCompetitorStarts(siteId);
  const gap = useQuery(api.keywordResearchCompetitors.competitorGap, siteId ? { siteId, rivalSiteId } : "skip");
  // Where it is above you: Websites' own comparison of the two on the company's tracked searches.
  const compared = useQuery(api.siteCompetitors.listRivals, siteId ? { siteId } : "skip");
  const rivalWebsite = starts?.rivals.find((entry) => entry.rivalSiteId === rivalSiteId)?.host;
  const aboveYou = compared?.find((entry) => entry.host === rivalWebsite)?.beatsYouOn ?? null;
  usePreparedGap(siteId, gap?.preparing === true);
  const [text, setText, settled] = useSiteSearch();
  const [intent, setIntent] = useSiteParam<(typeof INTENT_CHOICES)[number]>("intent", "", INTENT_CHOICES);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [done, setDone] = useState<string | null>(null);
  const canLookUp = setup?.canLookUp === true;
  // Keywords are looked up in the website's own country, measured against it.
  const place = { locationCode: website?.homeCountry ?? 0, siteId };
  const opener = useOpenKeyword(place);

  const matches = wordStartMatcher(settled.toLowerCase());
  const found = gap === undefined || gap?.preparing ? undefined : (gap?.rows ?? []).filter((row) => (!matches || matches(row.keyword)) && (!intent || row.intent === intent));
  const { rows: sorted, tableSort } = useSiteSortedList(found, SORTS, { opening: "volume", name: keywordOf });
  const paged = useSitePager(sorted);

  if (setup !== undefined && (!siteId || gap === null)) {
    return (
      <>
        <Header />
        <div className="flex flex-col gap-6 pb-8">
          <BackRow label={t("back")} href={KEYWORD_RESEARCH_HREF} />
          <HakkenEmptyState icon={TextSearch} title={t("notFoundTitle")} description={t("notFoundBody")} />
        </div>
      </>
    );
  }

  const host = gap?.host ?? website?.host ?? "";
  const rivalHost = gap?.rivalHost ?? starts?.rivals.find((rival) => rival.rivalSiteId === rivalSiteId)?.host ?? "";
  const tickedNow = (gap?.rows ?? []).filter((row) => ticked.has(row.keyword)).map(keywordOf);
  const onPage = paged.pageRows ?? [];
  const allTicked = onPage.length > 0 && onPage.every((row) => ticked.has(row.keyword));
  const tick = (keywords: string[], next: boolean) => {
    setDone(null);
    setTicked((before) => {
      const after = new Set(before);
      for (const keyword of keywords) {
        if (next) after.add(keyword);
        else after.delete(keyword);
      }
      return after;
    });
  };

  const columns: DataTableColumn<Row>[] = [
    ...(canLookUp
      ? [{
          key: "tick",
          header: <Checkbox label={t("tickPage")} labelHidden checked={allTicked} disabled={onPage.length === 0} onChange={(next) => tick(onPage.map(keywordOf), next)} />,
          className: "w-11",
          cell: (row: Row) => <Checkbox label={t("tick", { keyword: row.keyword })} labelHidden checked={ticked.has(row.keyword)} onChange={(next) => tick([row.keyword], next)} />,
        }]
      : []),
    { key: "keyword", header: tc("keyword"), sortable: true, className: CUT_COLUMN.first, cell: (row) => <KeywordOpener keyword={row.keyword} canLookUp={canLookUp} opener={opener} /> },
    { key: "theirs", header: t("itsPosition"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.position} /> },
    { key: "yours", header: t("yours"), align: "right", sortable: true, cell: () => <NoFigure /> },
    { key: "volume", header: tc("volume"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.volume} /> },
    { key: "difficulty", header: tc("difficulty"), align: "right", sortable: true, cell: (row) => <DifficultyCell value={row.difficulty} /> },
    { key: "intent", header: tc("intent"), sortable: true, cell: (row) => <IntentText intent={row.intent} /> },
  ];

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <DetailHeader
          back={{ label: t("back"), href: KEYWORD_RESEARCH_HREF }}
          icon={<TextSearch className="h-6 w-6 text-brand" />}
          title={t("title")}
          description={rivalHost && host ? t("pageDescription", { rival: rivalHost, host }) : undefined}
          pills={<StatusLabel tone="success">{t("noCost")}</StatusLabel>}
          action={siteId && starts && starts.rivals.length > 0 ? <CompetitorPicker siteId={siteId} rivalSiteId={rivalSiteId} rivals={starts.rivals} /> : undefined}
        />

        <FigureRow>
          <Figure
            label={t("ranksFor")}
            value={gap?.ranksFor == null ? <NoFigure /> : formatNumber(gap.ranksFor)}
            detail={<span className="text-secondary">{t("ranksForDetail", { country: setup?.countries.find((entry) => entry.code === website?.homeCountry)?.label ?? "" })}</span>}
          />
          <Figure
            label={t("thatYouDont")}
            value={found === undefined ? <NoFigure /> : formatNumber(gap?.rows.length ?? 0)}
            detail={<span className="text-secondary">{t("listedBelow")}</span>}
            emphasis
          />
          <Figure
            label={t("aboveYou")}
            value={aboveYou === null ? <NoFigure /> : formatNumber(aboveYou)}
            detail={<span className="text-secondary">{t("aboveYouDetail")}</span>}
          />
          <Figure
            label={t("visits")}
            value={gap?.visits == null ? <NoFigure /> : formatNumber(Math.round(gap.visits))}
            detail={<span className="text-secondary">{t("visitsDetail")}</span>}
          />
        </FigureRow>

        <DataTable
          rows={paged.pageRows}
          rowKey={keywordOf}
          onRowClick={canLookUp ? (row) => void opener.open(row.keyword) : undefined}
          rowClassName={(row) => (ticked.has(row.keyword) ? "bg-brand/5" : "")}
          search={{ value: text, onChange: setText, placeholder: tk("past.search") }}
          filters={
            <Select chip={{ label: tk("past.intent"), choice: intent ? ti(intent) : null }} value={intent} onChange={(value) => setIntent(value as (typeof INTENT_CHOICES)[number])}>
              <option value="">{tk("past.everyIntent")}</option>
              {INTENT_CHOICES.filter(Boolean).map((option) => <option key={option} value={option}>{ti(option)}</option>)}
            </Select>
          }
          cardHeader={
            <TableBar
              footer={paged.footer}
              noun="keywords"
              actions={
                <>
                  {done ? <StatusLabel tone="success">{done}</StatusLabel> : null}
                  {canLookUp ? (
                    <AddTickedToList
                      keywords={tickedNow}
                      idleLabel={t("tickFirst")}
                      place={place}
                      back={`${pathname}?site=${siteId ?? ""}`}
                      onAdded={(list, added) => {
                        setTicked(new Set());
                        setDone(t("added", { count: added, list }));
                      }}
                    />
                  ) : null}
                  <ListDownload
                    fileName={`start-from-${rivalHost || "competitor"}`}
                    rows={sorted}
                    columns={[
                      { header: tc("keyword"), value: (row) => row.keyword },
                      { header: t("itsPosition"), value: (row) => row.position },
                      { header: tc("volume"), value: (row) => row.volume },
                      { header: tc("difficulty"), value: (row) => row.difficulty },
                      { header: tc("intent"), value: (row) => ti(INTENT_CHOICES.includes(row.intent as never) ? row.intent : "OTHER") },
                    ]}
                  />
                </>
              }
            />
          }
          empty={{ icon: <TextSearch className="h-8 w-8 text-muted/30" />, label: settled || intent ? tk("past.noMatch") : t("empty", { rival: rivalHost, host }) }}
          footer={{ ...paged.footer, note: t("note", { host }) }}
          sort={tableSort}
          columns={columns}
        />
      </div>
    </>
  );
}
