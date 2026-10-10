"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Check, ListChecks, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { formatDate } from "@/src/lib/dates";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import Header from "@/src/ui/components/layout/Header";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { DataTable, type DataTableColumn } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { Notice } from "@/src/ui/components/screens/Notice";
import { BackRow, DetailHeader, PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { CUT_COLUMN, ExternalUrlCell, RecordLinkCell } from "../../../sites/_components/SiteCells";
import { ListDownload } from "../../../sites/_components/SiteDownloads";
import { formatNumber } from "../../../sites/_components/siteFormat";
import { useSitePager } from "../../../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../sites/_components/useSiteSort";
import { DifficultyCell, FigureCell, IntentWord, ResearchPositionCell, VerdictLabel } from "../../_components/ResearchCells";
import { VERDICTS, isIntent, keywordKey, pathOf, verdictRank, type Verdict } from "../../_components/researchWords";
import { KEYWORD_RESEARCH_HREF, listHref, lookupHref } from "../../_components/useLookup";
import { ResearchSees } from "../../_components/ResearchSees";
import { researchListSees } from "@/convex/utils/sees/research";

type List = NonNullable<FunctionReturnType<typeof api.keywordResearch.researchList>>;
type Row = List["rows"][number];

/** The most searched first, as it opens; a keyword A to Z; the easiest; the best position; the best answer. */
const SORTS: SiteSortColumns<Row, "keyword" | "volume" | "difficulty" | "intent" | "position" | "verdict"> = {
  keyword: { value: (row) => row.text.toLowerCase(), first: "asc" },
  volume: { value: (row) => row.volume, first: "desc" },
  difficulty: { value: (row) => row.difficulty, first: "asc" },
  intent: { value: (row) => row.intent, first: "asc" },
  position: { value: (row) => row.position, first: "asc" },
  verdict: { value: (row) => verdictRank(row.verdict), first: "asc" },
};
const textOf = (row: Row) => row.text.toLowerCase();
const rowKey = (row: Row) => keywordKey(row.keyword, row.locationCode);
const VERDICT_CHOICES = ["", ...VERDICTS] as const;

/**
 * A research list (board 7 of the approved drawings, docs/plans/active/
 * keyword-research-plan.md): its keywords with their figures, where the
 * website stands for each and whether each is worth it — then tick the ones
 * worth it and Track copies them into the website's tracked Google searches.
 * The list and the tracked searches never sync (tracked-lists-stay-separate):
 * taking a keyword off the list leaves it tracked. A read-only account reads
 * the list with no ticks, Track or remove.
 */
export default function ResearchListPage() {
  const t = useTranslations("keywordResearch.list");
  const tk = useTranslations("keywordResearch");
  const tc = useTranslations("keywordResearch.columns");
  const router = useRouter();
  const params = useParams<{ listId: string }>();
  const listId = params.listId as Id<"researchLists">;
  const list = useQuery(api.keywordResearch.researchList, { listId });
  const lookups = useQuery(api.keywordResearch.pastLookups, {});
  const track = useMutation(api.keywordResearch.trackFromResearchList);
  const remove = useMutation(api.keywordResearch.removeFromResearchList);
  const { run, isBusy } = useAdminAction({ scope: "keyword-research-list" });
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [done, setDone] = useState<string | null>(null);
  const [search, setSearch, settled] = useSiteSearch();
  const [worth, setWorth] = useSiteParam<(typeof VERDICT_CHOICES)[number]>("worth", "", VERDICT_CHOICES);

  const matches = wordStartMatcher(settled.toLowerCase());
  const found = list?.rows.filter((row) => (!matches || matches(row.text)) && (!worth || row.verdict === worth));
  const { rows: sorted, tableSort } = useSiteSortedList(found, SORTS, { opening: "volume", name: textOf });
  const paged = useSitePager(sorted);

  if (list === undefined) {
    return (
      <>
        <Header />
        <div className="h-24 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />
      </>
    );
  }
  if (list === null) {
    return (
      <>
        <Header />
        <div className="flex flex-col gap-6 pb-8">
          <BackRow label={t("back")} href={KEYWORD_RESEARCH_HREF} />
          <HakkenEmptyState icon={ListChecks} title={t("notFoundTitle")} description={t("notFoundBody")} />
        </div>
      </>
    );
  }

  const host = list.host;
  const canTrack = list.canChange && host !== null;
  // A keyword links to its lookup: every keyword on a list came from one the company looked up.
  const lookupOf = new Map((lookups ?? []).map((lookup) => [keywordKey(lookup.keyword, lookup.locationCode), lookup.lookupId]));
  const open = (sorted ?? []).filter((row) => !row.tracked);
  const tickedRows = list.rows.filter((row) => ticked.has(rowKey(row)) && !row.tracked);
  const allTicked = open.length > 0 && open.every((row) => ticked.has(rowKey(row)));
  const count = (verdict: Verdict) => list.rows.filter((row) => row.verdict === verdict).length;
  const volume = list.rows.reduce((sum, row) => sum + (row.volume ?? 0), 0);

  const tick = (row: Row, next: boolean) => {
    setDone(null);
    setTicked((before) => {
      const after = new Set(before);
      if (next) after.add(rowKey(row));
      else after.delete(rowKey(row));
      return after;
    });
  };
  const trackTicked = async () => {
    const outcome = await run(() => track({ listId, keywords: tickedRows.map((row) => row.keyword) }), { key: "track", fallbackMessage: t("trackFailed") });
    if (!outcome.ok) return;
    setTicked(new Set());
    setDone(t("nowTracked", { count: outcome.data.tracked, host: host ?? "" }));
  };
  const takeOff = async (row: Row) => {
    const outcome = await run(() => remove({ listId, items: [{ keyword: row.keyword, locationCode: row.locationCode }] }), {
      key: rowKey(row),
      fallbackMessage: t("removeFailed"),
    });
    if (outcome.ok) setDone(t("removed", { keyword: row.text }));
  };

  const columns: DataTableColumn<Row>[] = [
    ...(canTrack
      ? [{
          key: "tick",
          header: (
            <Checkbox
              label={t("tickAll")}
              labelHidden
              checked={allTicked}
              disabled={open.length === 0}
              onChange={(next) => {
                setDone(null);
                setTicked(next ? new Set(open.map(rowKey)) : new Set());
              }}
            />
          ),
          className: "w-11",
          cell: (row: Row) => <Checkbox label={t("tick", { keyword: row.text })} labelHidden checked={!row.tracked && ticked.has(rowKey(row))} disabled={row.tracked} onChange={(next) => tick(row, next)} />,
        }]
      : []),
    {
      key: "keyword",
      header: tc("keyword"),
      sortable: true,
      className: CUT_COLUMN.first,
      cell: (row) => {
        const lookupId = lookupOf.get(rowKey(row));
        return lookupId
          ? <RecordLinkCell href={lookupHref(lookupId)} cut>{row.text}</RecordLinkCell>
          : <span title={row.text} className="block truncate text-[13px] text-foreground">{row.text}</span>;
      },
    },
    { key: "volume", header: tc("volume"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.volume} /> },
    { key: "difficulty", header: tc("difficulty"), align: "right", sortable: true, cell: (row) => <DifficultyCell value={row.difficulty} /> },
    { key: "intent", header: tc("intent"), sortable: true, cell: (row) => <IntentWord intent={row.intent} /> },
    {
      key: "position",
      header: tc("position"),
      align: "right",
      sortable: true,
      cell: (row) => <ResearchPositionCell position={row.position} notInTop100={host !== null && row.position === null && row.verdict !== null} />,
    },
    {
      key: "page",
      header: tc("yourPage"),
      className: CUT_COLUMN.second,
      cell: (row) => (row.url ? <ExternalUrlCell url={row.url} label={pathOf(row.url)} cut /> : host ? <span className="text-[12px] text-muted">{t("noPage")}</span> : <NoFigure />),
    },
    { key: "verdict", header: tc("worthIt"), sortable: true, cell: (row) => (host ? <VerdictLabel verdict={row.verdict} /> : <NoFigure />) },
    {
      key: "tracked",
      header: tc("tracked"),
      className: "text-center",
      cell: (row) => (row.tracked ? (
        <span>
          <Check className="inline h-4 w-4 text-success" aria-hidden="true" />
          <span className="sr-only">{t("trackedYes")}</span>
        </span>
      ) : <NoFigure />),
    },
    ...(list.canChange
      ? [{
          key: "remove",
          hiddenHeader: t("remove"),
          cell: (row: Row) => (
            <RowActions alwaysVisible>
              <RowIconButton label={t("remove")} onClick={() => void takeOff(row)}>
                <Trash2 className="h-4 w-4" />
              </RowIconButton>
            </RowActions>
          ),
        }]
      : []),
  ];

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <DetailHeader
          back={{ label: t("back"), href: KEYWORD_RESEARCH_HREF }}
          icon={<ListChecks className="h-6 w-6 text-brand" />}
          title={
            <>
              {list.name}
              {list.canChange ? (
                <RowIconButton label={tk("lists.rename")} onClick={() => router.push(`${listHref(list.listId)}/rename`)}>
                  <Pencil className="h-4 w-4" />
                </RowIconButton>
              ) : null}
            </>
          }
          description={t(host ? "description" : "descriptionNoWebsite", { host: host ?? "", who: list.createdBy ?? t("someone"), day: formatDate(list.createdAt) })}
        />
        <ResearchSees screen="list" seen={list ? researchListSees(list) : list} />

        <Notice>{host ? t("notice", { host }) : t("noticeNoWebsite")}</Notice>

        <FigureRow>
          <Figure
            label={t("keywords")}
            value={formatNumber(list.rows.length)}
            detail={<span className="text-secondary">{t("keywordsDetail", { count: list.rows.filter((row) => row.tracked).length })}</span>}
          />
          <Figure label={t("volume")} value={formatNumber(volume)} detail={<span className="text-secondary">{t("volumeDetail")}</span>} />
          <Figure label={tk("verdicts.NEW_PAGE")} value={host ? formatNumber(count("NEW_PAGE")) : <NoFigure />} detail={<span className="text-secondary">{t("newPageDetail")}</span>} />
          <Figure label={tk("verdicts.IMPROVE")} value={host ? formatNumber(count("IMPROVE")) : <NoFigure />} detail={<span className="text-secondary">{t("improveDetail")}</span>} />
        </FigureRow>

        <DataTable
          rows={paged.pageRows}
          rowKey={rowKey}
          rowClassName={(row) => (row.tracked || ticked.has(rowKey(row)) ? "bg-brand/5" : "")}
          search={{ value: search, onChange: setSearch, placeholder: t("search") }}
          filters={
            host ? (
              <Select
                chip={{ label: t("worthIt"), choice: worth ? tk(`verdicts.${worth}`) : null }}
                value={worth}
                onChange={(value) => setWorth(value as (typeof VERDICT_CHOICES)[number])}
              >
                <option value="">{t("everyAnswer")}</option>
                {VERDICTS.map((verdict) => <option key={verdict} value={verdict}>{tk(`verdicts.${verdict}`)}</option>)}
              </Select>
            ) : null
          }
          cardHeader={
            <TableBar
              footer={paged.footer}
              noun="keywords"
              actions={
                <>
                  {done ? <StatusLabel tone="success">{done}</StatusLabel> : null}
                  {canTrack ? (
                    <PagePrimaryAction icon={<Check className="h-4 w-4" />} disabled={tickedRows.length === 0 || isBusy("track")} onClick={() => void trackTicked()}>
                      {tickedRows.length > 0 ? t("track", { count: tickedRows.length, host: host ?? "" }) : t("tickToTrack")}
                    </PagePrimaryAction>
                  ) : null}
                  <ListDownload
                    fileName="research-list"
                    rows={sorted}
                    columns={[
                      { header: tc("keyword"), value: (row) => row.text },
                      { header: tc("volume"), value: (row) => row.volume },
                      { header: tc("difficulty"), value: (row) => row.difficulty },
                      { header: tc("intent"), value: (row) => (isIntent(row.intent) ? tk(`intents.${row.intent}`) : row.intent) },
                      { header: tc("position"), value: (row) => row.position },
                      { header: tc("yourPage"), value: (row) => row.url },
                      { header: tc("worthIt"), value: (row) => (row.verdict ? tk(`verdicts.${row.verdict}`) : null) },
                      { header: tc("tracked"), value: (row) => (row.tracked ? t("trackedYes") : null) },
                    ]}
                  />
                </>
              }
            />
          }
          empty={{ icon: <ListChecks className="h-8 w-8 text-muted/30" />, label: settled || worth ? t("noMatch") : t("empty") }}
          footer={{ ...paged.footer, note: host ? t("note", { host }) : t("noteNoWebsite") }}
          sort={tableSort}
          columns={columns}
        />
      </div>
    </>
  );
}
