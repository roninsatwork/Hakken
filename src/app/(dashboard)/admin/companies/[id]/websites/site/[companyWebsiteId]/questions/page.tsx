"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { MessageSquare, Plus, Trash2 } from "lucide-react";

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
import { EngineChips, useEngineChoice, useEngineLabel } from "@/src/app/(dashboard)/admin/_components/EngineChoice";
import { ResultsSwitcher } from "../ResultsSwitcher";

/**
 * What the AI engines are asked about this website, for this company.
 *
 * The company's own list (docs/plans/active/private-tracking-lists-plan.md,
 * V4): no other company watching the website sees these questions, and two
 * companies asking the same one still buy one answer. Moved here from the
 * shared website record, controls unchanged, when the lists stopped being
 * shared (2026-09-26).
 *
 * The engine choice is real here. `addTrackedPrompt` accepted an `engines`
 * argument that no screen ever passed, so every question went to all four
 * forever and the cheapest lever in the feature could not be pulled.
 */
export default function CompanySiteQuestionsPage() {
  const t = useTranslations("admin.siteView.questions");
  const params = useParams();
  const companyWebsiteId = params.companyWebsiteId as Id<"companyWebsites">;

  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(searchTerm, 400);

  const addQuestion = useMutation(api.websiteCanonical.addWebsiteQuestion);
  const setActive = useMutation(api.websiteCanonical.setWebsiteQuestionActive);
  const removeQuestion = useMutation(api.websiteCanonical.removeWebsiteQuestion);
  const action = useAdminAction({ scope: "admin-site-questions" });

  const questions = useQuery(api.websiteCanonical.listWebsiteQuestions, {
    companyWebsiteId,
    searchTerm: debouncedSearch,
    page,
    pageSize: TABLE_PAGE_SIZE,
  });

  const isLoading = questions === undefined;

  const engineChoice = useEngineChoice();
  const engines = engineChoice.chosen;
  const engineLabel = useEngineLabel();

  const handleAdd = async () => {
    setError("");
    const outcome = await action.run(
      () => addQuestion({ companyWebsiteId, prompt: draft, engines }),
      { key: "add", suppressErrorToast: true, fallbackMessage: t("errors.addFailed") },
    );
    if (outcome.ok) setDraft("");
    else setError(outcome.message);
  };

  const handleToggle = async (questionId: Id<"websiteQuestions">, isActive: boolean) => {
    setError("");
    const outcome = await action.run(
      () => setActive({ questionId, isActive }),
      { key: questionId, suppressErrorToast: true, fallbackMessage: t("errors.toggleFailed") },
    );
    if (!outcome.ok) setError(outcome.message);
  };

  const handleRemove = async (questionId: Id<"websiteQuestions">) => {
    setError("");
    const outcome = await action.run(
      () => removeQuestion({ questionId }),
      { key: questionId, suppressErrorToast: true, fallbackMessage: t("errors.removeFailed") },
    );
    if (!outcome.ok) setError(outcome.message);
  };

  return (
    <div className="flex w-full flex-col gap-5">
      <ResultsSwitcher active="questions" />
      <PageHeader
        icon={<MessageSquare className="h-5 w-5 text-brand" />}
        title={t("title")}
        description={t("subtitle")}
      />

      <div className="flex flex-col gap-3 rounded-[12px] border border-border-dim bg-card/40 p-4">
        <div className="flex flex-wrap items-end gap-2">
          <Field
            id="site-question"
            label={t("addLabel")}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t("addPlaceholder")}
            wrapperClassName="flex-1 min-w-[18rem]"
          />
          <Button
            variant="quiet"
            className="px-3 py-2 text-[12px]"
            disabled={action.isBusy("add") || draft.trim().length === 0 || engines.length === 0}
            onClick={() => void handleAdd()}
          >
            <Plus className="mr-1 inline h-3.5 w-3.5" />
            {t("add")}
          </Button>
        </div>

        <EngineChips all={engineChoice.all} chosen={engines} onToggle={engineChoice.toggle} />

        {/* What a cycle buys, and why nothing queues any more. */}
        <span className="text-[11px] text-muted">
          {isLoading ? "" : `${t("asked", { count: questions.engineCalls })} · ${t("live")}`}
        </span>
        <SaveError>{error}</SaveError>
      </div>

      <DataTable
        rows={isLoading ? undefined : questions.data}
        rowKey={(row) => row._id}
        minWidthClassName="min-w-[820px]"
        search={{
          value: searchTerm,
          onChange: (value) => {
            setSearchTerm(value);
            setPage(1);
          },
          placeholder: t("searchPlaceholder"),
        }}
        empty={{
          icon: <MessageSquare className="h-8 w-8 text-muted/30" />,
          label: searchTerm ? t("noMatch") : t("empty"),
        }}
        footer={{
          mode: "paged",
          page,
          totalPages: questions?.totalPages ?? 1,
          totalCount: questions?.totalCount ?? 0,
          pageSize: TABLE_PAGE_SIZE,
          isLoading,
          onPageChange: setPage,
          labels: { empty: searchTerm ? t("noMatch") : t("empty") },
        }}
        columns={[
          {
            key: "prompt",
            header: t("promptColumn"),
            cell: (row) => <span className="text-[13px] text-foreground">{row.prompt}</span>,
          },
          {
            key: "engines",
            header: t("enginesColumn"),
            cell: (row) => (
              <span className="text-[12px] text-secondary">
                {row.engines.map(engineLabel).join(", ")}
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
