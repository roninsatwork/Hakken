"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, Search, Trash2 } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Button } from "@/src/ui/components/screens/Button";
import { Field } from "@/src/ui/components/screens/Field";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { SaveError } from "@/src/ui/components/screens/SaveControls";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import useDebounce from "@/src/hooks/useDebounce";

/**
 * The searches this host is checked against.
 *
 * The half of the product that had no screen at all: position tracking has
 * written `seoKeywordPositions` since it shipped, and nothing anywhere could
 * say which searches to check. This is that list.
 *
 * On the host rather than on a client's hold, so one list is bought once per
 * place its watchers use rather than once per watcher. What people mean by each
 * phrase comes from the same judgment store the rankings and fan-out screens
 * read, so a phrase met twice is judged once and paid for once — and an
 * unjudged one says so instead of guessing.
 */
export default function WebsiteKeywordsPage() {
  const t = useTranslations("admin.websiteDetail.keywords");
  const params = useParams();
  const websiteId = params.websiteId as Id<"websites">;

  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(searchTerm, 400);

  const addKeyword = useMutation(api.websiteCanonical.addWebsiteKeyword);
  const setActive = useMutation(api.websiteCanonical.setWebsiteKeywordActive);
  const removeKeyword = useMutation(api.websiteCanonical.removeWebsiteKeyword);
  const action = useAdminAction({ scope: "admin-website-keywords" });

  const keywords = useQuery(api.websiteCanonical.listWebsiteKeywords, {
    websiteId,
    searchTerm: debouncedSearch,
    page,
    pageSize: TABLE_PAGE_SIZE,
  });

  const isLoading = keywords === undefined;

  const handleAdd = async () => {
    setError("");
    const outcome = await action.run(
      () => addKeyword({ websiteId, keyword: draft }),
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

  const handleRemove = async (keywordId: Id<"websiteKeywords">) => {
    setError("");
    const outcome = await action.run(
      () => removeKeyword({ keywordId }),
      { key: keywordId, suppressErrorToast: true, fallbackMessage: t("errors.removeFailed") },
    );
    if (!outcome.ok) setError(outcome.message);
  };

  const intentLabel = (intent: string | null) => {
    if (intent === "BUYING") return t("intents.BUYING");
    if (intent === "RESEARCHING") return t("intents.RESEARCHING");
    if (intent === "BRANDED") return t("intents.BRANDED");
    if (intent === "IRRELEVANT") return t("intents.IRRELEVANT");
    if (intent === "OTHER") return t("intents.OTHER");
    return t("unjudged");
  };

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <PageHeader
        icon={<Search className="h-6 w-6 text-brand" />}
        title={t("title")}
        description={t("subtitle")}
      />

      <div className="flex flex-col gap-3 rounded-[12px] border border-border-dim bg-card/40 p-4">
        <div className="flex flex-wrap items-end gap-2">
          <Field
            id="website-keyword"
            label={t("addLabel")}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t("addPlaceholder")}
            wrapperClassName="flex-1 min-w-[16rem]"
          />
          <Button
            variant="quiet"
            className="px-3 py-2 text-[12px]"
            disabled={action.isBusy("add") || draft.trim().length === 0}
            onClick={() => void handleAdd()}
          >
            <Plus className="mr-1 inline h-3.5 w-3.5" />
            {t("add")}
          </Button>
        </div>
        {/* What a cycle buys, on screen rather than discovered on an invoice. */}
        <span className="text-[11px] text-muted">
          {isLoading ? "" : t("tracking", { count: keywords.activeCount })}
        </span>
        <SaveError>{error}</SaveError>
      </div>

      <DataTable
        rows={isLoading ? undefined : keywords.data}
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
        empty={{
          icon: <Search className="h-8 w-8 text-muted/30" />,
          label: searchTerm ? t("noMatch") : t("empty"),
        }}
        footer={{
          mode: "paged",
          page,
          totalPages: keywords?.totalPages ?? 1,
          totalCount: keywords?.totalCount ?? 0,
          pageSize: TABLE_PAGE_SIZE,
          isLoading,
          onPageChange: setPage,
          labels: { empty: searchTerm ? t("noMatch") : t("empty") },
        }}
        columns={[
          {
            key: "keyword",
            header: t("keywordColumn"),
            cell: (row) => <span className="text-[13px] text-foreground">{row.keyword}</span>,
          },
          {
            key: "intent",
            header: t("intentColumn"),
            cell: (row) => (
              <span className={`text-[12px] ${row.intent ? "text-secondary" : "text-muted"}`}>
                {intentLabel(row.intent)}
              </span>
            ),
          },
          {
            key: "state",
            header: t("stateColumn"),
            cell: (row) => (
              <StatusPill tone={row.isActive ? "success" : "neutral"}>
                {row.isActive ? t("active") : t("paused")}
              </StatusPill>
            ),
          },
          {
            key: "actions",
            header: t("actionsColumn"),
            align: "right",
            cell: (row) => (
              <RowActions>
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
                  onClick={() => void handleRemove(row._id)}
                >
                  <Trash2 className="h-4 w-4" />
                </RowIconButton>
              </RowActions>
            ),
          },
        ]}
      />
    </div>
  );
}
