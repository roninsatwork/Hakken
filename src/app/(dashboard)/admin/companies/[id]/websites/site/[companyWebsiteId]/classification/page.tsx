"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Layers, Pencil, Plus, Trash2 } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { FOLDER_PAGES } from "@/convex/utils/suggestClassifications";
import { Button } from "@/src/ui/components/screens/Button";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader, PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";
import { SaveError } from "@/src/ui/components/screens/SaveControls";
import { Select } from "@/src/ui/components/screens/Select";
import { SegmentedChoice } from "@/src/ui/components/screens/SettingsCard";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { cn } from "@/src/ui/lib/utils";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { useToast } from "@/src/context/ToastContext";
import useDebounce from "@/src/hooks/useDebounce";
import { SECTION_ICONS } from "../../../_components/websitesSection";
import { AddBar } from "../../../_components/AddBar";
import { classificationBase, useClassificationWords } from "./classificationWords";
import { RemoveClassificationDialog, type RemovingClassification } from "./RemoveClassificationDialog";

type View = "pages" | "classifications";
type PagesData = NonNullable<FunctionReturnType<typeof api.pageClassifications.pageClassificationPages>>;
type PageRow = PagesData["rows"][number];
type ListData = NonNullable<FunctionReturnType<typeof api.pageClassifications.pageClassificationList>>;
type ListRow = ListData["classifications"][number];
type ClassificationId = Id<"pageClassifications">;
/** The Classification chip: every classification (""), one, or the pages none catches. */
type Filter = "" | "NOT_SORTED" | ClassificationId;

/**
 * A website's Page classification (docs/plans/active/page-groups-plan.md,
 * decision 6, drawn as board 22): what each of its pages is, in the
 * company's own words. Two views of one page —
 *
 * - **Pages**: every page with its classification, set or changed in its row,
 *   removed with the bin (set by hand, it goes back to its line; given by a
 *   line, it is taken out of it), several set at once by ticking them; how
 *   each was set; most clicks first, fifteen to a page (the admin standard —
 *   the drawing showed 25).
 * - **Classifications**: each with its type, page count and address lines;
 *   the pencil (or the row) opens its own page, the bin removes it after a
 *   yes. While the website has none, the suggested start offers to make them
 *   from its own folders and sitemap files, in one press.
 *
 * Each row's change is saved as it is made, so there is no Save on this page.
 * Set only here, for this company only; a competitor has none. A page inside
 * the Websites section, so its header has no rule of its own.
 */
