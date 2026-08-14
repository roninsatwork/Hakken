"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { BookOpen, Pin } from "lucide-react";
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
import { AiWorkspaceNav } from "../_components/AiWorkspaceNav";

const PAGE_SIZE = 15;

/**
 * The customer wiki's front room (wiki plan, phase 3): every page Sonae
 * tends for this workspace, newest movement first. Reading is for any
 * admin-section member; changing anything happens on the page itself.
 */
export default function WikiPagesListPage() {
  const t = useTranslations("aiPages");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const rows = useQuery(api.wikiPages.listCompanyPages, {
    ...(search.trim() ? { search: search.trim() } : {}),
  });

  const isLoading = rows === undefined;
  const totalCount = rows?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const visibleRows = (rows ?? []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const describeSource = (source: string) => {
    if (source.startsWith("PHONE_CALL:")) return t("sources.phone");
    if (source.startsWith("EMAIL:")) return t("sources.email");
    if (source.startsWith("HUMAN:")) return t("sources.human");
    if (source === "TENDING") return t("sources.tending");
    return source;
  };

  return (
    <div className="flex flex-col gap-6 pb-12 w-full">
      <AdminPageHeader
        icon={<BookOpen className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={t("subtitle")}
        divider
      />

      <AiWorkspaceNav />

      <p className="text-[13px] leading-relaxed text-secondary max-w-2xl">{t("hint")}</p>

      <AdminSearchBar
        value={search}
        onChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        placeholder={t("searchPlaceholder")}
      />

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
            <AdminTableHeaderCell>{t("columns.customer")}</AdminTableHeaderCell>
            <AdminTableHeaderCell>{t("columns.remembers")}</AdminTableHeaderCell>
            <AdminTableHeaderCell>{t("columns.lastChange")}</AdminTableHeaderCell>
            <AdminTableHeaderCell align="right">{t("columns.rewrites")}</AdminTableHeaderCell>
          </AdminTableHeaderRow>
        </thead>
        <tbody>
          {isLoading ? (
            <AdminTableLoadingRow colSpan={4} />
          ) : visibleRows.length === 0 ? (
            <AdminTableEmptyRow
              colSpan={4}
              icon={<BookOpen className="w-5 h-5" />}
              label={search.trim() ? t("emptySearch") : t("emptyState")}
            />
          ) : (
            visibleRows.map((row) => (
              <tr
                key={row.pageId}
                className="group border-b border-border-dim/40 last:border-b-0 hover:bg-hover/40 transition-colors"
              >
                <td className="px-4 py-4">
                  <Link
                    href={`/admin/ai/pages/${row.pageId}`}
                    className="flex items-center gap-2 text-[14px] font-medium text-foreground hover:text-brand transition-colors"
                  >
                    {row.title}
                    {row.pinnedCount > 0 && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand/10 text-brand text-[11px] font-medium">
                        <Pin className="w-3 h-3" />
                        {row.pinnedCount}
                      </span>
                    )}
                  </Link>
                </td>
                <td className="px-4 py-4 text-[13px] text-secondary max-w-[380px]">
                  <span className="line-clamp-2">{row.preview}</span>
                </td>
                <td className="px-4 py-4 text-[13px] text-secondary whitespace-nowrap">
                  {describeSource(row.lastRewriteSource)} · {new Date(row.updatedAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-4 text-right text-[13px] text-secondary">{row.rewriteCount}</td>
              </tr>
            ))
          )}
        </tbody>
      </AdminTableShell>
    </div>
  );
}
