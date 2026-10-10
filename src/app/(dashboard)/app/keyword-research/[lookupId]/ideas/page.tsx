"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useMutation } from "convex/react";
import { ListChecks } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { formatDate } from "@/src/lib/dates";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { DataTable, type DataTableColumn } from "@/src/ui/components/screens/DataTable";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { ExternalUrlCell, PositionCell } from "../../../sites/_components/SiteCells";
import { ListDownload } from "../../../sites/_components/SiteDownloads";
import { SiteViewSwitch } from "../../../sites/_components/SiteViewSwitch";
import { formatCpc, formatNumber } from "../../../sites/_components/siteFormat";
import { useSitePager } from "../../../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../sites/_components/useSiteSort";
import { AddTickedToList, KeywordOpener, useOpenKeyword } from "../../_components/KeywordActions";
import { LookupState } from "../../_components/LookupState";
import { DifficultyCell, FigureCell, IntentWord, useProblemWords } from "../../_components/ResearchCells";
import {
  DIFFICULTY_BANDS,
  IDEA_KEYS,
  IDEA_KINDS,
  INTENTS,
  ideaKindOf,
  isIntent,
  pathOf,
  type DifficultyBand,
  type IdeaKey,
} from "../../_components/researchWords";
import { useLookupId, useLookupIdeas, useLookupOverview, type LookupIdeas } from "../../_components/useLookup";
import { ResearchSees } from "../../_components/ResearchSees";
import { ideasSees } from "@/convex/sees/research";

type Row = LookupIdeas["rows"][number];

/** The most searched first, as it opens; a keyword A to Z; the easiest; the dearest; the best position. */
const SORTS: SiteSortColumns<Row, "keyword" | "intent" | "volume" | "difficulty" | "cpc" | "position"> = {
  keyword: { value: (row) => row.keyword, first: "asc" },
  intent: { value: (row) => row.intent, first: "asc" },
  volume: { value: (row) => row.volume, first: "desc" },
  difficulty: { value: (row) => row.difficulty, first: "asc" },
  cpc: { value: (row) => row.cpc, first: "desc" },
  position: { value: (row) => row.position, first: "asc" },
};
const keywordOf = (row: Row) => row.keyword;
const INTENT_CHOICES = ["", ...INTENTS] as const;
const BAND_CHOICES = ["", "easy", "medium", "hard"] as const;
const YOU_CHOICES = ["", "ranks", "not"] as const;

/**
 * Keyword ideas (board 5 of the approved drawings, docs/plans/active/
 * keyword-research-plan.md): terms match, questions, and what the pages in
 * Google's top ten also rank for — the kind in the address — each with its
 * figures and where the website measured stands for it. Opening the screen
 * buys what is not held (`openIdeas`), and the table fills in as it arrives.
 * Tick ideas to add them to a research list; open one to look it up, at the
 * usual cost.
 */
