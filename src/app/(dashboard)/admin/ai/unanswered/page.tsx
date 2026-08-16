"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { MessageCircleQuestion } from "lucide-react";
import { api } from "@/convex/_generated/api";
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
import { AiWorkspaceNav } from "@/src/app/(dashboard)/admin/ai/_components/AiWorkspaceNav";

const PAGE_SIZE = 15;

type ScopeFilter = "ALL" | "PLATFORM" | "COMPANIES";

/**
 * The dedicated unanswered-questions screen (Anthony's ruling,
 * 2026-08-17): every open gap across company and global in one place,
 * each row naming where it lives. Super-admin console — the one seat
 * from which every brain is already visible.
 */
export default function UnansweredQuestionsPage() {
  const t = useTranslations("aiUnanswered");
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<ScopeFilter>("ALL");
  const [page, setPage] = useState(1);

  const rows = useQuery(
    api.wikiFeedback.listAllUnanswered,
    search.trim() ? { search: search.trim() } : {}
  );
  const dismissCompany = useMutation(api.wikiFeedback.dismissUnansweredForCompany);
  const dismissGlobal = useMutation(api.wikiFeedback.dismissUnansweredForGlobal);

  const filtered = (rows ?? []).filter((row) =>
    scope === "ALL" ? true : scope === "PLATFORM" ? !row.companyId : Boolean(row.companyId)
  );
  const isLoading = rows === undefined;
  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const visibleRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const scopeOptions: Array<{ value: ScopeFilter; label: string }> = [
    { value: "ALL", label: t("filter.all") },
    { value: "PLATFORM", label: t("filter.platform") },
    { value: "COMPANIES", label: t("filter.companies") },
  ];

  return (
    <div className="flex flex-col gap-6 pb-12 w-full">
      <AdminPageHeader
        icon={<MessageCircleQuestion className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={t("subtitle")}
        divider
      />

      <AiWorkspaceNav />

      <p className="text-[13px] leading-relaxed text-secondary max-w-2xl">{t("hint")}</p>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <AdminSearchBar
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder={t("searchPlaceholder")}
          />
        </div>
        <div className="flex items-center gap-1 rounded-[12px] border border-border-dim bg-card/40 p-1">
          {scopeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setScope(option.value);
                setPage(1);
              }}
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
            <AdminTableHeaderCell>{t("columns.question")}</AdminTableHeaderCell>
            <AdminTableHeaderCell>{t("columns.where")}</AdminTableHeaderCell>
            <AdminTableHeaderCell align="right">{t("columns.asked")}</AdminTableHeaderCell>
            <AdminTableHeaderCell>{t("columns.lastAsked")}</AdminTableHeaderCell>
            <AdminTableHeaderCell align="right">{t("columns.actions")}</AdminTableHeaderCell>
          </AdminTableHeaderRow>
        </thead>
        <tbody>
          {isLoading ? (
            <AdminTableLoadingRow colSpan={5} />
          ) : visibleRows.length === 0 ? (
            <AdminTableEmptyRow
              colSpan={5}
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
                <td className="px-4 py-4 whitespace-nowrap">
                  {row.companyId ? (
                    <Link
                      href={`/admin/companies/${row.companyId}/ai/pages`}
                      className="text-[13px] text-brand hover:underline"
                    >
                      {row.companyName}
                    </Link>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-brand/10 text-brand text-[11px] font-medium">
                      {t("platform")}
                      {row.companyCount > 0 && (
                        <> · {t("acrossCompanies", { count: row.companyCount })}</>
                      )}
                    </span>
                  )}
                </td>
                <td className="px-4 py-4 text-right text-[13px] text-foreground font-medium tabular-nums">
                  {row.askCount}×
                </td>
                <td className="px-4 py-4 text-[13px] text-secondary whitespace-nowrap">
                  {new Date(row.lastAskedAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-4 text-right whitespace-nowrap">
                  <Link
                    href={row.companyId ? `/admin/companies/${row.companyId}/ai/pages` : "/admin/ai/knowledge"}
                    className="px-3 py-1 rounded-[8px] bg-brand text-white text-[12px] font-medium hover:opacity-90 transition-opacity mr-2"
                  >
                    {t("feedWiki")}
                  </Link>
                  <AdminWriteButton
                    onClick={() =>
                      void (row.companyId
                        ? dismissCompany({
                            companyId: row.companyId,
                            unansweredId: row.unansweredId,
                          })
                        : dismissGlobal({ unansweredId: row.unansweredId }))
                    }
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