export default function PageClassificationPage() {
  const t = useTranslations("admin.siteView.classification");
  const tSection = useTranslations("admin.websitesSection");
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyId = params.id as Id<"companies">;
  const companyWebsiteId = params.companyWebsiteId as Id<"companyWebsites">;
  const base = classificationBase(companyId, companyWebsiteId);

  const view: View = searchParams.get("view") === "classifications" ? "classifications" : "pages";
  const [search, setSearch] = useState("");
  const searching = useDebounce(search, 300).trim();
  const [filter, setFilter] = useState<Filter>("");
  const [page, setPage] = useState(1);

  const header = useQuery(api.websiteClientView.getSiteHeader, { companyWebsiteId });
  const owned = header?.relationship === "OWNED";
  const pagesData = useQuery(
    api.pageClassifications.pageClassificationPages,
    owned && view === "pages"
      ? { companyWebsiteId, search: searching || undefined, classification: filter || undefined, page, rows: TABLE_PAGE_SIZE }
      : "skip",
  );
  const listData = useQuery(api.pageClassifications.pageClassificationList, owned && view === "classifications" ? { companyWebsiteId } : "skip");
  if (!header) return null;

  const Icon = SECTION_ICONS.classification;
  const summary = (view === "pages" ? pagesData : listData)?.summary;
  const full = summary !== undefined && summary.classifications >= summary.limits.classifications;
  const count = (value: number | undefined) => (value === undefined ? "…" : String(value));

  const switchView = (next: View) => router.replace(next === "pages" ? base : `${base}?view=classifications`);
  const showNotSorted = () => {
    setFilter("NOT_SORTED");
    setPage(1);
    switchView("pages");
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<Icon className="h-6 w-6 text-brand" />}
        title={tSection("pages.classification")}
        description={t(owned ? "description" : "descriptionCompetitor", { host: header.displayHost })}
        action={owned ? (
          // A disabled button shows no tooltip, so the reason sits on what holds it.
          <span title={full ? t("addFullTip", { limit: summary.limits.classifications }) : undefined}>
            <PagePrimaryAction variant="brand" icon={<Plus className="h-4 w-4" />} disabled={full} onClick={() => router.push(`${base}/new`)}>
              {t("add")}
            </PagePrimaryAction>
          </span>
        ) : null}
      />

      {owned ? (
        <>
          <SegmentedChoice
            size="compact"
            label={t("view")}
            value={view}
            onChange={switchView}
            options={[
              { value: "pages", label: t("views.pages", { count: count(summary?.pages) }) },
              { value: "classifications", label: t("views.classifications", { count: count(summary?.classifications) }) },
            ]}
          />
          {view === "pages" ? (
            <ClassificationPages
              companyWebsiteId={companyWebsiteId}
              data={pagesData ?? undefined}
              search={search}
              onSearch={(next) => {
                setSearch(next);
                setPage(1);
              }}
              filter={filter}
              onFilter={(next) => {
                setFilter(next);
                setPage(1);
              }}
              onPage={setPage}
              onShowNotSorted={showNotSorted}
            />
          ) : (
            <ClassificationList
              companyWebsiteId={companyWebsiteId}
              base={base}
              host={header.displayHost}
              data={listData ?? undefined}
            />
          )}
        </>
      ) : (
        <Notice>{t("competitor")}</Notice>
      )}
    </div>
  );
}

/**
 * The Pages view: the notice with its counts, the search and the
 * Classification chip, the bar for the ticked pages, and the pages.
 */
