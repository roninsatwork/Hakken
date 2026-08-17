"use client";

import { useState } from "react";
import Link from "next/link";

import { useTranslations } from "next-intl";
import { NotebookPen } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { AiWorkspaceNav } from "@/src/app/(dashboard)/admin/ai/_components/AiWorkspaceNav";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { useServerPagedTable } from "@/src/hooks/useServerPagedTable";
import { formatDateTime } from "@/src/lib/dates";

/**
 * The brain's diary (watch-it-think plan, phase 4): what the wiki learned,
 * newest first, in plain words — built purely from audit rows that already
 * exist. No new writes anywhere.
 *
 * The house table, paged and filtered in the query: this ledger only grows,
 * so neither the reader's browser nor the reader's patience should have to
 * carry it.
 */

const ACTION_KEY: Record<string, string> = {
  WIKI_PAGE_CREATED: "pageCreated",
  WIKI_PAGE_REWRITE: "pageRewrite",
  WIKI_PAGE_HUMAN_EDIT: "pageHumanEdit",
  WIKI_PAGE_PIN: "pagePin",
  WIKI_PAGE_UNPIN: "pageUnpin",
  WIKI_LINKS_REPAIRED: "linksRepaired",
  WIKI_QUESTION_RAISED: "questionRaised",
  WIKI_QUESTION_DISMISSED: "questionDismissed",
  WIKI_UNANSWERED_DISMISSED: "unansweredDismissed",
  WIKI_REVIEW_APPROVED: "reviewApproved",
  WIKI_REVIEW_REJECTED: "reviewRejected",
  WIKI_EXAM_DRAFTED: "examDrafted",
  WIKI_EXAM_DRAFT_APPROVED: "examApproved",
  WIKI_EXAM_DRAFT_REJECTED: "examRejected",
  MEMORY_MIGRATED_TO_WIKI: "memoryMigrated",
  WIKI_SOURCE_REREAD: "sourceReread",
  SAVE_ANSWER_TO_WIKI: "answerSaved",
};

export function WikiDiaryScreen({
  companyId,
  pageBasePath,
  showWorkspaceNav,
}: {
  companyId?: Id<"companies">;
  /** Where an entry's page link points, without the trailing id. */
  pageBasePath: string;
  showWorkspaceNav?: boolean;
}) {
  const t = useTranslations("aiDiary");
  const [action, setAction] = useState<string>("ALL");
  const [search, setSearch] = useState("");

  const filterArgs = action === "ALL" ? {} : { action };
  const companyEntries = useServerPagedTable(
    api.wikiDiary.listDiaryForCompany,
    companyId ? { companyId, ...filterArgs } : "skip"
  );
  const globalEntries = useServerPagedTable(
    api.wikiDiary.listDiaryForGlobal,
    companyId ? "skip" : filterArgs
  );
  const entries = companyId ? companyEntries : globalEntries;

  /*
    Searched here rather than in the query, and that is a real limit worth
    stating: the diary query filters by action only, so this narrows the page
    already fetched. Good enough to find a page you remember touching; it will
    not reach back through pages you have not loaded.
  */
  const needle = search.trim().toLowerCase();
  const visibleEntries = needle
    ? entries.rows.filter((entry) =>
        `${entry.pageTitle ?? ""} ${entry.detail ?? ""}`.toLowerCase().includes(needle))
    : entries.rows;

  return (
    <div className="flex flex-col gap-6 pb-12 w-full">
      <PageHeader
        icon={<NotebookPen className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={companyId ? t("subtitleCompany") : t("subtitle")}
        divider
      />

      {showWorkspaceNav && <AiWorkspaceNav />}

      <p className="text-[13px] leading-relaxed text-secondary max-w-2xl">
        {companyId ? t("hintCompany") : t("hint")}
      </p>

      <DataTable
        rows={entries.isLoading ? undefined : visibleEntries}
        rowKey={(entry, ) => `${entry.at}-${entry.action}-${entry.pageId ?? ""}`}
        minWidthClassName="min-w-[760px]"
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <div className="max-w-xs w-full">
            <select
              value={action}
              onChange={(event) => setAction(event.target.value)}
              className="w-full bg-background border border-border-dim rounded-[10px] px-3 py-2 text-[13px] text-foreground focus:outline-none focus:border-brand/50 transition-colors"
            >
              <option value="ALL">{t("filter.all")}</option>
              {Object.entries(ACTION_KEY).map(([actionType, key]) => (
                <option key={actionType} value={actionType}>
                  {t(`entries.${key}`)}
                </option>
              ))}
            </select>
          </div>
        }
        empty={{
          icon: <NotebookPen className="w-5 h-5" />,
          label: action === "ALL" ? t("empty") : t("emptyFiltered"),
        }}
        footer={{
          mode: "paged",
          page: entries.page,
          totalPages: entries.totalPages,
          totalCount: entries.loadedCount,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: entries.isBusy,
          onPageChange: entries.goToPage,
          labels: { empty: t("empty") },
        }}
        columns={[
          {
            key: "what",
            header: t("columns.what"),
            cell: (entry) => (
              <span className="text-[13.5px] text-foreground">
                {ACTION_KEY[entry.action] ? t(`entries.${ACTION_KEY[entry.action]}`) : entry.action}
              </span>
            ),
          },
          {
            key: "page",
            header: t("columns.page"),
            className: "max-w-[360px]",
            cell: (entry) =>
              entry.pageId && entry.pageTitle ? (
                <Link href={`${pageBasePath}/${entry.pageId}`} className="text-[13px] text-brand hover:underline">
                  {entry.pageTitle.replace(/^https?:\/\/(www\.)?/, "")}
                </Link>
              ) : (
                <span className="text-[13px] text-muted truncate block">{entry.detail ?? "—"}</span>
              ),
          },
          {
            key: "who",
            header: t("columns.who"),
            className: "whitespace-nowrap",
            cell: (entry) => (
              <span className="text-[12px] text-secondary">{entry.byPerson ? t("byPerson") : t("byBrain")}</span>
            ),
          },
          {
            key: "when",
            header: t("columns.when"),
            className: "whitespace-nowrap",
            cell: (entry) => (
              <span className="text-[13px] text-secondary tabular-nums">{formatDateTime(entry.at)}</span>
            ),
          },
        ]}
      />
    </div>
  );
}