export default function LookupIdeasPage() {
  const t = useTranslations("keywordResearch.ideas");
  const tk = useTranslations("keywordResearch");
  const problemWords = useProblemWords();
  const tc = useTranslations("keywordResearch.columns");
  const pathname = usePathname();
  const lookupId = useLookupId();
  const lookup = useLookupOverview();
  const [key, setKey] = useSiteParam<IdeaKey>("kind", "terms", IDEA_KEYS);
  const ideas = useLookupIdeas(ideaKindOf(key));
  const openIdeas = useMutation(api.keywordResearchIdeas.openIdeas);
  const { run } = useAdminAction({ scope: "keyword-research-ideas" });
  const [search, setSearch, settled] = useSiteSearch();
  const [intent, setIntent] = useSiteParam<(typeof INTENT_CHOICES)[number]>("intent", "", INTENT_CHOICES);
  const [band, setBand] = useSiteParam<(typeof BAND_CHOICES)[number]>("kd", "", BAND_CHOICES);
  const [you, setYou] = useSiteParam<(typeof YOU_CHOICES)[number]>("you", "", YOU_CHOICES);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [done, setDone] = useState<string | null>(null);
  const opener = useOpenKeyword({ locationCode: lookup?.locationCode ?? 0, siteId: lookup?.forWebsite?.siteId ?? null });

  // Opened: what is not held and fresh is bought, once a visit. A read-only account buys nothing.
  const opened = useRef<string | null>(null);
  const ready = lookup?.state === "READY" && lookup.canLookUp;
  useEffect(() => {
    if (!ready || opened.current === lookupId) return;
    opened.current = lookupId;
    void run(() => openIdeas({ lookupId }), { fallbackMessage: t("openFailed") });
  }, [ready, lookupId, openIdeas, run, t]);

  const matches = wordStartMatcher(settled.toLowerCase());
  const measured = Boolean(ideas?.host);
  const found = ideas?.rows.filter((row) => {
    if (matches && !matches(row.keyword)) return false;
    if (intent && row.intent !== intent) return false;
    if (band) {
      const [low, high] = DIFFICULTY_BANDS[band as DifficultyBand];
      if (row.difficulty === null || row.difficulty < low || row.difficulty > high) return false;
    }
    if (you === "ranks" && row.position === null) return false;
    if (you === "not" && row.position !== null) return false;
    return true;
  });
  const { rows: sorted, tableSort } = useSiteSortedList(found, SORTS, { opening: "volume", name: keywordOf });
  const paged = useSitePager(sorted);
  if (!lookup) return null;

  const canLookUp = lookup.canLookUp;
  const kind = ideaKindOf(key);
  const counts = ideas?.counts ?? null;
  const bought = ideas?.rows.length ?? 0;
  const total = counts?.[kind] ?? null;
  const tickedNow = (ideas?.rows ?? []).filter((row) => ticked.has(row.keyword)).map((row) => row.keyword);
  const onPage = paged.pageRows ?? [];
  const allTicked = onPage.length > 0 && onPage.every((row) => ticked.has(row.keyword));
  const place = { locationCode: lookup.locationCode, siteId: lookup.forWebsite?.siteId ?? null };
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
    {
      key: "keyword",
      header: tc("keyword"),
      sortable: true,
      className: "w-[26%]",
      cell: (row) => <KeywordOpener keyword={row.keyword} canLookUp={canLookUp} opener={opener} wrap />,
    },
    { key: "intent", header: tc("intent"), sortable: true, cell: (row) => <IntentWord intent={row.intent} /> },
    { key: "volume", header: tc("volume"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.volume} /> },
    { key: "difficulty", header: tc("difficulty"), align: "right", sortable: true, cell: (row) => <DifficultyCell value={row.difficulty} /> },
    { key: "cpc", header: tc("cpc"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.cpc} text={formatCpc(row.cpc)} /> },
    {
      key: "position",
      header: tc("position"),
      align: "right",
      sortable: true,
      cell: (row) => (row.position === null ? <NoFigure /> : <PositionCell position={row.position} />),
    },
    {
      key: "page",
      header: tc("yourPage"),
      // Wrapped rather than cut, as drawn, so the keyword keeps its room.
      className: "w-[18%]",
      cell: (row) => (row.page ? <ExternalUrlCell url={row.page} label={pathOf(row.page)} /> : measured ? <span className="text-[12px] text-muted">{t("noPage")}</span> : <NoFigure />),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<ListChecks className="h-6 w-6 text-brand" />}
        title={t(`kinds.${key}.title`)}
        description={
          key === "terms" && total !== null && total > bought
            ? t("kinds.terms.descriptionBought", { keyword: lookup.keyword, bought: formatNumber(bought), total: formatNumber(total) })
            : t(`kinds.${key}.description`, { keyword: lookup.keyword })
        }
      />
      <ResearchSees screen="ideas" seen={ideas ? ideasSees(ideas) : ideas} />
      {ideas?.sample ? <Notice>{tk("sample")}</Notice> : null}
      {lookup.state !== "READY" ? <LookupState lookup={lookup} /> : null}
      {ideas?.state === "WAITING" ? <Notice>{t("waiting")}</Notice> : null}
      {ideas?.state === "FAILED" ? <Notice tone="warning">{problemWords(ideas.problem, t("failed"))}</Notice> : null}
      <SiteViewSwitch
        label={t("kindLabel")}
        value={key}
        onChange={(next) => {
          setTicked(new Set());
          setDone(null);
          setKey(next);
        }}
        options={IDEA_KINDS.map((entry) => ({
          value: entry.key,
          label: counts?.[entry.kind] !== null && counts?.[entry.kind] !== undefined
            ? t("kindWithCount", { kind: t(`kinds.${entry.key}.title`), count: formatNumber(counts[entry.kind]) })
            : t(`kinds.${entry.key}.title`),
        }))}
      />

      <DataTable
        rows={paged.pageRows}
        rowKey={keywordOf}
        rowClassName={(row) => (ticked.has(row.keyword) ? "bg-brand/5" : "")}
        search={{ value: search, onChange: setSearch, placeholder: t("search") }}
        filters={
          <>
            <Select chip={{ label: tk("past.intent"), choice: intent ? tk(`intents.${intent}`) : null }} value={intent} onChange={(value) => setIntent(value as (typeof INTENT_CHOICES)[number])}>
              <option value="">{tk("past.everyIntent")}</option>
              {INTENTS.map((option) => <option key={option} value={option}>{tk(`intents.${option}`)}</option>)}
            </Select>
            <Select chip={{ label: t("difficulty"), choice: band ? t(`bands.${band}`) : null }} value={band} onChange={(value) => setBand(value as (typeof BAND_CHOICES)[number])}>
              <option value="">{t("anyDifficulty")}</option>
              {BAND_CHOICES.filter(Boolean).map((option) => <option key={option} value={option}>{t(`bands.${option}`)}</option>)}
            </Select>
            {measured ? (
              <Select chip={{ label: t("you"), choice: you ? t(`yous.${you}`) : null }} value={you} onChange={(value) => setYou(value as (typeof YOU_CHOICES)[number])}>
                <option value="">{t("everyIdea")}</option>
                <option value="ranks">{t("yous.ranks")}</option>
                <option value="not">{t("yous.not")}</option>
              </Select>
            ) : null}
          </>
        }
        cardHeader={
          <TableBar
            footer={paged.footer}
            noun="ideas"
            actions={
              <>
                {done ? <StatusLabel tone="success">{done}</StatusLabel> : null}
                {canLookUp ? (
                  <AddTickedToList
                    keywords={tickedNow}
                    idleLabel={t("tickFirst")}
                    place={place}
                    back={`${pathname}?kind=${key}`}
                    onAdded={(list, added) => {
                      setTicked(new Set());
                      setDone(t("added", { count: added, list }));
                    }}
                  />
                ) : null}
                <ListDownload
                  fileName={`keyword-ideas-${key}`}
                  rows={sorted}
                  columns={[
                    { header: tc("keyword"), value: (row) => row.keyword },
                    { header: tc("intent"), value: (row) => (isIntent(row.intent) ? tk(`intents.${row.intent}`) : row.intent) },
                    { header: tc("volume"), value: (row) => row.volume },
                    { header: tc("difficulty"), value: (row) => row.difficulty },
                    { header: tc("cpc"), value: (row) => row.cpc },
                    { header: tc("position"), value: (row) => row.position },
                    { header: tc("yourPage"), value: (row) => row.page },
                  ]}
                />
              </>
            }
          />
        }
        empty={{
          icon: <ListChecks className="h-8 w-8 text-muted/30" />,
          label: settled || intent || band || you ? t("noMatch") : ideas?.state === "WAITING" ? t("waitingRow") : t("empty"),
        }}
        footer={{
          ...paged.footer,
          note: ideas?.boughtAt
            ? t(key === "also" ? "noteAlso" : "note", { day: formatDate(ideas.boughtAt) })
            : t("noteNotYet"),
        }}
        sort={tableSort}
        columns={columns}
      />
    </div>
  );
}