function ClassificationPages({ companyWebsiteId, data, search, onSearch, filter, onFilter, onPage, onShowNotSorted }: {
  companyWebsiteId: Id<"companyWebsites">;
  data: PagesData | undefined;
  search: string;
  onSearch: (next: string) => void;
  filter: Filter;
  onFilter: (next: Filter) => void;
  onPage: (next: number) => void;
  onShowNotSorted: () => void;
}) {
  const t = useTranslations("admin.siteView.classification");
  const format = useFormatter();
  const words = useClassificationWords();
  const action = useAdminAction({ scope: "admin-page-classification" });
  const setClassification = useMutation(api.pageClassifications.setPageClassification);
  const removeFromPage = useMutation(api.pageClassifications.removeClassificationFromPage);
  const [ticked, setTicked] = useState<string[]>([]);
  const [bulkChoice, setBulkChoice] = useState("");
  const [error, setError] = useState("");

  const classifications = data?.classifications ?? [];
  const nameOf = (id: string | null) => classifications.find((classification) => classification._id === id)?.name ?? "";
  const summary = data?.summary;
  const narrowed = search.trim() !== "" || filter !== "";

  const run = async (key: string, task: () => Promise<unknown>, fallback: string) => {
    setError("");
    const outcome = await action.run(task, { key, suppressErrorToast: true, fallbackMessage: fallback });
    if (!outcome.ok && !outcome.deduplicated) setError(outcome.message);
    return outcome.ok;
  };
  const setFor = (pages: string[], classificationId: string, key: string) =>
    run(key, () => setClassification({ companyWebsiteId, classificationId: classificationId as ClassificationId, pages }), t("errors.setFailed"));
  const remove = (row: PageRow) =>
    run(`row:${row.page}`, () => removeFromPage({ companyWebsiteId, page: row.page }), t("errors.removeFailed"));
  const tick = (page: string, next: boolean) =>
    setTicked((current) => (next ? [...current.filter((each) => each !== page), page] : current.filter((each) => each !== page)));
  const applyBulk = async () => {
    if (!bulkChoice || ticked.length === 0) return;
    const done = await setFor(ticked, bulkChoice, "bulk");
    if (!done) return;
    setTicked([]);
    setBulkChoice("");
  };

  // What the bin does, said before it is pressed.
  const removeTip = (row: PageRow) => {
    if (row.how === "BY_HAND") return row.underneath ? t("removeBackTo", { name: nameOf(row.underneath) }) : t("removeNotSorted");
    return t("removeTakeOut");
  };
  const how = (row: PageRow) => (row.how === "BY_LINE" && row.line ? t("how.BY_LINE", { line: words.line(row.line) }) : t(`how.${row.how}`));

  return (
    <>
      {summary ? (
        summary.classifications === 0 ? (
          <Notice>{t("noticeEmpty")}</Notice>
        ) : (
          <Notice
            action={summary.notSorted > 0 && filter !== "NOT_SORTED" ? (
              <Button variant="quiet" onClick={onShowNotSorted}>{t("showNotSorted", { count: summary.notSorted })}</Button>
            ) : undefined}
          >
            {t("notice", { sorted: summary.sorted, pages: summary.pages, notSorted: summary.notSorted })}
          </Notice>
        )
      ) : null}
      {summary?.cut ? <Notice tone="warning">{t("cut", { count: summary.pagesRead })}</Notice> : null}

      {ticked.length > 0 ? (
        <AddBar
          label={t("bulk.set", { count: ticked.length })}
          icon={null}
          disabled={!bulkChoice || action.isBusy("bulk")}
          disabledTip={bulkChoice ? undefined : t("bulk.chooseFirst")}
          onAdd={() => void applyBulk()}
          after={<Button variant="ghost" className="h-[46px]" onClick={() => setTicked([])}>{t("bulk.untick")}</Button>}
        >
          <span className="mr-auto self-center text-[13px] text-foreground">{t("bulk.ticked", { count: ticked.length })}</span>
          <Select
            aria-label={t("bulk.label")}
            value={bulkChoice}
            onChange={setBulkChoice}
            className="w-full sm:w-[260px]"
            selectClassName="h-[46px] rounded-[12px]"
          >
            <option value="">{t("bulk.choose")}</option>
            {classifications.map((classification) => (
              <option key={classification._id} value={classification._id}>{classification.name}</option>
            ))}
          </Select>
        </AddBar>
      ) : null}

      <SaveError>{error}</SaveError>

      <DataTable
        rows={data?.rows}
        rowKey={(row) => row.page}
        // Six columns beside two menus: the table's usual minimum width would push the bin off a laptop screen.
        minWidthClassName="min-w-[52rem]"
        search={{ value: search, onChange: onSearch, placeholder: t("searchPlaceholder") }}
        filters={(
          <Select
            chip={{ label: t("filter"), choice: filter === "" ? null : filter === "NOT_SORTED" ? t("notSorted") : nameOf(filter) }}
            aria-label={t("filter")}
            value={filter}
            onChange={(next) => onFilter(next as Filter)}
          >
            <option value="">{t("filterAll")}</option>
            <option value="NOT_SORTED">{t("notSorted")}</option>
            {classifications.map((classification) => (
              <option key={classification._id} value={classification._id}>{classification.name}</option>
            ))}
          </Select>
        )}
        cardHeader={(
          <TableBar footer={{ isLoading: data === undefined, totalCount: data?.total ?? 0 }} noun="pages">
            <span className="text-[12px] text-muted">{t("clicksNote")}</span>
          </TableBar>
        )}
        empty={{ icon: <Layers className="h-8 w-8 text-muted/30" />, label: narrowed ? t("noMatch") : t("emptyPages") }}
        footer={{
          mode: "paged",
          page: data?.page ?? 1,
          totalPages: data?.totalPages ?? 1,
          totalCount: data?.total ?? 0,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: data === undefined,
          onPageChange: onPage,
          labels: { empty: narrowed ? t("noMatch") : t("emptyPages") },
        }}
        columns={[
          {
            key: "tick",
            hiddenHeader: t("columns.tick"),
            className: "w-12",
            cell: (row) => (
              <Checkbox label={t("tickPage", { page: row.page })} labelHidden checked={ticked.includes(row.page)} onChange={(next) => tick(row.page, next)} />
            ),
          },
          {
            key: "page",
            header: t("columns.page"),
            className: "max-w-0",
            cell: (row) => <span title={row.page} className="block truncate text-[12px] text-info">{row.page}</span>,
          },
          {
            key: "classification",
            header: t("columns.classification"),
            className: "w-[280px]",
            cell: (row) => (
              <Select
                aria-label={t("rowSelect", { page: row.page })}
                value={row.classificationId ?? ""}
                onChange={(next) => {
                  if (next && next !== row.classificationId) void setFor([row.page], next, `row:${row.page}`);
                }}
                disabled={classifications.length === 0 || action.isBusy(`row:${row.page}`)}
                className="w-[250px]"
                // Not sorted says so in words; the colour only repeats it.
                selectClassName={cn("h-[34px]", row.classificationId === null && "text-warning")}
              >
                {row.classificationId === null ? <option value="">{t("chooseNotSorted")}</option> : null}
                {classifications.map((classification) => (
                  <option key={classification._id} value={classification._id}>{classification.name}</option>
                ))}
              </Select>
            ),
          },
          {
            key: "how",
            header: t("columns.how"),
            className: "max-w-0",
            cell: (row) => (
              <span title={how(row)} className={cn("block truncate text-[12px]", row.how === "BY_HAND" ? "text-foreground" : "text-secondary")}>
                {how(row)}
              </span>
            ),
          },
          {
            key: "clicks",
            header: t("columns.clicks"),
            align: "right",
            className: "w-20",
            cell: (row) => <span className="font-mono text-[12px] text-secondary">{format.number(row.clicks)}</span>,
          },
          {
            key: "remove",
            hiddenHeader: t("columns.remove"),
            align: "right",
            className: "w-14",
            cell: (row) => (row.classificationId === null ? null : (
              <RowActions alwaysVisible>
                <RowIconButton label={removeTip(row)} tone="danger" onClick={() => void remove(row)}>
                  <Trash2 className="h-4 w-4" />
                </RowIconButton>
              </RowActions>
            )),
          },
        ]}
      />
    </>
  );
}

