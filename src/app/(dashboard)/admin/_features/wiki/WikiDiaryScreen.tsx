"use client";

import { useState } from "react";
import Link from "next/link";

import { useTranslations } from "next-intl";
import { NotebookPen } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import {
  PaginationFooter,
  TableEmptyRow,
  TableHeaderCell,
  TableHeaderRow,
  TableLoadingRow,
  TableShell,
} from "@/src/ui/components/screens/Table";
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

      <div className="max-w-xs">
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

      <TableShell
        minWidthClassName="min-w-[760px]"
        footer={
          <PaginationFooter
            page={entries.page}
            totalPages={entries.totalPages}
            totalCount={entries.loadedCount}
            pageSize={TABLE_PAGE_SIZE}
            isLoading={entries.isBusy}
            onPageChange={entries.goToPage}
            labels={{ empty: t("empty") }}
          />
        }
      >
        <thead>
          <TableHeaderRow>
            <TableHeaderCell>{t("columns.what")}</TableHeaderCell>
            <TableHeaderCell>{t("columns.page")}</TableHeaderCell>
            <TableHeaderCell>{t("columns.who")}</TableHeaderCell>
            <TableHeaderCell>{t("columns.when")}</TableHeaderCell>
          </TableHeaderRow>
        </thead>
        <tbody>
          {entries.isLoading ? (
            <TableLoadingRow colSpan={4} />
          ) : entries.rows.length === 0 ? (
            <TableEmptyRow
              colSpan={4}
              icon={<NotebookPen className="w-5 h-5" />}
              label={action === "ALL" ? t("empty") : t("emptyFiltered")}
            />
          ) : (
            entries.rows.map((entry, index) => {
              const sentenceKey = ACTION_KEY[entry.action];
              return (
                <tr
                  key={`${entry.at}-${index}`}
                  className="border-b border-border-dim/50 last:border-b-0 hover:bg-hover/40 transition-colors"
                >
                  <td className="px-4 py-3 text-[13.5px] text-foreground">
                    {sentenceKey ? t(`entries.${sentenceKey}`) : entry.action}
                  </td>
                  <td className="px-4 py-3 text-[13px] max-w-[360px]">
                    {entry.pageId && entry.pageTitle ? (
                      <Link
                        href={`${pageBasePath}/${entry.pageId}`}
                        className="text-brand hover:underline"
                      >
                        {entry.pageTitle.replace(/^https?:\/\/(www\.)?/, "")}
                      </Link>
                    ) : (
                      <span className="text-muted truncate block">{entry.detail ?? "—"}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[12px] text-secondary whitespace-nowrap">
                    {entry.byPerson ? t("byPerson") : t("byBrain")}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-secondary whitespace-nowrap tabular-nums">
                    {formatDateTime(entry.at)}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </TableShell>
    </div>
  );
}
