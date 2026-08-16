import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { adminQuery } from "./tenantFunctions";
import { assertAdminCanAccessCompany } from "./authz";

/**
 * The brain's diary (watch-it-think plan, phase 4): the learning as a
 * browsable feed, newest first, in plain words — built purely from
 * audit rows that already exist. No new writes anywhere; presentation
 * over the ledger.
 */

const DIARY_ACTIONS = new Set([
  "WIKI_PAGE_CREATED",
  "WIKI_PAGE_REWRITE",
  "WIKI_PAGE_HUMAN_EDIT",
  "WIKI_PAGE_PIN",
  "WIKI_PAGE_UNPIN",
  "WIKI_LINKS_REPAIRED",
  "WIKI_QUESTION_RAISED",
  "WIKI_QUESTION_DISMISSED",
  "WIKI_UNANSWERED_DISMISSED",
  "WIKI_REVIEW_APPROVED",
  "WIKI_REVIEW_REJECTED",
  "WIKI_EXAM_DRAFTED",
  "WIKI_EXAM_DRAFT_APPROVED",
  "WIKI_EXAM_DRAFT_REJECTED",
  "MEMORY_MIGRATED_TO_WIKI",
  "WIKI_SOURCE_REREAD",
  "SAVE_ANSWER_TO_WIKI",
]);

export type DiaryEntry = {
  at: number;
  action: string;
  /** The page involved, when it still exists. */
  pageId: string | null;
  pageTitle: string | null;
  /** One useful fragment from the row's metadata, if any. */
  detail: string | null;
  byPerson: boolean;
};

async function diaryRows(ctx: QueryCtx, companyId: Id<"companies"> | undefined) {
  const rows = await ctx.db
    .query("auditLogs")
    .withIndex("by_company", (q) => q.eq("companyId", companyId))
    .order("desc")
    .take(400);

  const entries: DiaryEntry[] = [];
  for (const row of rows) {
    if (!DIARY_ACTIONS.has(row.actionType)) continue;
    let pageId: string | null = null;
    let pageTitle: string | null = null;
    if (row.entityType === "wikiPages" && row.entityId) {
      const page = await ctx.db.get(row.entityId as Id<"wikiPages">).catch(() => null);
      if (page && "title" in page) {
        pageId = row.entityId;
        pageTitle = String(page.title);
      }
    }
    let detail: string | null = null;
    try {
      const metadata = row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : {};
      detail =
        (typeof metadata.subjectKey === "string" && metadata.subjectKey) ||
        (typeof metadata.title === "string" && metadata.title) ||
        (typeof metadata.question === "string" && metadata.question) ||
        (typeof metadata.grewFrom === "string" && metadata.grewFrom) ||
        (typeof metadata.text === "string" && metadata.text) ||
        (typeof metadata.sourceUrl === "string" && metadata.sourceUrl) ||
        null;
    } catch {
      detail = null;
    }
    entries.push({
      at: row.timestamp,
      action: row.actionType,
      pageId,
      pageTitle,
      detail: detail ? detail.slice(0, 140) : null,
      byPerson: Boolean(row.actorId),
    });
    if (entries.length >= 100) break;
  }
  return entries;
}

export const listDiaryForCompany = adminQuery({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args): Promise<DiaryEntry[]> => {
    assertAdminCanAccessCompany(ctx.user, args.companyId, "Unauthorized Access");
    return await diaryRows(ctx, args.companyId);
  },
});

export const listDiaryForGlobal = adminQuery({
  args: {},
  handler: async (ctx): Promise<DiaryEntry[]> => {
    if (ctx.user.role !== "SUPER_ADMIN" && ctx.user.role !== "READ_ONLY") {
      throw new Error("Unauthorized access to the platform wiki");
    }
    return await diaryRows(ctx, undefined);
  },
});
