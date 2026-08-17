"use client";

import { useState } from "react";
import Link from "next/link";

import { useTranslations } from "next-intl";
import { Phone } from "lucide-react";
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

type CallStatus = "RINGING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";

const STATUS_FILTERS: Array<{ value: CallStatus | "ALL"; labelKey: string }> = [
  { value: "ALL", labelKey: "filter.all" },
  { value: "COMPLETED", labelKey: "filter.completed" },
  { value: "FAILED", labelKey: "filter.failed" },
];

/**
 * A company's calls, from the admin's seat (seven-gaps plan, phase 1).
 * The work was always recorded and only workspace staff could see it.
 * Numbers stay masked here exactly as on the tenant list — the full
 * number lives only on the call's own page.
 *
 * Searching, filtering and paging all happen in the query. A company with
 * a year of calls costs the same to open as one with five, and the browser
 * never holds more than a page.
 */
export function CompanyCallsScreen({ companyId }: { companyId: Id<"companies"> }) {
  const t = useTranslations("aiCalls");
  const tCalls = useTranslations("calls");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<CallStatus | "ALL">("ALL");

  const searchTerm = search.trim();
  const calls = useServerPagedTable(api.telephony.listCallsForCompany, {
    companyId,
    ...(searchTerm ? { searchTerm } : {}),
    ...(status === "ALL" ? {} : { status }),
  });

  // Blue/amber tokens with written labels, never green-vs-red.
  const statusClass: Record<string, string> = {
    RINGING: "bg-warning/15 text-warning",
    IN_PROGRESS: "bg-info/15 text-info",
    COMPLETED: "bg-foreground/10 text-secondary",
    FAILED: "bg-foreground/5 text-muted",
  };

  return (
    <div className="flex flex-col gap-6 pb-12 w-full">
      <PageHeader
        icon={<Phone className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={t("subtitle")}
        divider
      />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder={t("searchPlaceholder")}
          />
        </div>
        <div className="flex items-center gap-1 rounded-[12px] border border-border-dim bg-card/40 p-1">
          {STATUS_FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setStatus(option.value)}
              className={`px-3 py-1.5 rounded-[9px] text-[12px] font-medium transition-colors ${
                status === option.value
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
            page={calls.page}
            totalPages={calls.totalPages}
            totalCount={calls.loadedCount}
            pageSize={TABLE_PAGE_SIZE}
            isLoading={calls.isLoadingMore}
            onPageChange={calls.goToPage}
            labels={{ empty: t("empty") }}
          />
        }
      >
        <thead>
          <TableHeaderRow>
            <TableHeaderCell>{t("columns.caller")}</TableHeaderCell>
            <TableHeaderCell>{t("columns.about")}</TableHeaderCell>
            <TableHeaderCell>{t("columns.status")}</TableHeaderCell>
            <TableHeaderCell>{t("columns.when")}</TableHeaderCell>
            <TableHeaderCell align="right">{t("columns.exchanges")}</TableHeaderCell>
          </TableHeaderRow>
        </thead>
        <tbody>
          {calls.isLoading ? (
            <TableLoadingRow colSpan={5} />
          ) : calls.rows.length === 0 ? (
            <TableEmptyRow
              colSpan={5}
              icon={<Phone className="w-5 h-5" />}
              label={searchTerm || status !== "ALL" ? t("emptyFiltered") : t("emptyState")}
            />
          ) : (
            calls.rows.map((call) => (
              <tr
                key={call._id}
                className="group border-b border-border-dim/40 last:border-b-0 hover:bg-hover/40 transition-colors"
              >
                <td className="px-4 py-4 whitespace-nowrap">
                  <Link
                    href={`calls/${call._id}`}
                    className="font-mono text-[13px] text-brand hover:underline"
                  >
                    {call.fromMasked}
                  </Link>
                </td>
                <td className="px-4 py-4 text-[13px] text-foreground max-w-[380px]">
                  <span className="line-clamp-2">{call.summary ?? "—"}</span>
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${statusClass[call.status] ?? "text-secondary"}`}
                  >
                    {tCalls(`status.${call.status}`)}
                  </span>
                </td>
                <td className="px-4 py-4 text-[13px] text-secondary whitespace-nowrap">
                  {formatDateTime(call.startedAt)}
                </td>
                <td className="px-4 py-4 text-right text-[13px] text-foreground tabular-nums">
                  {call.turnCount}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </TableShell>
    </div>
  );
}
