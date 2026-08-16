"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Phone } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AdminPageHeader } from "@/src/app/(dashboard)/admin/_components/AdminPageHeader";
import {
  AdminPaginationFooter,
  AdminSearchBar,
  AdminTableEmptyRow,
  AdminTableHeaderCell,
  AdminTableHeaderRow,
  AdminTableLoadingRow,
  AdminTableShell,
} from "@/src/app/(dashboard)/admin/_components/AdminTable";

const PAGE_SIZE = 15;

/**
 * A company's calls, from the admin's seat (seven-gaps plan, phase 1).
 * The work was always recorded and only workspace staff could see it.
 * Numbers stay masked here exactly as on the tenant list — the full
 * number lives only on the call's own page.
 */
export function CompanyCallsScreen({ companyId }: { companyId: Id<"companies"> }) {
  const t = useTranslations("aiCalls");
  const tCalls = useTranslations("calls");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const calls = useQuery(api.telephony.listCallsForCompany, { companyId });
  const isLoading = calls === undefined;

  // Blue/amber tokens with written labels, never green-vs-red.
  const statusClass: Record<string, string> = {
    RINGING: "bg-warning/15 text-warning",
    IN_PROGRESS: "bg-info/15 text-info",
    COMPLETED: "bg-foreground/10 text-secondary",
    FAILED: "bg-foreground/5 text-muted",
  };

  const needle = search.trim().toLowerCase();
  const filtered = (calls ?? []).filter((call) =>
    needle
      ? (call.summary ?? "").toLowerCase().includes(needle) ||
        call.fromMasked.toLowerCase().includes(needle)
      : true
  );
  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const visibleRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-6 pb-12 w-full">
      <AdminPageHeader
        icon={<Phone className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={t("subtitle")}
        divider
      />

      <div className="max-w-md">
        <AdminSearchBar
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder={t("searchPlaceholder")}
        />
      </div>

      <AdminTableShell
        minWidthClassName="min-w-[760px]"
        footer={
          <AdminPaginationFooter
            page={page}
            totalPages={totalPages}
            totalCount={totalCount}
            pageSize={PAGE_SIZE}
            isLoading={isLoading}
            onPageChange={setPage}
            labels={{ empty: t("empty") }}
          />
        }
      >
        <thead>
          <AdminTableHeaderRow>
            <AdminTableHeaderCell>{t("columns.caller")}</AdminTableHeaderCell>
            <AdminTableHeaderCell>{t("columns.about")}</AdminTableHeaderCell>
            <AdminTableHeaderCell>{t("columns.status")}</AdminTableHeaderCell>
            <AdminTableHeaderCell>{t("columns.when")}</AdminTableHeaderCell>
            <AdminTableHeaderCell align="right">{t("columns.exchanges")}</AdminTableHeaderCell>
          </AdminTableHeaderRow>
        </thead>
        <tbody>
          {isLoading ? (
            <AdminTableLoadingRow colSpan={5} />
          ) : visibleRows.length === 0 ? (
            <AdminTableEmptyRow
              colSpan={5}
              icon={<Phone className="w-5 h-5" />}
              label={search.trim() ? t("emptyFiltered") : t("emptyState")}
            />
          ) : (
            visibleRows.map((call) => (
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
                  {new Date(call.startedAt).toLocaleString([], {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td className="px-4 py-4 text-right text-[13px] text-foreground tabular-nums">
                  {call.turnCount}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </AdminTableShell>
    </div>
  );
}
