"use client";

import { useState } from "react";

import { useTranslations } from "next-intl";
import { Inbox } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import {
  PaginationFooter,
  SearchBar,
  TableEmptyRow,
  TableHeaderCell,
  TableHeaderRow,
  TableLoadingRow,
  TableShell,
} from "@/src/ui/components/screens/Table";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { useServerPagedTable } from "@/src/hooks/useServerPagedTable";
import { formatDateTime } from "@/src/lib/dates";

type Decision = "PENDING" | "REPLIED" | "TASK" | "SKIPPED";

const DECISION_FILTERS: Array<{ value: Decision | "ALL"; labelKey: string }> = [
  { value: "ALL", labelKey: "filter.all" },
  { value: "REPLIED", labelKey: "filter.replied" },
  { value: "TASK", labelKey: "filter.task" },
  { value: "SKIPPED", labelKey: "filter.skipped" },
];

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
  const [search, setSearch] = useState("");
  const [decision, setDecision] = useState<Decision | "ALL">("ALL");

  const searchTerm = search.trim();
  const mail = useServerPagedTable(api.mailbox.listMailboxForCompany, {
    companyId,
    ...(searchTerm ? { searchTerm } : {}),
    ...(decision === "ALL" ? {} : { decision }),
  });

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

      <p className="text-[13px] leading-relaxed text-secondary max-w-2xl">{t("hint")}</p>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder={t("searchPlaceholder")}
          />
        </div>
        <div className="flex items-center gap-1 rounded-[12px] border border-border-dim bg-card/40 p-1">
          {DECISION_FILTERS.map((option) => (
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
      </div>

      <TableShell
        minWidthClassName="min-w-[760px]"
        footer={
          <PaginationFooter
            page={mail.page}
            totalPages={mail.totalPages}
            totalCount={mail.loadedCount}
            pageSize={TABLE_PAGE_SIZE}
            isLoading={mail.isLoadingMore}
            onPageChange={mail.goToPage}
            labels={{ empty: t("empty") }}
          />
        }
      >
        <thead>
          <TableHeaderRow>
            <TableHeaderCell>{t("columns.from")}</TableHeaderCell>
            <TableHeaderCell>{t("columns.subject")}</TableHeaderCell>
            <TableHeaderCell>{t("columns.decision")}</TableHeaderCell>
            <TableHeaderCell>{t("columns.when")}</TableHeaderCell>
          </TableHeaderRow>
        </thead>
        <tbody>
          {mail.isLoading ? (
            <TableLoadingRow colSpan={4} />
          ) : mail.rows.length === 0 ? (
            <TableEmptyRow
              colSpan={4}
              icon={<Inbox className="w-5 h-5" />}
              label={searchTerm || decision !== "ALL" ? t("emptyFiltered") : t("emptyState")}
            />
          ) : (
            mail.rows.map((row) => (
              <tr
                key={row._id}
                className="group border-b border-border-dim/40 last:border-b-0 hover:bg-hover/40 transition-colors"
              >
                <td className="px-4 py-4 text-[13px] text-foreground whitespace-nowrap max-w-[240px]">
                  <span className="block truncate">{row.sender}</span>
                </td>
                <td className="px-4 py-4 text-[13px] text-foreground max-w-[380px]">
                  <span className="line-clamp-2">{row.subject}</span>
                  {row.decisionReason && (
                    <span className="block text-[12px] text-muted truncate mt-0.5">
                      {row.decisionReason}
                    </span>
                  )}
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${decisionClass[row.decision] ?? "text-secondary"}`}
                  >
                    {t(`decision.${row.decision}`)}
                  </span>
                </td>
                <td className="px-4 py-4 text-[13px] text-secondary whitespace-nowrap">
                  {formatDateTime(row.createdAt)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </TableShell>
    </div>
  );
}
