"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ListChecks, Pencil, Plus, TextSearch, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { formatDate } from "@/src/lib/dates";
import Header from "@/src/ui/components/layout/Header";
import { Button } from "@/src/ui/components/screens/Button";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { CUT_COLUMN, RecordLinkCell } from "../sites/_components/SiteCells";
import { ListDownload } from "../sites/_components/SiteDownloads";
import { useSitePager } from "../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../sites/_components/useSiteSort";
import { CompetitorStartCards } from "./_components/CompetitorStarts";
import { LookUpCard } from "./_components/LookUpCard";
import { DifficultyCell, FigureCell, IntentWord, ResearchPositionCell, ResearchSection, useCountryName } from "./_components/ResearchCells";
import { INTENTS, isIntent } from "./_components/researchWords";
import { listHref, lookupHref } from "./_components/useLookup";
import { ResearchSees } from "./_components/ResearchSees";
import { researchStartSees } from "@/convex/sees/research";

type Lookup = FunctionReturnType<typeof api.keywordResearch.pastLookups>[number];
type List = FunctionReturnType<typeof api.keywordResearch.researchLists>[number];

/**
 * Past lookups' order (docs/plans/active/sites-table-sorting-plan.md): newest
 * first, as it opens; a keyword or country A to Z; the most searched; the
 * easiest; the best position.
 */
const LOOKUP_SORTS: SiteSortColumns<Lookup, "keyword" | "country" | "volume" | "difficulty" | "intent" | "position" | "when"> = {
  keyword: { value: (row) => row.keyword.toLowerCase(), first: "asc" },
  country: { value: (row) => row.country, first: "asc" },
  volume: { value: (row) => row.volume, first: "desc" },
  difficulty: { value: (row) => row.difficulty, first: "asc" },
  intent: { value: (row) => row.intent, first: "asc" },
  position: { value: (row) => row.position, first: "asc" },
  when: { value: (row) => row.openedAt, first: "desc" },
};
const lookupName = (row: Lookup) => row.keyword.toLowerCase();

/** Research lists' order: last changed first, as it opens; a name A to Z; the most keywords and searches. */
const LIST_SORTS: SiteSortColumns<List, "name" | "keywords" | "volume" | "changed"> = {
  name: { value: (row) => row.name.toLowerCase(), first: "asc" },
  keywords: { value: (row) => row.keywords, first: "desc" },
  volume: { value: (row) => row.volume, first: "desc" },
  changed: { value: (row) => row.updatedAt, first: "desc" },
};
const listName = (row: List) => row.name.toLowerCase();
const INTENT_CHOICES = ["", ...INTENTS] as const;

/**
 * Keyword research (board 1 of the approved drawings, docs/plans/active/
 * keyword-research-plan.md): look up a keyword or several, or start from a
 * competitor of the website chosen; then every keyword the company looked
 * up, and its research lists. Each opens a screen
 * of its own with a way back, never a pop-up; a pop-up only asks yes or no,
 * before a list is deleted. A read-only account reads all of it and sees no
 * control that buys or changes anything.
 */
