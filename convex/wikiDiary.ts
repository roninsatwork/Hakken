import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { adminQuery } from "./tenantFunctions";
import * as tailShapes from "./utils/tailShapes";
import { assertAdminCanAccessCompany } from "./authz";
import { appError } from "./utils/appError";

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

async function diaryPage(
  ctx: QueryCtx,
  companyId: Id<"companies"> | undefined,
  paginationOpts: { numItems: number; cursor: string | null },
  action: string | undefined
) {
  // Paged where the rows are. The screen used to take four hundred audit
  // rows and cut them down in the browser, which is a bill that grows with
  // the ledger and a list that silently stopped at a hundred.
  const page = await ctx.db
    .query("auditLogs")
    .withIndex("by_company", (q) => q.eq("companyId", companyId))
    .order("desc")
    .paginate(paginationOpts);

  const entries: DiaryEntry[] = [];
  for (const row of page.page) {
    if (!DIARY_ACTIONS.has(row.actionType)) continue;
    if (action && row.actionType !== action) continue;
    let pageId: string | null = null;
    let pageTitle: string | null = null;
    if (row.entityType === "wikiPages" && row.entityId) {
      const wikiPage = await ctx.db.get(row.entityId as Id<"wikiPages">).catch(() => null);
      if (wikiPage && "title" in wikiPage) {
        pageId = row.entityId;
        pageTitle = String(wikiPage.title);
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
  }

  return { ...page, page: entries };
}

/** The kinds of entry a reader can filter to, for the screen's dropdown. */
export const DIARY_ACTION_LIST = Array.from(DIARY_ACTIONS);

export const listDiaryForCompany = adminQuery({
  args: {
    companyId: v.id("companies"),
    paginationOpts: paginationOptsValidator,
    action: v.optional(v.string()),
  },
  returns: tailShapes.wikiDiaryPageShape,
  handler: async (ctx, args) => {
    assertAdminCanAccessCompany(ctx.user, args.companyId, "Unauthorized Access");
    return await diaryPage(ctx, args.companyId, args.paginationOpts, args.action);
  },
});

export const listDiaryForGlobal = adminQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    action: v.optional(v.string()),
  },
  returns: tailShapes.wikiDiaryPageShape,
  handler: async (ctx, args) => {
    if (ctx.user.role !== "SUPER_ADMIN" && ctx.user.role !== "READ_ONLY") {
      throw appError("UNAUTHORIZED", "Unauthorized access to the platform wiki");
    }
    return await diaryPage(ctx, undefined, args.paginationOpts, args.action);
  },
});
