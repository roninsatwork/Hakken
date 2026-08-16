"use client";

import { useState } from "react";
import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
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
 * The wiki's front room, mounted at two heights (Anthony's rulings,
 * 2026-08-14 and 2026-08-16): on the company detail screen — always one
 * company's pages, never a cross-company view — and, without a
 * `companyId`, the PLATFORM shelf, whose doors are the super admin's
 * alone. A company's wiki is never shown outside its own section.
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
  const [sortByUse, setSortByUse] = useState(false);
  const searchArg = search.trim() ? { search: search.trim() } : {};
  // Two doors, one mounted: hooks must both be called, so the unused door
  // is skipped rather than conditionally omitted.
  const globalRows = useQuery(api.wikiPages.listPagesForGlobal, companyId ? "skip" : searchArg);
  const companyRows = useQuery(
    api.wikiPages.listPagesForCompany,
    companyId ? { companyId, ...searchArg } : "skip"
  );
  const rows = companyId ? companyRows : globalRows;

  const globalProgress = useQuery(
    api.wikiDistill.getDistillProgressForGlobal,
    companyId ? "skip" : {}
  );
  const companyProgress = useQuery(
    api.wikiDistill.getDistillProgressForCompany,
    companyId ? { companyId } : "skip"
  );
  const progress = companyId ? companyProgress : globalProgress;

  const globalQuestions = useQuery(
    api.wikiQuestions.listOpenQuestionsForGlobal,
    companyId ? "skip" : {}
  );
  const companyQuestions = useQuery(
    api.wikiQuestions.listOpenQuestionsForCompany,
    companyId ? { companyId } : "skip"
  );
  const openQuestions = (companyId ? companyQuestions : globalQuestions) ?? [];
  const dismissGlobal = useMutation(api.wikiQuestions.dismissOpenQuestionForGlobal);
  const dismissCompany = useMutation(api.wikiQuestions.dismissOpenQuestionForCompany);
  const dismissQuestion = (questionId: (typeof openQuestions)[number]["questionId"]) =>
    companyId ? dismissCompany({ companyId, questionId }) : dismissGlobal({ questionId });
  const pageHrefForKey = (pageKey: string) => {
    const row = (rows ?? []).find(
      (candidate) => `${candidate.kind}:${candidate.subjectKey}` === pageKey
    );
    return row ? `${basePath}/${row.pageId}` : null;
  };

  const companyWeek = useQuery(
    api.wikiReport.getWeeklyReportForCompany,
    companyId ? { companyId } : "skip"
  );
  const globalWeek = useQuery(api.wikiReport.getWeeklyReportForGlobal, companyId ? "skip" : {});
  const weekReport = companyId ? companyWeek : globalWeek;

  const companyUnanswered = useQuery(
    api.wikiFeedback.listUnansweredForCompany,
    companyId ? { companyId } : "skip"
  );
  const globalUnanswered = useQuery(
    api.wikiFeedback.listUnansweredForGlobal,
    companyId ? "skip" : {}
  );
  const unanswered = (companyId ? companyUnanswered : globalUnanswered) ?? [];
  const dismissUnansweredCompany = useMutation(api.wikiFeedback.dismissUnansweredForCompany);
  const dismissUnansweredGlobal = useMutation(api.wikiFeedback.dismissUnansweredForGlobal);
  const dismissUnanswered = (unansweredId: (typeof unanswered)[number]["unansweredId"]) =>
    companyId
      ? dismissUnansweredCompany({ companyId, unansweredId })
      : dismissUnansweredGlobal({ unansweredId });

  const platformDrafts =
    useQuery(api.wikiExamGrowth.listProposedCasesForGlobal, companyId ? "skip" : {}) ?? [];
  const platformChecks =
    useQuery(api.wikiExamGrowth.listPlatformChecks, companyId ? "skip" : {}) ?? [];
  const decidePlatformDraft = useMutation(api.wikiExamGrowth.decideProposedCaseForGlobal);
  const runPlatformCheck = useAction(api.companyEvalRuns.runCheck);
  const [runningCheckId, setRunningCheckId] = useState<string | null>(null);

  const globalReviews = useQuery(api.wikiReviews.listPendingReviewsForGlobal, companyId ? "skip" : {});
  const companyReviews = useQuery(
    api.wikiReviews.listPendingReviewsForCompany,
    companyId ? { companyId } : "skip"
  );
  const pendingReviews = (companyId ? companyReviews : globalReviews) ?? [];
  const decideGlobal = useMutation(api.wikiReviews.decideReviewForGlobal);
  const decideCompany = useMutation(api.wikiReviews.decideReviewForCompany);
  const decideReview = (reviewId: (typeof pendingReviews)[number]["reviewId"], approve: boolean) =>
    companyId ? decideCompany({ companyId, reviewId, approve }) : decideGlobal({ reviewId, approve });

  const isLoading = rows === undefined;
  const totalCount = rows?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const orderedRows = sortByUse
    ? [...(rows ?? [])].sort((a, b) => b.usageCount - a.usageCount || b.updatedAt - a.updatedAt)
    : (rows ?? []);
  const visibleRows = orderedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const NEVER_USED_AGE_MS = 30 * 24 * 60 * 60 * 1000;

  const describeSource = (source: string) => {
    if (source.startsWith("PHONE_CALL:")) return t("sources.phone");
    if (source.startsWith("EMAIL:")) return t("sources.email");
    if (source.startsWith("HUMAN:")) return t("sources.human");
    if (source.startsWith("CHAT:")) return t("sources.chat");
    if (source === "TENDING") return t("sources.tending");
    return source;
  };

  return (
    <div className="flex flex-col gap-6 pb-12 w-full">
      <AdminPageHeader
        icon={<BookOpen className="w-6 h-6 text-brand" />}
        title={companyId ? t("title") : t("globalTitle")}
        description={companyId ? t("subtitle") : t("globalSubtitle")}
        divider
      />

      {showWorkspaceNav && <AiWorkspaceNav />}

      {/* Whose brain this is, said loudly (Anthony's ruling, 2026-08-16):
          a wiki screen must never leave its scope to be guessed. */}
      <p className="text-[13px] font-medium rounded-[12px] border border-border-dim bg-card/40 px-4 py-3 text-foreground/90 max-w-2xl">
        {companyId ? t("scopeCompany") : t("scopeGlobal")}
      </p>

      <p className="text-[13px] leading-relaxed text-secondary max-w-2xl">
        {companyId ? t("hint") : t("globalHint")}
      </p>

      {weekReport && !weekReport.quiet && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[16px] border border-border-dim bg-card/40 px-5 py-4">
          <span className="text-[12px] uppercase tracking-[0.1em] text-muted">{t("week.title")}</span>
          <span className="text-[13px] text-secondary">
            <span className="text-foreground font-medium tabular-nums">{weekReport.pagesNew + weekReport.pagesImproved}</span>{" "}
            {t("week.pages")}
          </span>
          {companyId && (
          <span className="text-[13px] text-secondary">
            <span className="text-foreground font-medium tabular-nums">{weekReport.answered}</span>{" "}
            {t("week.answered")}
            {weekReport.unanswered > 0 && (
              <>
                {" · "}
                <span className="text-foreground font-medium tabular-nums">{weekReport.unanswered}</span>{" "}
                {t("week.unanswered")}
              </>
            )}
          </span>
          )}
          <span className="text-[13px] text-secondary">
            <span className="text-foreground font-medium tabular-nums">{weekReport.staffRuns}</span>{" "}
            {t("week.staffRuns")}
          </span>
          {weekReport.waitingReviews + weekReport.waitingQuestions + weekReport.openUnanswered > 0 && (
            <span className="text-[13px] text-brand font-medium">
              {t("week.waiting", {
                count:
                  weekReport.waitingReviews + weekReport.waitingQuestions + weekReport.openUnanswered,
              })}
            </span>
          )}
        </div>
      )}

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

      {/* The Reviewer's checkpoint (wiki-agents plan, phase 4): what a
          marked document claims, held until a person decides. */}
      {pendingReviews.length > 0 && (
        <div className="flex flex-col gap-3 rounded-[16px] border border-info/40 bg-card/40 p-5">
          <h2 className="text-[14px] font-semibold text-foreground">
            {t("reviews.title", { count: pendingReviews.length })}
          </h2>
          <p className="text-[12px] text-secondary">{t("reviews.hint")}</p>
          <ul className="flex flex-col gap-2">
            {pendingReviews.map((review) => (
              <li
                key={review.reviewId}
                className="flex flex-col gap-2 rounded-[10px] border border-border-dim/60 bg-background px-4 py-3"
              >
                <span className="text-[13px] font-medium text-foreground">{review.title}</span>
                {review.claims.length > 0 && (
                  <ul className="flex flex-col gap-1 text-[12.5px] text-secondary list-disc pl-4">
                    {review.claims.map((claim, index) => (
                      <li key={index}>{claim}</li>
                    ))}
                  </ul>
                )}
                <div className="flex items-center gap-2">
                  <AdminWriteButton
                    onClick={() => void decideReview(review.reviewId, true)}
                    className="px-3 py-1.5 rounded-[8px] bg-brand text-white text-[12px] font-medium"
                  >
                    {t("reviews.approve")}
                  </AdminWriteButton>
                  <AdminWriteButton
                    onClick={() => void decideReview(review.reviewId, false)}
                    className="px-3 py-1.5 rounded-[8px] border border-border-dim text-secondary hover:text-foreground text-[12px] font-medium transition-colors"
                  >
                    {t("reviews.reject")}
                  </AdminWriteButton>
                </div>
              </li>
            ))}
          </ul>
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

      {companyId && unanswered.length > 0 && (
        <div className="flex flex-col gap-3 rounded-[16px] border border-brand/30 bg-brand/5 p-5">
          <div className="flex items-baseline justify-between gap-4 flex-wrap">
            <span className="flex items-center gap-2 text-[14px] font-semibold text-foreground">
              <AlertTriangle className="w-4 h-4 text-brand" />
              {t("unanswered.title", { count: unanswered.length })}
            </span>
          </div>
          <p className="text-[12px] text-secondary">{t("unanswered.hint")}</p>
          <ul className="flex flex-col divide-y divide-border-dim/60">
            {unanswered.map((row) => (
              <li key={row.unansweredId} className="flex items-center justify-between gap-4 py-2.5">
                <span className="text-[13px] text-foreground">“{row.question}”</span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="px-2 py-0.5 rounded-full bg-foreground/5 border border-border-dim/60 text-secondary text-[11px] font-medium tabular-nums">
                    {t("unanswered.asked", { count: row.askCount })}
                    {"companyCount" in row && typeof row.companyCount === "number" && row.companyCount > 0 && (
                      <> · {t("unanswered.acrossCompanies", { count: row.companyCount })}</>
                    )}
                  </span>
                  <a
                    href="#wiki-import"
                    className="px-3 py-1 rounded-[8px] bg-brand text-white text-[12px] font-medium hover:opacity-90 transition-opacity"
                  >
                    {t("unanswered.importSomething")}
                  </a>
                  <AdminWriteButton
                    onClick={() => void dismissUnanswered(row.unansweredId)}
                    aria-label={t("unanswered.dismiss")}
                    title={t("unanswered.dismiss")}
                    className="text-muted hover:text-foreground transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </AdminWriteButton>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!companyId && (platformDrafts.length > 0 || platformChecks.length > 0) && (
        <div className="flex flex-col gap-3 rounded-[16px] border border-border-dim bg-card/40 p-5">
          <span className="text-[14px] font-semibold text-foreground">{t("platformChecks.title")}</span>
          <p className="text-[12px] text-secondary">{t("platformChecks.hint")}</p>
          {platformDrafts.length > 0 && (
            <ul className="flex flex-col divide-y divide-border-dim/60">
              {platformDrafts.map((draft) => (
                <li key={draft.caseId} className="flex items-start justify-between gap-4 py-2.5">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-[13px] font-medium text-foreground">“{draft.prompt}”</span>
                    <span className="text-[12px] text-secondary line-clamp-2">{draft.expectedBehavior}</span>
                  </div>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="px-2 py-0.5 rounded-full bg-brand/10 text-brand text-[10px] font-bold tracking-widest uppercase">
                      {t("platformChecks.draft")}
                    </span>
                    <AdminWriteButton
                      onClick={() => void decidePlatformDraft({ caseId: draft.caseId, approve: true })}
                      className="px-3 py-1 rounded-[8px] bg-brand text-white text-[12px] font-medium hover:opacity-90 transition-opacity"
                    >
                      {t("platformChecks.approve")}
                    </AdminWriteButton>
                    <AdminWriteButton
                      onClick={() => void decidePlatformDraft({ caseId: draft.caseId, approve: false })}
                      className="px-3 py-1 rounded-[8px] border border-border-dim text-secondary text-[12px] font-medium hover:text-foreground transition-colors"
                    >
                      {t("platformChecks.reject")}
                    </AdminWriteButton>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {platformChecks.length > 0 && (
            <ul className="flex flex-col divide-y divide-border-dim/60">
              {platformChecks.map((check) => (
                <li key={check.caseId} className="flex items-center justify-between gap-4 py-2.5">
                  <span className="text-[13px] text-foreground min-w-0 truncate">“{check.prompt}”</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-[12px] text-secondary">
                      {check.lastRunStatus
                        ? t(`platformChecks.status.${check.lastRunStatus}`)
                        : t("platformChecks.neverRun")}
                    </span>
                    <AdminWriteButton
                      onClick={() => {
                        setRunningCheckId(check.caseId);
                        void runPlatformCheck({ evalCaseId: check.caseId }).finally(() =>
                          setRunningCheckId(null)
                        );
                      }}
                      className="px-3 py-1 rounded-[8px] border border-border-dim text-secondary text-[12px] font-medium hover:text-foreground transition-colors disabled:opacity-40"
                      disabled={runningCheckId === check.caseId}
                    >
                      {runningCheckId === check.caseId
                        ? t("platformChecks.running")
                        : t("platformChecks.run")}
                    </AdminWriteButton>
                  </span>
                </li>
              ))}
            </ul>
          )}
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
            <AdminTableHeaderCell align="right">
              <button
                type="button"
                onClick={() => {
                  setSortByUse((current) => !current);
                  setPage(1);
                }}
                className={`uppercase tracking-[0.1em] transition-colors ${sortByUse ? "text-brand" : "hover:text-foreground"}`}
                title={t("columns.usedSort")}
              >
                {t("columns.used")}
                {sortByUse ? " ↓" : ""}
              </button>
            </AdminTableHeaderCell>
            <AdminTableHeaderCell align="right">{t("columns.sources")}</AdminTableHeaderCell>
          </AdminTableHeaderRow>
        </thead>
        <tbody>
          {isLoading ? (
            <AdminTableLoadingRow colSpan={5} />
          ) : visibleRows.length === 0 ? (
            <AdminTableEmptyRow
              colSpan={5}
              icon={<BookOpen className="w-5 h-5" />}
              label={
                search.trim()
                  ? t("emptySearch")
                  : companyId
                    ? t("emptyState")
                    : t("globalEmptyState")
              }
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
                <td className="px-4 py-4 text-right text-[13px] whitespace-nowrap">
                  {row.usageCount > 0 ? (
                    <span className="text-foreground font-medium tabular-nums">
                      {t("used.count", { count: row.usageCount })}
                    </span>
                  ) : Date.now() - row.createdAt > NEVER_USED_AGE_MS ? (
                    <span className="px-2 py-0.5 rounded-full bg-foreground/5 border border-border-dim/60 text-muted text-[11px]">
                      {t("used.never")}
                    </span>
                  ) : (
                    <span className="text-secondary">—</span>
                  )}
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
