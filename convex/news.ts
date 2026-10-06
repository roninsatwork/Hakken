import { v } from "convex/values";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { superAdminMutation, superAdminQuery, tenantQuery } from "./tenantFunctions";
import { appError } from "./utils/appError";
import { auditContentChange, checkedDay, dayStart } from "./utils/contentAdmin";
import { newsItemKindValidator } from "./newsSchema";
import { readerFields, removeTranslations } from "./contentTranslation";
import { DEFAULT_EXPECTED_DAYS, updateFacts, updateFactsValidator, updateInLanguage } from "./googleUpdates";
import { leadPlaceValidator, leadTitle, liveLeadUntil, livePin, placeOf, type LeadPin } from "./leadStory";
import { summaryRow as knowledgeSummaryRow, summaryValidator as knowledgeSummaryValidator } from "./knowledgeArticles";
import { readerRow as helpfulReaderRow, readerValidator as helpfulReaderValidator } from "./libraryArticles";

/**
 * The News feed (docs/plans/active/knowledge-news-and-digest-plan.md, phase
 * 3): every signed-in user's, newest first, filtered by kind — Google updates,
 * X, YouTube, websites. Items arrive from the News Collector (phase 5) and
 * from the Google updates entered in Admin (`googleUpdates.ts`), and go live
 * at once (A4); Admin → Content → News is where one is taken down. Each is
 * written in English and read in the reader's language once the Translator
 * has it — a Google update's item through the update's own translation.
 *
 * The front page (revised again, 2026-10-01, R5–R7) leads with one story:
 * one pinned in Admin — a News story, or a Knowledge or Helpful content
 * article (insights-helpful-content-plan.md, IH11; `leadStory.ts`) — else a
 * Google update while it matters, else the newest (`chooseLead`). Each story opens on its own page (R10, `getNewsItem`).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** How long a Google update stays the lead after it finishes, and after it should have (R7). */
export const LEAD_AFTER_UPDATE_DAYS = 7;
/** The front page's week: today and the six days before it. */
const WEEK_DAYS = 7;
/** Items counted for the week at most; a busier week says this many. */
export const WEEK_COUNT_LIMIT = 500;
/** Recent Google updates looked at for one still worth leading with. */
const UPDATES_CONSIDERED = 5;

const itemValidator = v.object({
  _id: v.id("newsItems"),
  kind: newsItemKindValidator,
  sourceName: v.string(),
  title: v.string(),
  summary: v.string(),
  /** "What this means for you"; empty when none was written. */
  meaning: v.string(),
  url: v.string(),
  publishedAt: v.number(),
  /** A Google update's rollout, for its line; null for any other item. */
  update: v.union(v.null(), updateFactsValidator),
});

const adminItemValidator = v.object({
  _id: v.id("newsItems"),
  kind: newsItemKindValidator,
  sourceName: v.string(),
  titleEn: v.string(),
  url: v.string(),
  publishedAt: v.number(),
  createdAt: v.number(),
  /** A Google update's own item: taken down with the update, not here. */
  isGoogleUpdate: v.boolean(),
  /** Until when it is pinned as the front page's lead; null when it is not, or no longer. */
  leadUntil: v.union(v.number(), v.null()),
});

/** An item in the reader's language: on the News page, and in the Weekly News Digest (`outboxTemplates.ts`). */
export async function readerItem(ctx: QueryCtx, row: Doc<"newsItems">, language: string) {
  let words = { title: row.titleEn, summary: row.summaryEn, meaning: row.meaningEn };
  let facts: ReturnType<typeof updateFacts> | null = null;
  if (row.googleUpdateId) {
    const update = await ctx.db.get(row.googleUpdateId);
    if (update) {
      const { title, description, meaning } = await updateInLanguage(ctx, update, language);
      words = { title, summary: description, meaning };
      facts = updateFacts(update);
    }
  } else {
    const translated = await readerFields(ctx, "newsItems", row._id, words, language);
    words = { title: translated.title, summary: translated.summary, meaning: translated.meaning };
  }
  return { _id: row._id, kind: row.kind, sourceName: row.sourceName, ...words, url: row.url, publishedAt: row.publishedAt, update: facts };
}

