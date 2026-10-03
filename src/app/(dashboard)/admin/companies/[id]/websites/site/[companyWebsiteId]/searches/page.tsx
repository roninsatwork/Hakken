"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search, Trash2 } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/src/ui/components/screens/Button";
import { Change } from "@/src/ui/components/screens/Change";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Field } from "@/src/ui/components/screens/Field";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { SaveError } from "@/src/ui/components/screens/SaveControls";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import useDebounce from "@/src/hooks/useDebounce";
import { SEARCH_TONE } from "../siteView";
import { RemoveSearchDialog, type SearchToRemove } from "../RemoveSearchDialog";
import { AddBar } from "../../../_components/AddBar";

/**
 * The Google searches this company tracks for its site, and how the site does
 * on each.
 *
 * The company's own list (docs/plans/active/private-tracking-lists-plan.md,
 * V4): no other company watching the website sees it, and a search two
 * companies track is still checked once. Added, paused and removed here — the
 * controls moved from the shared website record on 2026-09-26 — and added
 * from *What the AI searched* too. The rows arrive judged and sorted by what
 * needs attention, dropping first.
 */
export default function CompanySiteSearchesPage() {
  const t = useTranslations("admin.siteView.searches");
  const params = useParams();
  const companyWebsiteId = params.companyWebsiteId as Id<"companyWebsites">;

  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(searchTerm, 400);
  const [removing, setRemoving] = useState<SearchToRemove | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  const addKeyword = useMutation(api.websiteCanonical.addWebsiteKeyword);
  const setActive = useMutation(api.websiteCanonical.setWebsiteKeywordActive);
  const action = useAdminAction({ scope: "admin-site-searches" });

  const header = useQuery(api.websiteClientView.getSiteHeader, { companyWebsiteId });
  const rows = useQuery(api.websiteClientView.listTrackedSearches, {
    companyWebsiteId,
    searchTerm: debouncedSearch,
    page,
    pageSize: TABLE_PAGE_SIZE,
  });
  const isLoading = rows === undefined;
  const empty = searchTerm ? t("noMatch") : t("empty");

  const handleAdd = async () => {
    setError("");
    const outcome = await action.run(
      () => addKeyword({ companyWebsiteId, keyword: draft }),
      { key: "add", suppressErrorToast: true, fallbackMessage: t("errors.addFailed") },
    );
    if (outcome.ok) setDraft("");
    else setError(outcome.message);
  };

  /*
    Through the action runner rather than fired and forgotten: a bare
    `void mutation(...)` leaves a refused change looking applied, with nothing
    on screen to say otherwise.
  */
  const handleToggle = async (keywordId: Id<"websiteKeywords">, isActive: boolean) => {
    setError("");
    const outcome = await action.run(
      () => setActive({ keywordId, isActive }),
      { key: keywordId, suppressErrorToast: true, fallbackMessage: t("errors.toggleFailed") },
    );
    if (!outcome.ok) setError(outcome.message);
  };

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader
        icon={<Search className="h-5 w-5 text-brand" />}
        title={t("title")}
        description={header ? t("subtitle", { place: header.placeLabel }) : undefined}
      />

      <AddBar
        label={t("add")}
        disabled={action.isBusy("add") || draft.trim().length === 0}
        onAdd={() => void handleAdd()}
        below={
          <>
            {/* What a cycle buys, on screen rather than discovered on an invoice. */}
            <span className="text-[11px] text-muted">
              {header ? t("tracking", { count: header.counts.searches }) : ""}
            </span>
            <SaveError>{error}</SaveError>
          </>
        }
      >
        <Field
          id="site-search"
          label={t("addLabel")}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t("addPlaceholder")}
          wrapperClassName="flex-1 min-w-[16rem]"
        />
      </AddBar>

      <DataTable
        rows={isLoading ? undefined : rows.data}
        rowKey={(row) => row._id}
        minWidthClassName="min-w-[760px]"
        search={{
          value: searchTerm,
          onChange: (value) => {
            setSearchTerm(value);
            setPage(1);
          },
          placeholder: t("searchPlaceholder"),
        }}
        empty={{ icon: <Search className="h-8 w-8 text-muted/30" />, label: empty }}
        footer={{
          mode: "paged",
          page,
          totalPages: rows?.totalPages ?? 1,
          totalCount: rows?.totalCount ?? 0,
          pageSize: TABLE_PAGE_SIZE,
          isLoading,
          onPageChange: setPage,
          labels: { empty },
        }}
        columns={[
          {
            key: "search",
            header: t("searchColumn"),
            cell: (row) => <span className="text-[13px] text-foreground">{row.keyword}</span>,
          },
          {
            key: "position",
            header: t("positionColumn"),
            cell: (row) => {
              if (row.lastCheckedDay === null) return <span className="text-[12px] text-muted">{t("notCheckedYet")}</span>;
              if (row.lastPosition === null) return <span className="text-[12px] text-muted">{t("notOnPage")}</span>;
              // Places risen since the check before: a smaller position number is better.
              const risen = row.previousPosition === null ? 0 : row.previousPosition - row.lastPosition;
              return (
                <span className="flex items-center gap-1.5 font-mono text-[13px] text-foreground">
                  {row.lastPosition}
                  {risen !== 0 ? <Change by={risen} /> : null}
                </span>
              );
            },
          },
          {
            // The day Google was last checked for it, so a position is never
            // read without knowing how old it is (Anthony, 2026-09-23).
            key: "lastChecked",
            header: t("lastCheckedColumn"),
            cell: (row) => (
              <span className="text-[12px] text-secondary">{row.lastCheckedDay ?? "—"}</span>
            ),
          },
          {
            key: "verdict",
            header: t("verdictColumn"),
            cell: (row) => (
              row.isActive
                ? <StatusLabel tone={SEARCH_TONE[row.verdict]}>{t(`verdicts.${row.verdict}`)}</StatusLabel>
                : <StatusLabel tone="neutral">{t("paused")}</StatusLabel>
            ),
          },
          {
            key: "actions",
            header: t("actionsColumn"),
            align: "right",
            cell: (row) => (
              <RowActions alwaysVisible>
                <Button
                  variant="quiet"
                  className="px-2 py-1 text-[11px]"
                  disabled={action.isBusy(row._id)}
                  onClick={() => void handleToggle(row._id, !row.isActive)}
                >
                  {row.isActive ? t("pause") : t("resume")}
                </Button>
                <RowIconButton
                  label={t("remove")}
                  tone="danger"
                  onClick={() => setRemoving({ keywordId: row._id, keyword: row.keyword })}
                >
                  <Trash2 className="h-4 w-4" />
                </RowIconButton>
              </RowActions>
            ),
          },
        ]}
      />
      <RemoveSearchDialog target={removing} onClose={() => setRemoving(null)} />
    </div>
  );
}