export default function KeywordResearchPage() {
  const t = useTranslations("keywordResearch");
  const router = useRouter();
  const countryName = useCountryName();
  const setup = useQuery(api.keywordResearch.researchSetup, {});
  const lookups = useQuery(api.keywordResearch.pastLookups, {});
  const lists = useQuery(api.keywordResearch.researchLists, {});
  const canLookUp = setup?.canLookUp === true;

  const [search, setSearch, settled] = useSiteSearch();
  const [intent, setIntent] = useSiteParam<(typeof INTENT_CHOICES)[number]>("intent", "", INTENT_CHOICES);
  const matches = wordStartMatcher(settled.toLowerCase());
  const found = lookups?.filter((row) => (!matches || matches(row.keyword)) && (!intent || row.intent === intent));
  const { rows: sortedLookups, tableSort: lookupSort } = useSiteSortedList(found, LOOKUP_SORTS, { opening: "when", name: lookupName });
  const lookupPage = useSitePager(sortedLookups);

  const { rows: sortedLists, tableSort: listSort } = useSiteSortedList(lists, LIST_SORTS, { opening: "changed", name: listName, table: "lists" });
  const listPage = useSitePager(sortedLists, { table: "lists" });

  const deleteList = useMutation(api.keywordResearch.deleteResearchList);
  const { run, isBusy } = useAdminAction({ scope: "keyword-research-lists" });
  const [deleting, setDeleting] = useState<List | null>(null);
  // The website Look up measures against, and Start from a competitor reads: the company's first, until another is chosen.
  const [chosenSite, setSiteId] = useState<string | null>(null);
  const siteId = chosenSite ?? setup?.websites[0]?.siteId ?? "";
  const measured = setup?.websites.find((website) => website.siteId === siteId) ?? null;

  // The website a lookup's position is read for: named when the company has one.
  const onlyHost = setup?.websites.length === 1 ? setup.websites[0].host : null;

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <PageHeader divider icon={<TextSearch className="h-6 w-6 text-brand" />} title={t("title")} description={t("description")} />
        <ResearchSees screen="start" seen={lookups && lists && researchStartSees(lookups, lists)} />

        {setup && canLookUp ? <LookUpCard setup={setup} siteId={siteId} onSiteId={setSiteId} /> : null}
        {measured ? <CompetitorStartCards siteId={measured.siteId} host={measured.host} /> : null}

        <ResearchSection title={t("past.title")} description={t("past.description")}>
          <DataTable
            rows={lookupPage.pageRows}
            rowKey={(row) => row.lookupId}
            onRowClick={(row) => router.push(lookupHref(row.lookupId))}
            search={{ value: search, onChange: setSearch, placeholder: t("past.search") }}
            filters={
              <Select
                chip={{ label: t("past.intent"), choice: intent ? t(`intents.${intent}`) : null }}
                value={intent}
                onChange={(value) => setIntent(value as (typeof INTENT_CHOICES)[number])}
              >
                <option value="">{t("past.everyIntent")}</option>
                {INTENTS.map((option) => <option key={option} value={option}>{t(`intents.${option}`)}</option>)}
              </Select>
            }
            cardHeader={
              <TableBar
                footer={lookupPage.footer}
                noun="keywords"
                actions={
                  <ListDownload
                    fileName="past-lookups"
                    rows={sortedLookups}
                    columns={[
                      { header: t("columns.keyword"), value: (row) => row.keyword },
                      { header: t("columns.country"), value: (row) => countryName(row.locationCode, row.country) },
                      { header: t("columns.measuredAgainst"), value: (row) => row.host },
                      { header: t("columns.volume"), value: (row) => row.volume },
                      { header: t("columns.difficulty"), value: (row) => row.difficulty },
                      { header: t("columns.intent"), value: (row) => (isIntent(row.intent) ? t(`intents.${row.intent}`) : row.intent) },
                      { header: t("columns.position"), value: (row) => row.position },
                      { header: t("columns.lookedUp"), value: (row) => new Date(row.openedAt).toISOString().slice(0, 10) },
                    ]}
                  />
                }
              />
            }
            empty={{ icon: <TextSearch className="h-8 w-8 text-muted/30" />, label: settled || intent ? t("past.noMatch") : t("past.empty") }}
            footer={{ ...lookupPage.footer, note: onlyHost ? t("past.note", { host: onlyHost }) : t("past.noteAny") }}
            sort={lookupSort}
            columns={[
              {
                key: "keyword",
                header: t("columns.keyword"),
                sortable: true,
                className: CUT_COLUMN.first,
                cell: (row) => <RecordLinkCell href={lookupHref(row.lookupId)} cut>{row.keyword}</RecordLinkCell>,
              },
              { key: "country", header: t("columns.country"), sortable: true, cell: (row) => <span className="text-[13px] text-secondary">{countryName(row.locationCode, row.country)}</span> },
              { key: "volume", header: t("columns.volume"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.volume} /> },
              { key: "difficulty", header: t("columns.difficulty"), align: "right", sortable: true, cell: (row) => <DifficultyCell value={row.difficulty} /> },
              { key: "intent", header: t("columns.intent"), sortable: true, cell: (row) => <IntentWord intent={row.intent} /> },
              { key: "position", header: t("columns.position"), align: "right", sortable: true, cell: (row) => <ResearchPositionCell position={row.position} notInTop100={row.notInTop100} /> },
              {
                key: "when",
                header: t("columns.lookedUp"),
                align: "right",
                sortable: true,
                cell: (row) => <span className="font-mono text-[12px] tabular-nums text-secondary">{formatDate(row.openedAt)}</span>,
              },
            ]}
          />
        </ResearchSection>

        <ResearchSection title={t("lists.title")} description={t("lists.description")}>
          <DataTable
            rows={listPage.pageRows}
            rowKey={(row) => row.listId}
            onRowClick={(row) => router.push(listHref(row.listId))}
            cardHeader={
              <TableBar
                footer={listPage.footer}
                noun="lists"
                actions={
                  canLookUp ? (
                    <Button variant="quiet" onClick={() => router.push("/app/keyword-research/lists/new")} className="inline-flex items-center gap-1.5">
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      {t("lists.newList")}
                    </Button>
                  ) : null
                }
              />
            }
            empty={{ icon: <ListChecks className="h-8 w-8 text-muted/30" />, label: t(canLookUp ? "lists.empty" : "lists.emptyReadOnly") }}
            footer={{ ...listPage.footer, note: t("lists.note") }}
            sort={listSort}
            columns={[
              {
                key: "name",
                header: t("columns.list"),
                sortable: true,
                className: CUT_COLUMN.first,
                cell: (row) => <RecordLinkCell href={listHref(row.listId)} cut>{row.name}</RecordLinkCell>,
              },
              { key: "keywords", header: t("columns.keywords"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.keywords} /> },
              { key: "volume", header: t("columns.volume"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.volume} /> },
              { key: "host", header: t("columns.measuredAgainst"), cell: (row) => <span className="text-[13px] text-secondary">{row.host ?? t("lists.noWebsite")}</span> },
              {
                key: "changed",
                header: t("columns.changed"),
                align: "right",
                sortable: true,
                cell: (row) => <span className="font-mono text-[12px] tabular-nums text-secondary">{formatDate(row.updatedAt)}</span>,
              },
              {
                key: "actions",
                hiddenHeader: t("lists.actions"),
                align: "right",
                cell: (row) =>
                  canLookUp ? (
                    <RowActions alwaysVisible>
                      <RowIconButton label={t("lists.rename")} onClick={() => router.push(`${listHref(row.listId)}/rename`)}>
                        <Pencil className="h-4 w-4" />
                      </RowIconButton>
                      <RowIconButton label={t("lists.delete")} onClick={() => setDeleting(row)}>
                        <Trash2 className="h-4 w-4" />
                      </RowIconButton>
                    </RowActions>
                  ) : null,
              },
            ]}
          />
        </ResearchSection>
      </div>

      <ConfirmationModal
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t("lists.deleteTitle")}
        cancelLabel={t("lists.cancel")}
        confirmLabel={t("lists.deleteConfirm")}
        isSubmitting={isBusy()}
        onConfirm={async () => {
          if (!deleting) return;
          const outcome = await run(() => deleteList({ listId: deleting.listId }), { fallbackMessage: t("lists.deleteFailed") });
          if (outcome.ok) setDeleting(null);
        }}
      >
        {deleting ? t("lists.deleteBody", { name: deleting.name, count: deleting.keywords }) : null}
      </ConfirmationModal>
    </>
  );
}
