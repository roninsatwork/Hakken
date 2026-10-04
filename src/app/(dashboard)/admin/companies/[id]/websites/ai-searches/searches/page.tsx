"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Search, Trash2 } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Field } from "@/src/ui/components/screens/Field";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { SaveError } from "@/src/ui/components/screens/SaveControls";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import useDebounce from "@/src/hooks/useDebounce";
import { RemoveSearchDialog, type SearchToRemove } from "../../site/[companyWebsiteId]/RemoveSearchDialog";
import { WebsitePicker, chosenWebsite, useAiLists } from "../_components/AiLists";
import { AddBar } from "../../_components/AddBar";

/**
 * Google searches, for All websites: every search the company checks on
 * Google, across all its own websites, with where it came from — added here,
 * or tracked from what the AI searched (FA9). Removing one asks first, as a
 * website's own Google searches page does; that page, opened by choosing the
 * website in the section's menu, has each search's position
 * (docs/plans/active/websites-section-menu-plan.md).
 */
export default function CompanyTrackedSearchesPage() {
  const t = useTranslations("admin.companyAiLists");
  const ts = useTranslations("admin.companyAiLists.searches");
  const tSection = useTranslations("admin.websitesSection");
  const { companyId, counts } = useAiLists();

  const [draft, setDraft] = useState("");
  const [site, setSite] = useState("");
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [removing, setRemoving] = useState<SearchToRemove | null>(null);
  const debouncedSearch = useDebounce(searchTerm, 400);

  const addKeyword = useMutation(api.websiteCanonical.addWebsiteKeyword);
  const action = useAdminAction({ scope: "admin-company-searches" });
  const searches = useQuery(api.companyAiLists.listCompanySearches, {
    companyId,
    searchTerm: debouncedSearch,
    page,
    pageSize: TABLE_PAGE_SIZE,
  });
  const isLoading = searches === undefined;
  const website = chosenWebsite(site, counts?.websites);

  const handleAdd = async () => {
    if (!website) return;
    setError("");
    const outcome = await action.run(
      () => addKeyword({ companyWebsiteId: website.companyWebsiteId, keyword: draft, addedFrom: "HAND" }),
      { key: "add", suppressErrorToast: true, fallbackMessage: ts("errors.addFailed") },
    );
    if (outcome.ok) setDraft("");
    else setError(outcome.message);
  };

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <PageHeader
        icon={<Search className="h-6 w-6 text-brand" />}
        title={tSection("pages.searches")}
        description={ts("description")}
      />

      <AddBar
        label={ts("add")}
        disabled={!website || action.isBusy("add") || draft.trim().length === 0}
        onAdd={() => void handleAdd()}
        below={
          <>
            {website ? <span className="text-[11px] text-muted">{ts("limit", { count: website.everydayKeywords })}</span> : null}
            <SaveError>{error}</SaveError>
          </>
        }
      >
        <Field
          id="company-search"
          label={ts("addLabel")}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={ts("addPlaceholder")}
          wrapperClassName="flex-1 min-w-[18rem]"
        />
        <WebsitePicker id="company-search-website" value={website?.companyWebsiteId ?? ""} onChange={setSite} websites={counts?.websites ?? []} />
      </AddBar>

      {searches?.cut ? <p className="text-[12px] text-muted">{t("cut", { count: searches.totalCount })}</p> : null}

      <DataTable
        rows={isLoading ? undefined : searches.data}
        rowKey={(row) => row._id}
        search={{
          value: searchTerm,
          onChange: (value) => {
            setSearchTerm(value);
            setPage(1);
          },
          placeholder: ts("searchPlaceholder"),
        }}
        empty={{
          icon: <Search className="h-8 w-8 text-muted/30" />,
          label: searchTerm ? ts("noMatch") : ts("empty"),
        }}
        footer={{
          mode: "paged",
          page,
          totalPages: searches?.totalPages ?? 1,
          totalCount: searches?.totalCount ?? 0,
          pageSize: TABLE_PAGE_SIZE,
          isLoading,
          onPageChange: setPage,
          labels: { empty: searchTerm ? ts("noMatch") : ts("empty") },
        }}
        columns={[
          {
            key: "keyword",
            header: ts("columns.search"),
            cell: (row) => <span className="text-[13px] text-foreground">{row.keyword}</span>,
          },
          {
            key: "website",
            header: ts("columns.website"),
            cell: (row) => <span className="text-[12px] text-secondary">{row.host}</span>,
          },
          {
            key: "from",
            header: ts("columns.from"),
            cell: (row) => <span className="text-[12px] text-secondary">{ts(`from.${row.addedFrom}`)}</span>,
          },
          {
            key: "state",
            header: ts("columns.state"),
            cell: (row) => (
              <StatusLabel tone={row.isActive ? "success" : "neutral"}>
                {row.isActive ? ts("checking") : ts("paused")}
              </StatusLabel>
            ),
          },
          {
            key: "actions",
            header: ts("columns.actions"),
            align: "right",
            cell: (row) => (
              <RowActions alwaysVisible>
                <RowIconButton label={ts("remove")} tone="danger" onClick={() => setRemoving({ keywordId: row._id, keyword: row.keyword })}>
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