/**
 * The Classifications view: each with its type, pages and lines, opened with
 * the pencil or the row, removed after a yes. While the website has none —
 * and has pages — the suggested start: one press makes a classification for
 * each of its own folders and sitemap files (`suggestPageClassifications`),
 * to rename or remove.
 */
function ClassificationList({ companyWebsiteId, base, host, data }: {
  companyWebsiteId: Id<"companyWebsites">;
  base: string;
  host: string;
  data: ListData | undefined;
}) {
  const t = useTranslations("admin.siteView.classification");
  const format = useFormatter();
  const words = useClassificationWords();
  const router = useRouter();
  const [pageNumber, setPageNumber] = useState(1);
  const [removing, setRemoving] = useState<RemovingClassification | null>(null);
  const suggest = useMutation(api.pageClassifications.suggestPageClassifications);
  const { showToast } = useToast();
  const action = useAdminAction({ scope: "admin-page-classification-suggest" });
  const [suggestError, setSuggestError] = useState("");
  const offerSuggestion = data !== undefined && data.classifications.length === 0 && data.summary.pages > 0;
  const runSuggestion = async () => {
    setSuggestError("");
    const outcome = await action.run(() => suggest({ companyWebsiteId }), { key: "suggest", suppressErrorToast: true, fallbackMessage: t("suggest.failed") });
    if (!outcome.ok) {
      if (!outcome.deduplicated) setSuggestError(outcome.message);
      return;
    }
    const { created, overLimit } = outcome.data;
    const said = created > 0 ? t("suggest.created", { count: created }) : t("suggest.none", { folderPages: FOLDER_PAGES });
    showToast(overLimit > 0 ? `${said} ${t("suggest.overLimit", { count: overLimit })}` : said, created > 0 ? "success" : "info");
  };

  const rows = data?.classifications;
  const totalPages = Math.max(1, Math.ceil((rows?.length ?? 0) / TABLE_PAGE_SIZE));
  const safePage = Math.min(pageNumber, totalPages);
  const open = (row: ListRow) => router.push(`${base}/${row._id}`);
  const catches = (row: ListRow) => (row.lines.length > 0 ? row.lines.map(words.line).join(" · ") : t("list.byHandOnly"));

  return (
    <>
      {offerSuggestion ? (
        <Notice
          action={(
            <Button variant="quiet" disabled={action.isBusy("suggest")} onClick={() => void runSuggestion()}>
              {t("suggest.button")}
            </Button>
          )}
        >
          {t("suggest.notice", { host, folderPages: FOLDER_PAGES })}
        </Notice>
      ) : null}
      <SaveError>{suggestError}</SaveError>
      <DataTable
        rows={rows?.slice((safePage - 1) * TABLE_PAGE_SIZE, safePage * TABLE_PAGE_SIZE)}
        rowKey={(row) => row._id}
        onRowClick={open}
        minWidthClassName="min-w-[52rem]"
        cardHeader={<TableBar footer={{ isLoading: data === undefined, totalCount: rows?.length ?? 0 }} noun="classifications" />}
        empty={{ icon: <Layers className="h-8 w-8 text-muted/30" />, label: t("list.empty") }}
        footer={{
          mode: "paged",
          page: safePage,
          totalPages,
          totalCount: rows?.length ?? 0,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: data === undefined,
          onPageChange: setPageNumber,
          labels: { empty: t("list.empty") },
        }}
        columns={[
          {
            key: "name",
            header: t("list.columns.name"),
            cell: (row) => <span className="text-[13px] font-medium text-foreground">{row.name}</span>,
          },
          {
            key: "type",
            header: t("list.columns.type"),
            className: "w-[200px]",
            cell: (row) => <TagLabel>{words.type(row.type)}</TagLabel>,
          },
          {
            key: "pages",
            header: t("list.columns.pages"),
            align: "right",
            className: "w-20",
            cell: (row) => <span className="font-mono text-[12px] text-secondary">{format.number(row.pages)}</span>,
          },
          {
            key: "lines",
            header: t("list.columns.lines"),
            className: "max-w-0",
            cell: (row) => <span title={catches(row)} className="block truncate text-[12px] text-secondary">{catches(row)}</span>,
          },
          {
            key: "actions",
            hiddenHeader: t("list.columns.actions"),
            align: "right",
            className: "w-24",
            cell: (row) => (
              <RowActions alwaysVisible>
                <RowIconButton navigates label={t("list.edit", { name: row.name })} onClick={() => open(row)}>
                  <Pencil className="h-4 w-4" />
                </RowIconButton>
                <RowIconButton
                  tone="danger"
                  label={t("list.remove", { name: row.name })}
                  onClick={() => setRemoving({ _id: row._id, name: row.name, lines: row.lines.length, byHand: row.byHand })}
                >
                  <Trash2 className="h-4 w-4" />
                </RowIconButton>
              </RowActions>
            ),
          },
        ]}
      />
      <RemoveClassificationDialog
        companyWebsiteId={companyWebsiteId}
        removing={removing}
        onClose={() => setRemoving(null)}
        onRemoved={() => setRemoving(null)}
      />
    </>
  );
}
