import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { superAdminMutation } from "./tenantFunctions";
import { appError } from "./utils/appError";
import { auditContentChange, dayStart } from "./utils/contentAdmin";

/**
 * One lead story for the News front page, pinned from anywhere
 * (docs/plans/active/insights-helpful-content-plan.md, IH11, extending
 * knowledge-news-and-digest-plan R7): a News story, a Knowledge article or a
 * Helpful content article. Pinning one unpins any other, whichever list it is
 * in, and a pin lasts seven days. A pinned Knowledge or Helpful content
 * article also leads its own page. Only what readers can see can lead: a
 * draft never does, and one that goes back to a draft loses its pin.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** How long a pinned story stays the lead (R7, IH11). */
export const LEAD_PIN_DAYS = 7;
/** Pins read per list when they are cleared: there is only ever one, so this is room for a stray. */
const PINS_READ = 20;

export type LeadPin =
  | { table: "newsItems"; row: Doc<"newsItems"> }
  | { table: "knowledgeArticles"; row: Doc<"knowledgeArticles"> }
  | { table: "libraryArticles"; row: Doc<"libraryArticles"> };

/** Where a lead was pinned, as Admin names it. */
export type LeadPlace = "NEWS" | "KNOWLEDGE" | "HELPFUL";
export const leadPlaceValidator = v.union(v.literal("NEWS"), v.literal("KNOWLEDGE"), v.literal("HELPFUL"));

export function placeOf(pin: LeadPin): LeadPlace {
  return pin.table === "newsItems" ? "NEWS" : pin.table === "knowledgeArticles" ? "KNOWLEDGE" : "HELPFUL";
}

/** The title Admin knows a lead by: written in English. */
export function leadTitle(pin: LeadPin): string {
  return pin.table === "libraryArticles" ? pin.row.title : pin.row.titleEn;
}

/** Whether a row can lead: any News story; a published Knowledge article; Helpful content shown to readers. */
export function canLead(pin: LeadPin): boolean {
  if (pin.table === "knowledgeArticles") return pin.row.status === "PUBLISHED";
  if (pin.table === "libraryArticles") return pin.row.shown === true;
  return true;
}

/**
 * The pin that leads on `today`, wherever it was made; null when none is
 * live. A pin counts for the whole of the day it runs out on, as News's always
 * has. One row read from each list's pin index.
 */
export async function livePin(ctx: QueryCtx, today: string): Promise<LeadPin | null> {
  const from = dayStart(today);
  const [news, knowledge, helpful] = await Promise.all([
    ctx.db.query("newsItems").withIndex("by_lead_until", (q) => q.gt("leadUntil", from)).order("desc").first(),
    ctx.db.query("knowledgeArticles").withIndex("by_lead_until", (q) => q.gt("leadUntil", from)).order("desc").first(),
    ctx.db.query("libraryArticles").withIndex("by_lead_until", (q) => q.gt("leadUntil", from)).order("desc").first(),
  ]);
  const pins: LeadPin[] = [
    ...(news ? [{ table: "newsItems" as const, row: news }] : []),
    ...(knowledge ? [{ table: "knowledgeArticles" as const, row: knowledge }] : []),
    ...(helpful ? [{ table: "libraryArticles" as const, row: helpful }] : []),
  ];
  return pins.filter(canLead).sort((left, right) => (right.row.leadUntil ?? 0) - (left.row.leadUntil ?? 0))[0] ?? null;
}

/** Takes every pin off, in all three lists. */
async function clearPins(ctx: MutationCtx): Promise<void> {
  const [news, knowledge, helpful] = await Promise.all([
    ctx.db.query("newsItems").withIndex("by_lead_until", (q) => q.gt("leadUntil", 0)).take(PINS_READ),
    ctx.db.query("knowledgeArticles").withIndex("by_lead_until", (q) => q.gt("leadUntil", 0)).take(PINS_READ),
    ctx.db.query("libraryArticles").withIndex("by_lead_until", (q) => q.gt("leadUntil", 0)).take(PINS_READ),
  ]);
  await Promise.all([
    ...news.map((row) => ctx.db.patch(row._id, { leadUntil: undefined })),
    ...knowledge.map((row) => ctx.db.patch(row._id, { leadUntil: undefined })),
    ...helpful.map((row) => ctx.db.patch(row._id, { leadUntil: undefined })),
  ]);
}

/** Sets or clears one story's pin, in its own list. */
async function setLeadUntil(ctx: MutationCtx, story: LeadPin, leadUntil: number | undefined): Promise<void> {
  if (story.table === "newsItems") await ctx.db.patch(story.row._id, { leadUntil });
  else if (story.table === "knowledgeArticles") await ctx.db.patch(story.row._id, { leadUntil });
  else await ctx.db.patch(story.row._id, { leadUntil });
}

/** What is being pinned, found in whichever list it is in. */
async function findStory(ctx: QueryCtx, storyId: string): Promise<LeadPin | null> {
  const newsId = ctx.db.normalizeId("newsItems", storyId);
  if (newsId) {
    const row = await ctx.db.get(newsId);
    return row ? { table: "newsItems", row } : null;
  }
  const knowledgeId = ctx.db.normalizeId("knowledgeArticles", storyId);
  if (knowledgeId) {
    const row = await ctx.db.get(knowledgeId);
    return row ? { table: "knowledgeArticles", row } : null;
  }
  const helpfulId = ctx.db.normalizeId("libraryArticles", storyId);
  if (helpfulId) {
    const row = await ctx.db.get(helpfulId);
    return row ? { table: "libraryArticles", row } : null;
  }
  return null;
}

const storyIdValidator = v.union(v.id("newsItems"), v.id("knowledgeArticles"), v.id("libraryArticles"));

/** Makes a story the front page's lead for the next seven days, in place of any other pinned one, in any list. */
export const pinLeadStory = superAdminMutation({
  args: { storyId: storyIdValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const story = await findStory(ctx, args.storyId);
    if (!story) throw appError("NOT_FOUND", "That story is no longer here.");
    if (!canLead(story)) throw appError("INVALID_INPUT", "Only what readers can see can lead. Publish it first.");
    await clearPins(ctx);
    const leadUntil = Date.now() + LEAD_PIN_DAYS * DAY_MS;
    await setLeadUntil(ctx, story, leadUntil);
    await auditContentChange(ctx, "PIN_LEAD_STORY", story.table, story.row._id, { title: leadTitle(story), leadUntil });
    return null;
  },
});

/** Unpins a lead story: the rule chooses the lead again at once. */
export const unpinLeadStory = superAdminMutation({
  args: { storyId: storyIdValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const story = await findStory(ctx, args.storyId);
    if (!story || story.row.leadUntil === undefined) return null;
    await setLeadUntil(ctx, story, undefined);
    await auditContentChange(ctx, "UNPIN_LEAD_STORY", story.table, story.row._id, { title: leadTitle(story) });
    return null;
  },
});

/** A pin as Admin shows it on a row: its end, or null once it has run out. */
export function liveLeadUntil(leadUntil: number | undefined): number | null {
  return leadUntil !== undefined && leadUntil > Date.now() ? leadUntil : null;
}
