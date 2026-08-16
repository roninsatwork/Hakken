"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { BookOpenCheck, NotebookPen } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AdminPageHeader } from "@/src/app/(dashboard)/admin/_components/AdminPageHeader";
import { AiWorkspaceNav } from "@/src/app/(dashboard)/admin/ai/_components/AiWorkspaceNav";

/**
 * The brain's diary (watch-it-think plan, phase 4): the learning as a
 * browsable feed, newest first, in plain words — company mode shows that
 * company's brain, platform mode the global brain's. Built purely from
 * audit rows that already exist; every entry with a living page opens it.
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

function dayLabel(at: number, todayLabel: string, yesterdayLabel: string) {
  const day = new Date(at);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (day.toDateString() === today.toDateString()) return todayLabel;
  if (day.toDateString() === yesterday.toDateString()) return yesterdayLabel;
  return day.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

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

  const companyEntries = useQuery(
    api.wikiDiary.listDiaryForCompany,
    companyId ? { companyId } : "skip"
  );
  const globalEntries = useQuery(api.wikiDiary.listDiaryForGlobal, companyId ? "skip" : {});
  const entries = companyId ? companyEntries : globalEntries;
  const isLoading = entries === undefined;

  const groups: Array<{ label: string; items: NonNullable<typeof entries> }> = [];
  for (const entry of entries ?? []) {
    const label = dayLabel(entry.at, t("today"), t("yesterday"));
    const group = groups.at(-1);
    if (group && group.label === label) group.items.push(entry);
    else groups.push({ label, items: [entry] });
  }

  return (
    <div className="flex flex-col gap-6 pb-12 w-full">
      <AdminPageHeader
        icon={<NotebookPen className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={companyId ? t("subtitleCompany") : t("subtitle")}
        divider
      />

      {showWorkspaceNav && <AiWorkspaceNav />}

      <p className="text-[13px] leading-relaxed text-secondary max-w-2xl">
        {companyId ? t("hintCompany") : t("hint")}
      </p>

      {isLoading ? (
        <div className="rounded-[16px] border border-border-dim bg-card/40 px-5 py-8 text-center text-[13px] text-muted">
          {t("loading")}
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[16px] border border-border-dim bg-card/40 px-5 py-10 text-center">
          <BookOpenCheck className="w-5 h-5 text-muted" />
          <p className="text-[13px] text-muted">{t("empty")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <div key={group.label} className="flex flex-col gap-2">
              <p className="text-[11px] uppercase tracking-[0.1em] text-muted font-medium">
                {group.label}
              </p>
              <div className="rounded-[16px] border border-border-dim bg-card/40 divide-y divide-border-dim/40">
                {group.items.map((entry, index) => {
                  const sentenceKey = ACTION_KEY[entry.action];
                  return (
                    <div
                      key={`${entry.at}-${index}`}
                      className="flex items-start gap-3 px-5 py-3.5"
                    >
                      <span
                        className={`mt-[7px] w-1.5 h-1.5 rounded-full shrink-0 ${
                          entry.byPerson ? "bg-info" : "bg-brand"
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13.5px] text-foreground leading-relaxed">
                          {sentenceKey ? t(`entries.${sentenceKey}`) : entry.action}
                          {entry.pageId && entry.pageTitle && (
                            <>
                              {" — "}
                              <Link
                                href={`${pageBasePath}/${entry.pageId}`}
                                className="text-brand hover:underline"
                              >
                                {entry.pageTitle.replace(/^https?:\/\/(www\.)?/, "")}
                              </Link>
                            </>
                          )}
                        </p>
                        {entry.detail && !entry.pageTitle && (
                          <p className="text-[12px] text-muted truncate mt-0.5">{entry.detail}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] text-muted">
                          {entry.byPerson ? t("byPerson") : t("byBrain")}
                        </span>
                        <span className="text-[12px] text-secondary tabular-nums whitespace-nowrap">
                          {new Date(entry.at).toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
