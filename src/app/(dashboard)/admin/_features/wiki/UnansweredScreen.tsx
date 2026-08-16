"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { MessageCircleQuestion } from "lucide-react";
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
import { AdminWriteButton } from "@/src/app/(dashboard)/admin/_components/AdminAccessLevel";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";
import { useServerPagedTable } from "@/src/app/(dashboard)/admin/_lib/useServerPagedTable";
import { AiWorkspaceNav } from "@/src/app/(dashboard)/admin/ai/_components/AiWorkspaceNav";

type ScopeFilter = "ALL" | "PLATFORM" | "COMPANIES";

type Row = {
  unansweredId: Id<"wikiUnansweredQuestions">;
  question: string;
  askCount: number;
  lastAskedAt: number;
  companyId?: Id<"companies"> | null;
  companyName?: string | null;
  companyCount?: number;
};

/**
 * The Unanswered screen, mounted at two heights (Anthony's ruling,
 * 2026-08-17: "it's on every company and also the global AI"): on each
 * company's AI menu showing that company's own gaps, and on the platform
 * console showing every gap across company and global with a scope
 * filter. One screen, one anatomy.
 */
export function UnansweredScreen({
  companyId,
  feedWikiHref,
  showWorkspaceNav,
}: {
  companyId?: Id<"companies">;
  /** Where "Feed the wiki" sends the reader in company mode. */
  feedWikiHref?: string;
  showWorkspaceNav?: boolean;
}) {
  const t = useTranslations("aiUnanswered");
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<ScopeFilter>("ALL");

  // Searching, filtering and paging all happen in the query: this list is
  // real demand and only grows.
  const searchTerm = search.trim();
  const allRows = useServerPagedTable(
    api.wikiFeedback.listAllUnanswered,
    companyId ? "skip" : { ...(searchTerm ? { search: searchTerm } : {}), scope }
  );
  const companyRows = useServerPagedTable(
    api.wikiFeedback.listUnansweredForCompany,
    companyId ? { companyId, ...(searchTerm ? { search: searchTerm } : {}) } : "skip"
  );
  const rows = companyId ? companyRows : allRows;
  const visibleRows: Row[] = rows.rows;

  const dismissCompany = useMutation(api.wikiFeedback.dismissUnansweredForCompany);
  const dismissGlobal = useMutation(api.wikiFeedback.dismissUnansweredForGlobal);

  const isLoading = rows.isLoading;

  const scopeOptions: Array<{ value: ScopeFilter; label: string }> = [
    { value: "ALL", label: t("filter.all") },
    { value: "PLATFORM", label: t("filter.platform") },
    { value: "COMPANIES", label: t("filter.companies") },
  ];

  const dismiss = (row: Row) =>
    row.companyId
      ? dismissCompany({ companyId: row.companyId, unansweredId: row.unansweredId })
      : companyId
        ? dismissCompany({ companyId, unansweredId: row.unansweredId })
        : dismissGlobal({ unansweredId: row.unansweredId });

  const columnCount = companyId ? 4 : 5;

  return (
    <div className="flex flex-col gap-6 pb-12 w-full">
      <AdminPageHeader
        icon={<MessageCircleQuestion className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={companyId ? t("subtitleCompany") : t("subtitle")}
        divider
      />

      {showWorkspaceNav && <AiWorkspaceNav />}

      <p className="text-[13px] leading-relaxed text-secondary max-w-2xl">
        {companyId ? t("hintCompany") : t("hint")}
      </p>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <AdminSearchBar
            value={search}
            onChange={setSearch}
            placeholder={t("searchPlaceholder")}
          />
        </div>
        {!companyId && (
          <div className="flex items-center gap-1 rounded-[12px] border border-border-dim bg-card/40 p-1">
            {scopeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setScope(option.value)}
                className={`px-3 py-1.5 rounded-[9px] text-[12px] font-medium transition-colors ${
                  scope === option.value
                    ? "bg-brand text-white"
                    : "text-secondary hover:text-foreground"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <AdminTableShell
        minWidthClassName="min-w-[760px]"
        footer={
          <AdminPaginationFooter
            page={rows.page}
            totalPages={rows.totalPages}
            totalCount={rows.loadedCount}
            pageSize={ADMIN_PAGE_SIZE}
            isLoading={rows.isLoadingMore}
            onPageChange={rows.goToPage}
            labels={{ empty: t("empty") }}
          />
        }
      >
        <thead>
          <AdminTableHeaderRow>
            <AdminTableHeaderCell>{t("columns.question")}</AdminTableHeaderCell>
            {!companyId && <AdminTableHeaderCell>{t("columns.where")}</AdminTableHeaderCell>}
            <AdminTableHeaderCell align="right">{t("columns.asked")}</AdminTableHeaderCell>
            <AdminTableHeaderCell>{t("columns.lastAsked")}</AdminTableHeaderCell>
            <AdminTableHeaderCell align="right">{t("columns.actions")}</AdminTableHeaderCell>
          </AdminTableHeaderRow>
        </thead>
        <tbody>
          {isLoading ? (
            <AdminTableLoadingRow colSpan={columnCount} />
          ) : visibleRows.length === 0 ? (
            <AdminTableEmptyRow
              colSpan={columnCount}
              icon={<MessageCircleQuestion className="w-5 h-5" />}
              label={search.trim() || scope !== "ALL" ? t("emptyFiltered") : t("emptyState")}
            />
          ) : (
            visibleRows.map((row) => (
              <tr
                key={row.unansweredId}
                className="group border-b border-border-dim/40 last:border-b-0 hover:bg-hover/40 transition-colors"
              >
                <td className="px-4 py-4 text-[14px] text-foreground max-w-[420px]">
                  <span className="line-clamp-2">“{row.question}”</span>
                </td>
                {!companyId && (
                  <td className="px-4 py-4 whitespace-nowrap">
                    {row.companyId ? (
                      <Link
                        href={`/admin/companies/${row.companyId}/ai/unanswered`}
                        className="text-[13px] text-brand hover:underline"
                      >
                        {row.companyName}
                      </Link>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-brand/10 text-brand text-[11px] font-medium">
                        {t("platform")}
                        {(row.companyCount ?? 0) > 0 && (
                          <> · {t("acrossCompanies", { count: row.companyCount ?? 0 })}</>
                        )}
                      </span>
                    )}
                  </td>
                )}
                <td className="px-4 py-4 text-right text-[13px] text-foreground font-medium tabular-nums">
                  {row.askCount}×
                </td>
                <td className="px-4 py-4 text-[13px] text-secondary whitespace-nowrap">
                  {new Date(row.lastAskedAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-4 text-right whitespace-nowrap">
                  <Link
                    href={
                      companyId
                        ? (feedWikiHref ?? "../pages")
                        : row.companyId
                          ? `/admin/companies/${row.companyId}/ai/pages`
                          : "/admin/ai/knowledge"
                    }
                    className="px-3 py-1 rounded-[8px] bg-brand text-white text-[12px] font-medium hover:opacity-90 transition-opacity mr-2"
                  >
                    {t("feedWiki")}
                  </Link>
                  <AdminWriteButton
                    onClick={() => void dismiss(row)}
                    className="px-3 py-1 rounded-[8px] border border-border-dim text-secondary text-[12px] font-medium hover:text-foreground transition-colors"
                  >
                    {t("dismiss")}
                  </AdminWriteButton>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </AdminTableShell>
    </div>
  );
}
