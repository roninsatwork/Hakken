"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { MessageSquare, Plus, Trash2 } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { VERDICT_THRESHOLDS } from "@/convex/utils/trackingVerdicts";
import { Button } from "@/src/ui/components/screens/Button";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Field } from "@/src/ui/components/screens/Field";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { SaveError } from "@/src/ui/components/screens/SaveControls";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import useDebounce from "@/src/hooks/useDebounce";
import { EngineChips, useEngineChoice, useEngineLabel } from "@/src/app/(dashboard)/admin/_components/EngineChoice";
import { QUESTION_TONE, formatMonthly } from "../siteView";

/**
 * The questions put to the AI engines about this site, each judged and priced.
 *
 * "Named 3 of 14" counts every answer, including the ones that named nobody we
 * know — which is what makes "never landed" a fact rather than a guess. Each
 * row's cost is per engine per collection, which is why the engines chosen for
 * a new question sit right beside the box it is typed into.
 *
 * Like the searches, these are the website's own list, shared with every
 * client watching it.
 */
export function TrackedQuestions({
  websiteId,
  companyWebsiteId,
  host,
  place,
}: {
  websiteId: Id<"websites">;
  companyWebsiteId: Id<"companyWebsites">;
  host: string;
  place: string;
}) {
  const t = useTranslations("admin.siteView.questions");
  const tView = useTranslations("admin.siteView");

  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(searchTerm, 400);

  const engineChoice = useEngineChoice();
  const engineLabel = useEngineLabel();
  const addQuestion = useMutation(api.websiteCanonical.addWebsiteQuestion);
  const setActive = useMutation(api.websiteCanonical.setWebsiteQuestionActive);
  const removeQuestion = useMutation(api.websiteCanonical.removeWebsiteQuestion);
  const action = useAdminAction({ scope: "admin-site-questions" });

  const rows = useQuery(api.websiteClientView.listTrackedQuestions, {
    companyWebsiteId,
    searchTerm: debouncedSearch,
    page,
    pageSize: TABLE_PAGE_SIZE,
  });
  const isLoading = rows === undefined;
  const unknown = tView("priceUnknownShort");

  const run = async (key: string, work: () => Promise<unknown>, fallback: string) => {
    setError("");
    const outcome = await action.run(work, { key, suppressErrorToast: true, fallbackMessage: fallback });
    if (!outcome.ok) setError(outcome.message);
    return outcome.ok;
  };

  const handleAdd = async () => {
    const added = await run(
      "add",
      () => addQuestion({ websiteId, prompt: draft, engines: engineChoice.chosen }),
      t("errors.addFailed"),
    );
    if (added) setDraft("");
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={<MessageSquare className="h-5 w-5 text-brand" />}
        title={t("title")}
        description={t("subtitle", { host, place })}
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
            disabled={action.isBusy("add") || draft.trim().length === 0 || engineChoice.chosen.length === 0}
            onClick={() => void handleAdd()}
          >
            <Plus className="mr-1 inline h-3.5 w-3.5" />
            {t("add")}
          </Button>
        </div>
        <EngineChips all={engineChoice.all} chosen={engineChoice.chosen} onToggle={engineChoice.toggle} />
        <span className="text-[11px] text-muted">{t("addHint", { count: engineChoice.chosen.length })}</span>
        <SaveError>{error}</SaveError>
      </div>

      <DataTable
        rows={isLoading ? undefined : rows.data}
        rowKey={(row) => row._id}
        minWidthClassName="min-w-[880px]"
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
          totalPages: rows?.totalPages ?? 1,
          totalCount: rows?.totalCount ?? 0,
          pageSize: TABLE_PAGE_SIZE,
          isLoading,
          onPageChange: setPage,
          labels: { empty: searchTerm ? t("noMatch") : t("empty") },
        }}
        columns={[
          {
            key: "question",
            header: t("questionColumn"),
            cell: (row) => (
              <div className="flex flex-col gap-0.5">
                <span className="text-[13px] text-foreground">{row.prompt}</span>
                <span className="text-[11px] text-muted">
                  {row.weeksRunning === null ? t("notAskedYet") : t("runningFor", { weeks: row.weeksRunning })}
                </span>
              </div>
            ),
          },
          {
            key: "named",
            header: t("namedColumn"),
            cell: (row) => (
              row.asked === 0
                ? <span className="text-[12px] text-muted">–</span>
                : (
                  <span className="font-mono text-[13px] text-foreground">
                    {t("namedOf", { named: row.named, asked: row.asked })}
                  </span>
                )
            ),
          },
          {
            key: "engines",
            header: t("enginesColumn"),
            cell: (row) => (
              <span className="text-[12px] text-secondary">{row.engines.map(engineLabel).join(", ")}</span>
            ),
          },
          {
            key: "verdict",
            header: t("verdictColumn"),
            cell: (row) => (
              row.isActive
                ? <StatusPill tone={QUESTION_TONE[row.verdict]}>{t(`verdicts.${row.verdict}`)}</StatusPill>
                : <StatusPill tone="neutral">{t("paused")}</StatusPill>
            ),
          },
          {
            key: "cost",
            header: t("costColumn"),
            cell: (row) => (
              <span className="font-mono text-[12px] text-secondary">{formatMonthly(row.monthlyUsd, unknown)}</span>
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
                  onClick={() => void run(row._id, () => setActive({ questionId: row._id, isActive: !row.isActive }), t("errors.toggleFailed"))}
                >
                  {row.isActive ? t("pause") : t("resume")}
                </Button>
                <RowIconButton
                  label={t("remove")}
                  tone="danger"
                  onClick={() => void run(row._id, () => removeQuestion({ questionId: row._id }), t("errors.removeFailed"))}
                >
                  <Trash2 className="h-4 w-4" />
                </RowIconButton>
              </RowActions>
            ),
          },
        ]}
      />

      <p className="text-[11px] leading-relaxed text-muted">
        {t("thresholds", {
          neverWeeks: VERDICT_THRESHOLDS.neverLandedDays / 7,
          newWeeks: VERDICT_THRESHOLDS.tooNewDays / 7,
        })}
      </p>
    </div>
  );
}
