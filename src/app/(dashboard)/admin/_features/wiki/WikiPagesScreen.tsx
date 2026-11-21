"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { BookOpen, Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useServerPagedTable } from "@/src/hooks/useServerPagedTable";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { formatDate } from "@/src/lib/dates";
import { CUT_COLUMN, RecordLinkCell } from "@/src/app/(dashboard)/app/sites/_components/SiteCells";
import { useCanWriteHere } from "@/src/ui/components/screens/AccessLevel";
import { Button } from "@/src/ui/components/screens/Button";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { RowIconButton } from "@/src/ui/components/screens/Table";
import { TableFilterSelect } from "@/src/ui/components/screens/TableControls";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { useDescribeWikiSource } from "./wikiWords";
import { WikiPagesActions } from "./WikiPagesActions";
import { WikiQuickSwitcher } from "./WikiQuickSwitcher";

const WIKI_KINDS = ["CUSTOMER", "PRODUCT", "POLICY", "ISSUE", "CLIENT", "SOURCE", "GOAL"] as const;
type WikiKindFilter = (typeof WIKI_KINDS)[number];

const NEVER_USED_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Wiki pages (wiki-sonae-catch-up-plan-2026-11-21.md, S6, from the upstream
 * framework's `be63693c` and `922048cb`): the wiki's own list, mounted for the
 * platform's wiki and, with `companyId`, for each company's. The long page
 * that stacked about ten panels over this table became five pages in the menu:
 * Add to the wiki, Waiting on you, Ask the wiki and Check-up each have their
 * own now, and the map has had its own line since S2.
 *
 * The table is lean (AGENTS.md, "Tables are lean"): the page's name, its kind,
 * how often it was used, the last change and its sources, one line a row, and
 * the whole row opens the page, where what it remembers and its pinned facts
 * are. Delete stays on the row, as a page has no Delete of its own. Kind and Tag
 * (only when there are tags) narrow the list, searched and paged in the query,
 * newest change first. Pressing Used orders the page in hand by most used.
 *
 * Whose wiki this is stays said out loud (Anthony's ruling, 2026-08-16): a wiki
 * screen must never leave its scope to be guessed. A company's wiki is never
 * shown outside its own section, and only a company's offers Clear wiki.
 */
export function WikiPagesScreen({ companyId, basePath }: { companyId?: Id<"companies">; basePath: string }) {
  const t = useTranslations("aiPages");
  const { platformName } = useSystemSettings();
  const router = useRouter();
  const describeSource = useDescribeWikiSource();
  const canWrite = useCanWriteHere();
  const [search, setSearch] = useState("");
  const [sortByUse, setSortByUse] = useState(false);
  const [kindFilter, setKindFilter] = useState<WikiKindFilter | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const searchArg = {
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(kindFilter ? { kind: kindFilter } : {}),
    ...(tagFilter ? { tag: tagFilter } : {}),
  };
  const companyTags = useQuery(api.wikiCheckupPages.listTagsForCompany, companyId ? { companyId } : "skip");
  const globalTags = useQuery(api.wikiCheckupPages.listTagsForGlobal, companyId ? "skip" : {});
  const tagOptions = ((companyId ? companyTags : globalTags) ?? []).map((entry) => entry.tag);
  // Two doors, one mounted: hooks must both be called, so the unused door is
  // skipped rather than conditionally omitted. Searching and paging both
  // happen in the query: this list used to arrive five hundred rows at a time.
  const globalRows = useServerPagedTable(api.wikiPages.listPagesForGlobal, companyId ? "skip" : searchArg);
  const companyRows = useServerPagedTable(api.wikiPages.listPagesForCompany, companyId ? { companyId, ...searchArg } : "skip");
  const rows = companyId ? companyRows : globalRows;
  type PageRow = (typeof rows.rows)[number];
  const visibleRows = sortByUse
    ? [...rows.rows].sort((a, b) => b.usageCount - a.usageCount || b.updatedAt - a.updatedAt)
    : rows.rows;
  const narrow = (apply: () => void) => {
    apply();
    rows.goToPage(1);
  };
  const pageHref = (row: PageRow) => `${basePath}/${row.pageId}`;

  // Taking pages off the shelf (Anthony, 2026-08-20: clearing a workspace's
  // documents left "the wiki still full" with no way to empty it).
  const action = useAdminAction({ scope: "admin-wiki-pages" });
  const deletePageCompany = useMutation(api.wikiPages.deletePageForCompany);
  const deletePageGlobal = useMutation(api.wikiPages.deletePageForGlobal);
  const clearWikiCompany = useMutation(api.wikiPages.clearWikiForCompany);
  const [pageToDelete, setPageToDelete] = useState<{ pageId: Id<"wikiPages">; title: string } | null>(null);
  const [deletePageError, setDeletePageError] = useState("");
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [clearWikiError, setClearWikiError] = useState("");

  const handleConfirmPageDelete = async () => {
    if (!pageToDelete) return;
    setDeletePageError("");
    const outcome = await action.run(
      () =>
        companyId
          ? deletePageCompany({ companyId, pageId: pageToDelete.pageId })
          : deletePageGlobal({ pageId: pageToDelete.pageId }),
      { key: "delete", suppressErrorToast: true, fallbackMessage: t("delete.failed") },
    );
    if (outcome.ok) {
      setPageToDelete(null);
      return;
    }
    if (outcome.message) setDeletePageError(outcome.message);
  };

  const handleConfirmClearWiki = async () => {
    if (!companyId) return;
    setClearWikiError("");
    const outcome = await action.run(
      async () => {
        // Batched on the server; pressed once here. The loop ends when the
        // wiki reports itself empty, however many pages it held.
        let remaining = 1;
        while (remaining > 0) {
          const result = await clearWikiCompany({ companyId });
          remaining = result.remaining;
        }
      },
      { key: "clear", suppressErrorToast: true, fallbackMessage: t("clear.failed") },
    );
    if (outcome.ok) {
      setIsClearConfirmOpen(false);
      return;
    }
    if (outcome.message) setClearWikiError(outcome.message);
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-6 pb-12">
      <WikiQuickSwitcher companyId={companyId} basePath={basePath} />
      {/* Inside a section's frame, which draws the section's title and rule. */}
      <PageHeader
        icon={<BookOpen className="h-6 w-6 text-brand" />}
        title={companyId ? t("title") : t("globalTitle")}
        description={companyId ? t("subtitle", { platformName }) : t("globalSubtitle")}
        action={
          <WikiPagesActions companyId={companyId} basePath={basePath}>
            {companyId && canWrite && rows.rows.length > 0 ? (
              <Button
                variant="outline"
                onClick={() => setIsClearConfirmOpen(true)}
                className="inline-flex items-center gap-2 whitespace-nowrap hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                {t("clear.button")}
              </Button>
            ) : null}
          </WikiPagesActions>
        }
      />
      <Notice>
        <p>{companyId ? t("scopeCompany") : t("scopeGlobal")}</p>
      </Notice>
      <DataTable<PageRow>
        rows={rows.isLoading ? undefined : visibleRows}
        rowKey={(row) => row.pageId}
        onRowClick={(row) => router.push(pageHref(row))}
        search={{
          value: search,
          onChange: (value) => narrow(() => setSearch(value)),
          placeholder: t("searchPlaceholder"),
        }}
        filters={
          <>
            <TableFilterSelect
              label={t("kindFilter.label")}
              options={WIKI_KINDS.map((kind) => t(`kinds.${kind}`))}
              value={kindFilter ? t(`kinds.${kindFilter}`) : null}
              onChange={(next) =>
                narrow(() => setKindFilter(next ? (WIKI_KINDS.find((kind) => t(`kinds.${kind}`) === next) ?? null) : null))
              }
              allLabel={t("kindFilter.all")}
              filterPlaceholder={t("kindFilter.search")}
              noMatchesLabel={t("kindFilter.noMatches")}
            />
            {tagOptions.length > 0 ? (
              <TableFilterSelect
                label={t("tagFilter.label")}
                options={tagOptions}
                value={tagFilter}
                onChange={(next) => narrow(() => setTagFilter(next))}
                allLabel={t("tagFilter.all")}
                filterPlaceholder={t("tagFilter.search")}
                noMatchesLabel={t("tagFilter.noMatches")}
              />
            ) : null}
          </>
        }
        // Only Used is pressed: the list itself arrives newest change first, a
        // page at a time, and a second press goes back to that.
        sort={{ key: sortByUse ? "used" : "", direction: "desc", onSort: () => narrow(() => setSortByUse((was) => !was)) }}
        empty={{
          icon: <BookOpen className="h-5 w-5" aria-hidden="true" />,
          label: search.trim()
            ? t("emptySearch")
            : companyId
              ? t("emptyState", { platformName })
              : t("globalEmptyState"),
        }}
        footer={{
          mode: "paged",
          page: rows.page,
          totalPages: rows.totalPages,
          totalCount: rows.loadedCount,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: rows.isBusy,
          onPageChange: rows.goToPage,
          labels: { empty: t("empty") },
        }}
        columns={[
          {
            key: "page",
            header: t("columns.customer"),
            className: `min-w-[160px] ${CUT_COLUMN.first}`,
            cell: (row) => (
              <RecordLinkCell href={pageHref(row)} cut className="text-[13px] font-medium text-foreground">
                {row.title}
              </RecordLinkCell>
            ),
          },
          {
            key: "kind",
            header: t("kindFilter.label"),
            className: "whitespace-nowrap",
            cell: (row) => <TagLabel>{t(`kinds.${row.kind}`)}</TagLabel>,
          },
          {
            key: "used",
            header: t("columns.used"),
            sortable: true,
            align: "right",
            className: "whitespace-nowrap",
            cell: (row) =>
              row.usageCount > 0 ? (
                <span className="text-[13px] tabular-nums text-foreground">{t("used.count", { count: row.usageCount })}</span>
              ) : Date.now() - row.createdAt > NEVER_USED_AGE_MS ? (
                <StatusLabel tone="neutral">{t("used.never")}</StatusLabel>
              ) : (
                <NoFigure />
              ),
          },
          {
            key: "lastChange",
            header: t("columns.lastChange"),
            className: "whitespace-nowrap",
            cell: (row) => (
              <span className="text-[13px] text-secondary">
                {describeSource(row.lastRewriteSource)} · {formatDate(row.updatedAt)}
              </span>
            ),
          },
          {
            key: "sources",
            header: t("columns.sources"),
            align: "right",
            className: "whitespace-nowrap",
            cell: (row) =>
              row.sourceCount > 0 ? <span className="text-[13px] tabular-nums text-secondary">{row.sourceCount}</span> : <NoFigure />,
          },
          {
            key: "actions",
            hiddenHeader: t("delete.button"),
            align: "right",
            // A read-only viewer gets no Delete, as PagePrimaryAction removes itself.
            cell: (row) =>
              canWrite ? (
                <RowIconButton label={t("delete.button")} tone="danger" onClick={() => setPageToDelete({ pageId: row.pageId, title: row.title })}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </RowIconButton>
              ) : null,
          },
        ]}
      />

      <ConfirmationModal
        isOpen={pageToDelete !== null}
        onClose={() => {
          setPageToDelete(null);
          setDeletePageError("");
        }}
        title={t("delete.title")}
        size="sm"
        cancelLabel={t("delete.cancel")}
        confirmLabel={t("delete.action")}
        isSubmitting={action.isBusy("delete")}
        onConfirm={() => void handleConfirmPageDelete()}
        error={deletePageError || undefined}
      >
        <p>{t("delete.confirm", { title: pageToDelete?.title ?? "" })}</p>
      </ConfirmationModal>

      {companyId ? (
        <ConfirmationModal
          isOpen={isClearConfirmOpen}
          onClose={() => {
            setIsClearConfirmOpen(false);
            setClearWikiError("");
          }}
          title={t("clear.title")}
          size="sm"
          cancelLabel={t("delete.cancel")}
          confirmLabel={action.isBusy("clear") ? t("clear.clearing") : t("clear.action")}
          isSubmitting={action.isBusy("clear")}
          onConfirm={() => void handleConfirmClearWiki()}
          error={clearWikiError || undefined}
        >
          <p>{t("clear.confirm")}</p>
        </ConfirmationModal>
      ) : null}
    </div>
  );
}