/** Whole days from one calendar day to another, "YYYY-MM-DD"; negative when `to` comes first. */
function daysBetween(from: string, to: string): number {
  return Math.round((dayStart(to) - dayStart(from)) / DAY_MS);
}

/**
 * Whether a Google update still leads the front page on `today` (R7): from the
 * day it starts while it rolls out — no longer than it was expected to take
 * and a week more, so one whose finish was never entered does not lead for
 * ever — and for a week after it finishes.
 */
export function updateLeadsOn(update: { startedOn: string; finishedOn?: string; expectedDays?: number }, today: string): boolean {
  if (update.startedOn > today) return false;
  if (update.finishedOn) return daysBetween(update.finishedOn, today) <= LEAD_AFTER_UPDATE_DAYS;
  return daysBetween(update.startedOn, today) <= (update.expectedDays ?? DEFAULT_EXPECTED_DAYS) + LEAD_AFTER_UPDATE_DAYS;
}

/** The front page's lead and why it leads: pinned, wherever it was pinned, or chosen by the rule. */
export type LeadChoice = LeadPin & { pinned: boolean };

/**
 * The front page's lead story on `today` (R7, IH11): the story pinned in
 * Admin — in News, Knowledge or Helpful content — while its pin lasts; else
 * the latest Google update that still leads; else the newest story. Null only
 * when there is nothing at all.
 */
export async function chooseLead(ctx: QueryCtx, today: string): Promise<LeadChoice | null> {
  const pin = await livePin(ctx, today);
  if (pin) return { ...pin, pinned: true };
  const updates = await ctx.db.query("googleUpdates").withIndex("by_started").order("desc").take(UPDATES_CONSIDERED);
  for (const update of updates) {
    if (!updateLeadsOn(update, today)) continue;
    const item = await ctx.db.query("newsItems").withIndex("by_google_update", (q) => q.eq("googleUpdateId", update._id)).first();
    if (item) return { table: "newsItems", row: item, pinned: false };
  }
  const newest = await ctx.db.query("newsItems").withIndex("by_published").order("desc").first();
  return newest ? { table: "newsItems", row: newest, pinned: false } : null;
}

/** The moment the front page's week starts: the start of the day six days before `today`. */
export function weekStart(today: string): number {
  return dayStart(today) - (WEEK_DAYS - 1) * DAY_MS;
}

/** The front page's lead in the reader's language: a News story, or a pinned Knowledge or Helpful content article (IH11). */
const frontLeadValidator = v.union(
  v.null(),
  v.object({ source: v.literal("NEWS"), item: itemValidator }),
  v.object({ source: v.literal("KNOWLEDGE"), article: knowledgeSummaryValidator }),
  v.object({ source: v.literal("HELPFUL"), article: helpfulReaderValidator }),
);

/**
 * The front page's own parts (R5): the lead story in the reader's language,
 * and how many stories arrived this week, today and the six days before it.
 * `today` is the reader's own calendar day.
 */
export const getFrontPage = tenantQuery({
  args: { language: v.string(), today: v.string() },
  returns: v.object({ lead: frontLeadValidator, weekCount: v.number() }),
  handler: async (ctx, args) => {
    const today = checkedDay(args.today, "Today");
    const lead = await chooseLead(ctx, today);
    const week = await ctx.db
      .query("newsItems")
      .withIndex("by_published", (q) => q.gte("publishedAt", weekStart(today)))
      .take(WEEK_COUNT_LIMIT);
    return { lead: lead ? await frontLead(ctx, lead, args.language) : null, weekCount: week.length };
  },
});

async function frontLead(ctx: QueryCtx, lead: LeadPin, language: string) {
  if (lead.table === "knowledgeArticles") return { source: "KNOWLEDGE" as const, article: await knowledgeSummaryRow(ctx, lead.row, language) };
  if (lead.table === "libraryArticles") return { source: "HELPFUL" as const, article: await helpfulReaderRow(ctx, lead.row, language) };
  return { source: "NEWS" as const, item: await readerItem(ctx, lead.row, language) };
}

