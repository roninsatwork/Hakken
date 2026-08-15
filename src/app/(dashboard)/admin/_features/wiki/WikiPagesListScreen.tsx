"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { AlertTriangle, BookOpen, Network, Pin, X } from "lucide-react";
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
import { AiWorkspaceNav } from "@/src/app/(dashboard)/admin/ai/_components/AiWorkspaceNav";
import { WikiImportBox } from "./WikiImportBox";

const PAGE_SIZE = 15;

/**
 * The wiki's front room, mounted at two heights (Anthony's ruling,
 * 2026-08-14): inside the workspace, and on the company detail screen —
 * always one company's pages, never a cross-company view. `companyId`
 * chooses the door; the furniture is identical.
 */
export function WikiPagesListScreen({
  companyId,
  basePath,
  showWorkspaceNav,
}: {
  companyId?: Id<"companies">;
  basePath: string;
  showWorkspaceNav?: boolean;
}) {
  const t = useTranslations("aiPages");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const searchArg = search.trim() ? { search: search.trim() } : {};
  // Two doors, one mounted: hooks must both be called, so the unused door
  // is skipped rather than conditionally omitted.
  const tenantRows = useQuery(api.wikiPages.listCompanyPages, companyId ? "skip" : searchArg);
  const companyRows = useQuery(
    api.wikiPages.listPagesForCompany,
    companyId ? { companyId, ...searchArg } : "skip"
  );
  const rows = companyId ? companyRows : tenantRows;

  const tenantProgress = useQuery(api.wikiDistill.getDistillProgress, companyId ? "skip" : {});
  const companyProgress = useQuery(
    api.wikiDistill.getDistillProgressForCompany,
    companyId ? { companyId } : "skip"
  );
  const progress = companyId ? companyProgress : tenantProgress;

  const tenantQuestions = useQuery(api.wikiQuestions.listOpenQuestions, companyId ? "skip" : {});
  const companyQuestions = useQuery(
    api.wikiQuestions.listOpenQuestionsForCompany,
    companyId ? { companyId } : "skip"
  );
  const openQuestions = (companyId ? companyQuestions : tenantQuestions) ?? [];
  const dismissTenant = useMutation(api.wikiQuestions.dismissOpenQuestion);
  const dismissCompany = useMutation(api.wikiQuestions.dismissOpenQuestionForCompany);
  const dismissQuestion = (questionId: (typeof openQuestions)[number]["questionId"]) =>
    companyId ? dismissCompany({ companyId, questionId }) : dismissTenant({ questionId });
  const pageHrefForKey = (pageKey: string) => {
    const row = (rows ?? []).find(
      (candidate) => `${candidate.kind}:${candidate.subjectKey}` === pageKey
    );
    return row ? `${basePath}/${row.pageId}` : null;
  };

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

      {showWorkspaceNav && <AiWorkspaceNav />}

      <p className="text-[13px] leading-relaxed text-secondary max-w-2xl">{t("hint")}</p>

      <WikiImportBox companyId={companyId} />

      {/* The distiller's honest progress (design, screen 2), only while
          there is genuinely something left to read. */}
      {progress?.isReading && (
        <div className="flex flex-col gap-3 rounded-[16px] border border-border-dim bg-card/40 p-5">
          <div className="flex items-baseline justify-between gap-4 flex-wrap">
            <span className="text-[14px] font-semibold text-foreground">{t("progress.title")}</span>
            <span className="text-[12px] text-secondary tabular-nums">
              {t("progress.count", {
                done: progress.totalDocuments - progress.remainingDocuments,
                total: progress.totalDocuments,
              })}
            </span>
          </div>
          <div className="h-[7px] rounded-full bg-foreground/5 overflow-hidden">
            <div
              className="h-full bg-brand rounded-full transition-all"
              style={{
                width: `${Math.round(
                  ((progress.totalDocuments - progress.remainingDocuments) /
                    Math.max(progress.totalDocuments, 1)) *
                    100
                )}%`,
              }}
            />
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12.5px] text-secondary">
            <span>{t("progress.written", { count: progress.pagesWritten })}</span>
            <span>{t("progress.improved", { count: progress.pagesImproved })}</span>
            {progress.lastDocumentTitle && (
              <span className="flex items-center gap-2">
                <i className="w-[7px] h-[7px] rounded-full bg-brand inline-block" />
                {t("progress.nowReading", { title: progress.lastDocumentTitle })}
              </span>
            )}
          </div>
        </div>
      )}

      {/* The staff's findings, for a person to settle (wiki-agents plan,
          phase 1): the machine's ceiling is raising the question. */}
      {openQuestions.length > 0 && (
        <div className="flex flex-col gap-3 rounded-[16px] border border-warning/40 bg-card/40 p-5">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold text-foreground">
            <AlertTriangle className="w-4 h-4 text-warning" />
            {t("questions.title", { count: openQuestions.length })}
          </h2>
          <p className="text-[12px] text-secondary">{t("questions.hint")}</p>
          <ul className="flex flex-col gap-2">
            {openQuestions.map((question) => {
              const hrefA = pageHrefForKey(question.pageKeyA);
              const hrefB = question.pageKeyB ? pageHrefForKey(question.pageKeyB) : null;
              return (
                <li
                  key={question.questionId}
                  className="flex items-start justify-between gap-3 rounded-[10px] border border-border-dim/60 bg-background px-4 py-3"
                >
                  <div className="flex flex-col gap-1 text-[13px]">
                    <span className="text-foreground">
                      {hrefA ? (
                        <Link href={hrefA} className="text-brand hover:underline">
                          {question.pageKeyA.split(":")[1]}
                        </Link>
                      ) : (
                        question.pageKeyA.split(":")[1]
                      )}
                      : “{question.claimA}”
                    </span>
                    {question.pageKeyB && question.claimB && (
                      <span className="text-foreground">
                        {hrefB ? (
                          <Link href={hrefB} className="text-brand hover:underline">
                            {question.pageKeyB.split(":")[1]}
                          </Link>
                        ) : (
                          question.pageKeyB.split(":")[1]
                        )}
                        : “{question.claimB}”
                      </span>
                    )}
                    {question.detail && (
                      <span className="text-[12px] text-secondary">{question.detail}</span>
                    )}
                  </div>
                  <AdminWriteButton
                    onClick={() => void dismissQuestion(question.questionId)}
                    aria-label={t("questions.dismiss")}
                    title={t("questions.dismiss")}
                    className="text-muted hover:text-foreground transition-colors shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </AdminWriteButton>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="flex-1">
          <AdminSearchBar
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder={t("searchPlaceholder")}
          />
        </div>
        <Link
          href={`${basePath}/map`}
          className="flex items-center gap-2 px-4 py-3 rounded-[12px] border border-border-dim bg-card/40 text-[13px] font-medium text-foreground hover:border-brand/50 hover:text-brand transition-colors whitespace-nowrap"
        >
          <Network className="w-4 h-4" />
          {t("map.open")}
        </Link>
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
            <AdminTableHeaderCell>{t("columns.customer")}</AdminTableHeaderCell>
            <AdminTableHeaderCell>{t("columns.remembers")}</AdminTableHeaderCell>
            <AdminTableHeaderCell>{t("columns.lastChange")}</AdminTableHeaderCell>
            <AdminTableHeaderCell align="right">{t("columns.sources")}</AdminTableHeaderCell>
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
                    href={`${basePath}/${row.pageId}`}
                    className="flex items-center gap-2 text-[14px] font-medium text-foreground hover:text-brand transition-colors"
                  >
                    {row.title}
                    <span className="px-2 py-0.5 rounded-full bg-foreground/5 border border-border-dim/60 text-secondary text-[11px] font-medium">
                      {t(`kinds.${row.kind}`)}
                    </span>
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
                <td className="px-4 py-4 text-right text-[13px] text-secondary tabular-nums">
                  {row.sourceCount > 0 ? row.sourceCount : "—"}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </AdminTableShell>
    </div>
  );
}
