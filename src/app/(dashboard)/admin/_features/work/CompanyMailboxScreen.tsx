"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Inbox } from "lucide-react";
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
 * A company's handled mail (seven-gaps plan, phase 1). The Gmail watcher
 * recorded every message it saw from day one — sender, subject and what
 * the AI decided, never the body — and no screen ever showed it. This
 * one does.
 */
export function CompanyMailboxScreen({ companyId }: { companyId: Id<"companies"> }) {
  const t = useTranslations("aiMailbox");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const rows = useQuery(api.mailbox.listMailboxForCompany, { companyId });
  const isLoading = rows === undefined;

  // Blue/amber tokens with written labels, never green-vs-red.
  const decisionClass: Record<string, string> = {
    REPLIED: "bg-info/15 text-info",
    TASK: "bg-warning/15 text-warning",
    PENDING: "bg-foreground/10 text-secondary",
    SKIPPED: "bg-foreground/5 text-muted",
  };

  const needle = search.trim().toLowerCase();
  const filtered = (rows ?? []).filter((row) =>
    needle
      ? row.sender.toLowerCase().includes(needle) || row.subject.toLowerCase().includes(needle)
      : true
  );
  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const visibleRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-6 pb-12 w-full">
      <AdminPageHeader
        icon={<Inbox className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={t("subtitle")}
        divider
      />

      <p className="text-[13px] leading-relaxed text-secondary max-w-2xl">{t("hint")}</p>

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
            <AdminTableHeaderCell>{t("columns.from")}</AdminTableHeaderCell>
            <AdminTableHeaderCell>{t("columns.subject")}</AdminTableHeaderCell>
            <AdminTableHeaderCell>{t("columns.decision")}</AdminTableHeaderCell>
            <AdminTableHeaderCell>{t("columns.when")}</AdminTableHeaderCell>
          </AdminTableHeaderRow>
        </thead>
        <tbody>
          {isLoading ? (
            <AdminTableLoadingRow colSpan={4} />
          ) : visibleRows.length === 0 ? (
            <AdminTableEmptyRow
              colSpan={4}
              icon={<Inbox className="w-5 h-5" />}
              label={search.trim() ? t("emptyFiltered") : t("emptyState")}
            />
          ) : (
            visibleRows.map((row) => (
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
                  {new Date(row.createdAt).toLocaleString([], {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </AdminTableShell>
    </div>
  );
}