/**
 * What leads the News front page today and why, for Admin's notices on News,
 * Knowledge and Helpful content (IH11): its English title, where it was
 * pinned and until when — or that the rule chose it.
 */
export const getLeadForAdmin = superAdminQuery({
  args: { today: v.string() },
  returns: v.union(
    v.null(),
    v.object({ storyId: v.string(), title: v.string(), place: leadPlaceValidator, pinned: v.boolean(), leadUntil: v.union(v.number(), v.null()) }),
  ),
  handler: async (ctx, args) => {
    const lead = await chooseLead(ctx, checkedDay(args.today, "Today"));
    if (!lead) return null;
    return { storyId: lead.row._id, title: leadTitle(lead), place: placeOf(lead), pinned: lead.pinned, leadUntil: lead.pinned ? lead.row.leadUntil ?? null : null };
  },
});

/** One story on its own page (R10), in the reader's language; null when it has been taken down. */
export const getNewsItem = tenantQuery({
  args: { itemId: v.id("newsItems"), language: v.string() },
  returns: v.union(v.null(), itemValidator),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.itemId);
    return row ? await readerItem(ctx, row, args.language) : null;
  },
});

/** A page of the feed, newest first, of one kind or every kind, in the reader's language. */
export const listNewsItems = tenantQuery({
  args: { paginationOpts: paginationOptsValidator, kind: v.optional(newsItemKindValidator), language: v.string() },
  returns: paginationResultValidator(itemValidator),
  handler: async (ctx, args) => {
    const kind = args.kind;
    const query = kind
      ? ctx.db.query("newsItems").withIndex("by_kind_published", (q) => q.eq("kind", kind))
      : ctx.db.query("newsItems").withIndex("by_published");
    const page = await query.order("desc").paginate(args.paginationOpts);
    return { ...page, page: await Promise.all(page.page.map((row) => readerItem(ctx, row, args.language))) };
  },
});

/** Admin → Content → News: a page of every item, newest first, to take one down. */
export const listNewsItemsForAdmin = superAdminQuery({
  args: { paginationOpts: paginationOptsValidator, kind: v.optional(newsItemKindValidator) },
  returns: paginationResultValidator(adminItemValidator),
  handler: async (ctx, args) => {
    const kind = args.kind;
    const query = kind
      ? ctx.db.query("newsItems").withIndex("by_kind_published", (q) => q.eq("kind", kind))
      : ctx.db.query("newsItems").withIndex("by_published");
    const page = await query.order("desc").paginate(args.paginationOpts);
    return {
      ...page,
      page: page.page.map((row) => ({
        _id: row._id,
        kind: row.kind,
        sourceName: row.sourceName,
        titleEn: row.titleEn,
        url: row.url,
        publishedAt: row.publishedAt,
        createdAt: row.createdAt,
        isGoogleUpdate: row.googleUpdateId !== undefined,
        // A pin that has run out leads nothing, so it is not shown as one.
        leadUntil: liveLeadUntil(row.leadUntil),
      })),
    };
  },
});

/**
 * Takes an item down for good — the rare one that should not be there. Its
 * address stays known, so the collector does not bring it back. A Google
 * update's item goes with the update itself, in Google updates.
 */
export const deleteNewsItem = superAdminMutation({
  args: { itemId: v.id("newsItems") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) return null;
    if (item.googleUpdateId) throw appError("INVALID_INPUT", "This is a Google update. Delete it in Google updates.");
    await ctx.db.insert("newsTakenDown", { externalKey: item.externalKey, takenDownAt: Date.now() });
    await ctx.db.delete(args.itemId);
    await removeTranslations(ctx, "newsItems", args.itemId);
    await auditContentChange(ctx, "DELETE_NEWS_ITEM", "newsItems", args.itemId, { title: item.titleEn, url: item.url });
    return null;
  },
});
