"use client";

import { useState } from "react";

import { useTranslations } from "next-intl";
import { Inbox } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { useServerPagedTable } from "@/src/hooks/useServerPagedTable";
import { DecisionPill } from "@/src/ui/components/screens/DecisionPill";
import { formatDateTime } from "@/src/lib/dates";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";

type Decision = "PENDING" | "REPLIED" | "TASK" | "SKIPPED";
/** "NOT_SURE" is a certainty filter, not a decision: mail a Decision struggled with. */
type Filter = Decision | "ALL" | "NOT_SURE";

const DECISION_FILTERS: Array<{ value: Filter; labelKey: string }> = [
  { value: "ALL", labelKey: "filter.all" },
  { value: "REPLIED", labelKey: "filter.replied" },
  { value: "TASK", labelKey: "filter.task" },
  { value: "SKIPPED", labelKey: "filter.skipped" },
  { value: "NOT_SURE", labelKey: "filter.notSure" },
];

function parseSpread(value?: string): Record<string, number> | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, number>) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A company's handled mail (seven-gaps plan, phase 1). The Gmail watcher
 * recorded every message it saw from day one — sender, subject and what
 * the AI decided, never the body — and no screen ever showed it.
 *
 * Searching, filtering and paging happen in the query, so an inbox with
 * ten thousand messages opens as fast as an empty one.
 */
export function CompanyMailboxScreen({ companyId }: { companyId: Id<"companies"> }) {
  const t = useTranslations("aiMailbox");
  const tDecisions = useTranslations("decisions");
  const { platformName } = useSystemSettings();
  const [search, setSearch] = useState("");
  const [decision, setDecision] = useState<Filter>("ALL");

  const searchTerm = search.trim();
  const mail = useServerPagedTable(api.mailbox.listMailboxForCompany, {
    companyId,
    ...(searchTerm ? { searchTerm } : {}),
    ...(decision === "ALL" || decision === "NOT_SURE" ? {} : { decision }),
    ...(decision === "NOT_SURE" ? { certainty: "NOT_SURE" as const } : {}),
  });

  const answerLabel = (copyKey: string, answer: string) =>
    tDecisions.has(`catalogue.${copyKey}.answers.${answer}`) ? tDecisions(`catalogue.${copyKey}.answers.${answer}`) : answer;

  // Blue/amber tokens with written labels, never green-vs-red.
  const decisionClass: Record<string, string> = {
    REPLIED: "bg-info/15 text-info",
    TASK: "bg-warning/15 text-warning",
    PENDING: "bg-foreground/10 text-secondary",
    SKIPPED: "bg-foreground/5 text-muted",
  };

  return (
    <div className="flex flex-col gap-6 pb-12 w-full">
      <PageHeader
        icon={<Inbox className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={t("subtitle")}
        divider
      />

      <p className="text-[13px] leading-relaxed text-secondary max-w-2xl">{t("hint", { platformName })}</p>

      <DataTable
        rows={mail.isLoading ? undefined : mail.rows}
        rowKey={(row) => row._id}
        minWidthClassName="min-w-[760px]"
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <div className="flex items-center gap-1 rounded-[12px] border border-border-dim bg-card/40 p-1">
            {DECISION_FILTERS.map((option) => (
              /* Raw: segmented filter — the active option swaps its colours; no kit variant is stateful. */
              <button
                key={option.value}
                type="button"
                onClick={() => setDecision(option.value)}
                className={`px-3 py-1.5 rounded-[9px] text-[12px] font-medium transition-colors ${
                  decision === option.value
                    ? "bg-brand text-white"
                    : "text-secondary hover:text-foreground"
                }`}
              >
                {t(option.labelKey)}
              </button>
            ))}
          </div>
        }
        empty={{
          icon: <Inbox className="w-5 h-5" />,
          label: searchTerm || decision !== "ALL" ? t("emptyFiltered") : t("emptyState"),
        }}
        footer={{
          mode: "paged",
          page: mail.page,
          totalPages: mail.totalPages,
          totalCount: mail.loadedCount,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: mail.isBusy,
          onPageChange: mail.goToPage,
          labels: { empty: t("empty") },
        }}
        columns={[
          {
            key: "from",
            header: t("columns.from"),
            className: "whitespace-nowrap max-w-[240px]",
            cell: (row) => <span className="block truncate text-[13px] text-foreground">{row.sender}</span>,
          },
          {
            key: "subject",
            header: t("columns.subject"),
            className: "max-w-[380px]",
            cell: (row) => (
              <>
                <span className="line-clamp-2 text-[13px] text-foreground">{row.subject}</span>
                {/* The Decisions that judged this email, one pill each; the
                    written reason stands in until a Decision has run. */}
                {row.decisions.length > 0 ? (
                  <span className="mt-1 flex flex-wrap gap-1">
                    {row.decisions.map((run) => (
                      <DecisionPill
                        key={run.key}
                        name={answerLabel(run.copyKey, run.answer)}
                        certainty={run.certainty ?? null}
                        probabilities={parseSpread(run.probabilities)}
                        chosen={run.answer}
                      />
                    ))}
                  </span>
                ) : row.decisionReason ? (
                  <span className="block text-[12px] text-muted truncate mt-0.5">{row.decisionReason}</span>
                ) : null}
              </>
            ),
          },
          {
            key: "decision",
            header: t("columns.decision", { platformName }),
            className: "whitespace-nowrap",
            cell: (row) => (
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${decisionClass[row.decision] ?? "text-secondary"}`}>
                {t(`decision.${row.decision}`)}
              </span>
            ),
          },
          {
            key: "when",
            header: t("columns.when"),
            className: "whitespace-nowrap",
            cell: (row) => <span className="text-[13px] text-secondary">{formatDateTime(row.createdAt)}</span>,
          },
        ]}
      />
    </div>
  );
}
