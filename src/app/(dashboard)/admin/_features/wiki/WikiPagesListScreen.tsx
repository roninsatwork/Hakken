"use client";

import { useState } from "react";
import Link from "next/link";
import { useConvex, useMutation, useQuery } from "convex/react";
import { useServerPagedTable } from "@/src/hooks/useServerPagedTable";
import { useTranslations } from "next-intl";
import { AlertTriangle, BookOpen, Download, Network, Pin, X } from "lucide-react";
import { strToU8, zipSync } from "fflate";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { AiWorkspaceNav } from "@/src/app/(dashboard)/admin/ai/_components/AiWorkspaceNav";
import { WikiImportBox } from "./WikiImportBox";
import { WikiQuickSwitcher } from "./WikiQuickSwitcher";
import { WikiAskBox } from "./WikiAskBox";

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
  const [sortByUse, setSortByUse] = useState(false);
  const searchArg = search.trim() ? { search: search.trim() } : {};
  // Two doors, one mounted: hooks must both be called, so the unused door
  // is skipped rather than conditionally omitted. Searching and paging both
  // happen in the query — this list is the busiest table in the product and
  // used to arrive five hundred rows at a time.
  const globalRows = useServerPagedTable(
    api.wikiPages.listPagesForGlobal,
    companyId ? "skip" : searchArg
  );
  const companyRows = useServerPagedTable(
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
    // Only the page in hand can be linked from here; a key from an older
    // page is left as plain words rather than pointing at nothing.
    const row = rows.rows.find(
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

  const isLoading = rows.isLoading;
  // Sorting by use orders the page in hand; the list itself arrives newest
  // first from the query, a page at a time.
  const visibleRows = sortByUse
    ? [...rows.rows].sort((a, b) => b.usageCount - a.usageCount || b.updatedAt - a.updatedAt)
    : rows.rows;
  const NEVER_USED_AGE_MS = 30 * 24 * 60 * 60 * 1000;

  // "Your brain is yours": the vault is assembled right here in the
  // browser — filenames are the subjectKeys, so every [[reference]]
  // resolves the moment Obsidian opens the folder.
  const convex = useConvex();
  const [isExporting, setIsExporting] = useState(false);
  const downloadVault = async () => {
    setIsExporting(true);
    try {
      const pages = companyId
        ? await convex.query(api.wikiPages.getExportForCompany, { companyId })
        : await convex.query(api.wikiPages.getExportForGlobal, {});
      const folders: Record<string, string> = {
        CUSTOMER: "customers",
        PRODUCT: "products",
        POLICY: "policies",
        ISSUE: "issues",
        SOURCE: "sources",
      };
      const files: Record<string, Uint8Array> = {};
      for (const page of pages) {
        const safeName = page.subjectKey.replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(0, 120);
        const frontmatter = [
          "---",
          `title: ${JSON.stringify(page.title)}`,
          `kind: ${page.kind}`,
          `updated: ${new Date(page.updatedAt).toISOString().slice(0, 10)}`,
          ...(page.sources.length
            ? ["sources:", ...page.sources.map((label: string) => `  - ${JSON.stringify(label)}`)]
            : []),
          ...(page.pinnedCorrections.length
            ? ["pinned:", ...page.pinnedCorrections.map((pin: string) => `  - ${JSON.stringify(pin)}`)]
            : []),
          "---",
          "",
        ].join("\n");
        files[`${folders[page.kind] ?? "pages"}/${safeName}.md`] = strToU8(
          frontmatter + page.content + "\n"
        );
      }
      const zipped = zipSync(files);
      const blob = new Blob([zipped.buffer as ArrayBuffer], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = companyId ? "company-wiki-vault.zip" : "platform-wiki-vault.zip";
      anchor.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

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
      <WikiQuickSwitcher companyId={companyId} basePath={basePath} />
      <PageHeader
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

      <WikiAskBox companyId={companyId} basePath={basePath} />

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
                  <WriteButton
                    onClick={() => void decideReview(review.reviewId, true)}
                    className="px-3 py-1.5 rounded-[8px] bg-brand text-white text-[12px] font-medium"
                  >
                    {t("reviews.approve")}
                  </WriteButton>
                  <WriteButton
                    onClick={() => void decideReview(review.reviewId, false)}
                    className="px-3 py-1.5 rounded-[8px] border border-border-dim text-secondary hover:text-foreground text-[12px] font-medium transition-colors"
                  >
                    {t("reviews.reject")}
                  </WriteButton>
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
                  <WriteButton
                    onClick={() => void dismissQuestion(question.questionId)}
                    aria-label={t("questions.dismiss")}
                    title={t("questions.dismiss")}
                    className="text-muted hover:text-foreground transition-colors shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </WriteButton>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <DataTable
        rows={isLoading ? undefined : visibleRows}
        rowKey={(row) => row.pageId}
        minWidthClassName="min-w-[760px]"
        search={{
          value: search,
          onChange: (value) => {
            setSearch(value);
            rows.goToPage(1);
          },
          placeholder: t("searchPlaceholder"),
        }}
        filters={
          <>
            <button
              type="button"
              onClick={() => void downloadVault()}
              disabled={isExporting}
              className="flex items-center gap-2 px-4 py-3 rounded-[12px] border border-border-dim bg-card/40 text-[13px] font-medium text-foreground hover:border-brand/50 hover:text-brand transition-colors whitespace-nowrap disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              {isExporting ? t("export.exporting") : t("export.button")}
            </button>
            <Link
              href={`${basePath}/map`}
              className="flex items-center gap-2 px-4 py-3 rounded-[12px] border border-border-dim bg-card/40 text-[13px] font-medium text-foreground hover:border-brand/50 hover:text-brand transition-colors whitespace-nowrap"
            >
              <Network className="w-4 h-4" />
              {t("map.open")}
            </Link>
          </>
        }
        empty={{
          icon: <BookOpen className="w-5 h-5" />,
          label: search.trim()
            ? t("emptySearch")
            : companyId
              ? t("emptyState")
              : t("globalEmptyState"),
        }}
        footer={{
          mode: "paged",
          page: rows.page,
          totalPages: rows.totalPages,
          totalCount: rows.loadedCount,
          pageSize: PAGE_SIZE,
          isLoading: rows.isBusy,
          onPageChange: rows.goToPage,
          labels: { empty: t("empty") },
        }}
        columns={[
          {
            key: "customer",
            header: t("columns.customer"),
            cell: (row) => (
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
            ),
          },
          {
            key: "remembers",
            header: t("columns.remembers"),
            className: "max-w-[380px]",
            cell: (row) => (
              <span className="line-clamp-2 text-[13px] text-secondary">{row.preview}</span>
            ),
          },
          {
            key: "lastChange",
            header: t("columns.lastChange"),
            className: "whitespace-nowrap",
            cell: (row) => (
              <span className="text-[13px] text-secondary">
                {describeSource(row.lastRewriteSource)} · {new Date(row.updatedAt).toLocaleDateString()}
              </span>
            ),
          },
          {
            key: "used",
            /* The only sortable column here, so the button is the header rather
               than a control beside it. */
            header: (
              <button
                type="button"
                onClick={() => {
                  setSortByUse((current) => !current);
                  rows.goToPage(1);
                }}
                className={`uppercase tracking-[0.1em] transition-colors ${sortByUse ? "text-brand" : "hover:text-foreground"}`}
                title={t("columns.usedSort")}
              >
                {t("columns.used")}
                {sortByUse ? " ↓" : ""}
              </button>
            ),
            align: "right",
            className: "whitespace-nowrap",
            cell: (row) =>
              row.usageCount > 0 ? (
                <span className="text-[13px] text-foreground font-medium tabular-nums">
                  {t("used.count", { count: row.usageCount })}
                </span>
              ) : Date.now() - row.createdAt > NEVER_USED_AGE_MS ? (
                <span className="px-2 py-0.5 rounded-full bg-foreground/5 border border-border-dim/60 text-muted text-[11px]">
                  {t("used.never")}
                </span>
              ) : (
                <span className="text-[13px] text-secondary">—</span>
              ),
          },
          {
            key: "sources",
            header: t("columns.sources"),
            align: "right",
            cell: (row) => (
              <span className="text-[13px] text-secondary tabular-nums">
                {row.sourceCount > 0 ? row.sourceCount : "—"}
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}
