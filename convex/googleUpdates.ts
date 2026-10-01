import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { superAdminMutation, superAdminQuery, tenantQuery } from "./tenantFunctions";
import { appError } from "./utils/appError";
import { auditContentChange, checkedDay, checkedText, checkedUrl, dayStart } from "./utils/contentAdmin";
import { readerFields, removeTranslations, requestTranslation, sourceFields, translationProgress, translationProgressValidator } from "./contentTranslation";

/**
 * Google updates, entered by hand in Admin → Content (docs/plans/active/
 * knowledge-news-and-digest-plan.md, D6): written in English, translated by
 * the Translator, each shows in News at once — as an item kept in step with it
 * — and, from phase 10, as a marker on every Sites chart that runs over dates.
 */

/** Updates read at once: Google announces a handful a year. */
export const MAX_GOOGLE_UPDATES = 200;
const MAX_TITLE = 160;
const MAX_DESCRIPTION = 1_000;
const MAX_MEANING = 600;
/** How long an update may take when nobody said: Google's usual "up to two weeks" (R8). */
export const DEFAULT_EXPECTED_DAYS = 14;
/** The longest an update may be expected to take, in days. Google's longest have run about a month. */
const MAX_EXPECTED_DAYS = 60;
/** The Google updates beside News's lead story (R5). */
export const LATEST_UPDATES_SHOWN = 3;

/** What a reader needs to draw an update's rollout: when it started, finished, and should finish by. */
export const updateFactsValidator = v.object({
  startedOn: v.string(),
  finishedOn: v.union(v.string(), v.null()),
  expectedDays: v.number(),
});

export function updateFacts(row: Doc<"googleUpdates">) {
  return { startedOn: row.startedOn, finishedOn: row.finishedOn ?? null, expectedDays: row.expectedDays ?? DEFAULT_EXPECTED_DAYS };
}

const adminValidator = v.object({
  _id: v.id("googleUpdates"),
  titleEn: v.string(),
  descriptionEn: v.string(),
  startedOn: v.string(),
  finishedOn: v.union(v.string(), v.null()),
  expectedDays: v.number(),
  meaningEn: v.string(),
  url: v.string(),
  updatedAt: v.number(),
  translations: translationProgressValidator,
});

/** An update as a reader sees it, in their language. */
const readerValidator = v.object({
  _id: v.id("googleUpdates"),
  title: v.string(),
  description: v.string(),
  startedOn: v.string(),
  finishedOn: v.union(v.string(), v.null()),
  url: v.string(),
});

const updateInput = {
  titleEn: v.string(),
  descriptionEn: v.string(),
  startedOn: v.string(),
  /** Empty while it is still rolling out. */
  finishedOn: v.string(),
  /** Up to how many days Google said it may take; 14 when left out (R8). */
  expectedDays: v.optional(v.number()),
  /** "What it means for you"; may be left empty. */
  meaningEn: v.optional(v.string()),
  url: v.string(),
};

type UpdateInput = {
  titleEn: string;
  descriptionEn: string;
  startedOn: string;
  finishedOn: string;
  expectedDays?: number;
  meaningEn?: string;
  url: string;
};

async function adminRow(ctx: QueryCtx, row: Doc<"googleUpdates">) {
  return {
    _id: row._id,
    titleEn: row.titleEn,
    descriptionEn: row.descriptionEn,
    startedOn: row.startedOn,
    finishedOn: row.finishedOn ?? null,
    expectedDays: row.expectedDays ?? DEFAULT_EXPECTED_DAYS,
    meaningEn: row.meaningEn ?? "",
    url: row.url,
    updatedAt: row.updatedAt,
    translations: await translationProgress(ctx, "googleUpdates", row._id, sourceFields("googleUpdates", row)),
  };
}

/**
 * An update in the reader's language: the Translator's words once ready, the
 * English until then. `meaning` is empty when none was written.
 */
export async function updateInLanguage(ctx: QueryCtx, row: Doc<"googleUpdates">, language: string) {
  const english = sourceFields("googleUpdates", row) ?? { title: row.titleEn, description: row.descriptionEn };
  const words = await readerFields(ctx, "googleUpdates", row._id, english, language);
  return { title: words.title, description: words.description, meaning: words.meaning ?? "" };
}

/** The update as it will be stored: a real start, a finish not before it, Google's own link. */
export function checkedUpdate(input: UpdateInput) {
  const startedOn = checkedDay(input.startedOn, "The day it started");
  const finishedOn = input.finishedOn.trim() ? checkedDay(input.finishedOn, "The day it finished") : undefined;
  if (finishedOn && finishedOn < startedOn) throw appError("INVALID_INPUT", "It cannot finish before it started.");
  const expectedDays = input.expectedDays ?? DEFAULT_EXPECTED_DAYS;
  if (!Number.isInteger(expectedDays) || expectedDays < 1 || expectedDays > MAX_EXPECTED_DAYS) {
    throw appError("INVALID_INPUT", `How long it may take is a whole number of days, from 1 to ${MAX_EXPECTED_DAYS}.`);
  }
  const meaningEn = checkedText(input.meaningEn ?? "", "What it means for you", MAX_MEANING, { optional: true });
  return {
    titleEn: checkedText(input.titleEn, "A title", MAX_TITLE),
    descriptionEn: checkedText(input.descriptionEn, "A description", MAX_DESCRIPTION),
    startedOn,
    finishedOn,
    expectedDays,
    meaningEn: meaningEn || undefined,
    url: checkedUrl(input.url, "Google's link"),
  };
}

/** Brings the update's News item in line with it: the description is the item's summary. */
async function syncNewsItem(ctx: MutationCtx, update: Doc<"googleUpdates">): Promise<void> {
  const fields = {
    kind: "GOOGLE_UPDATE" as const,
    googleUpdateId: update._id,
    sourceName: "Google",
    titleEn: update.titleEn,
    summaryEn: update.descriptionEn,
    meaningEn: update.meaningEn ?? "",
    url: update.url,
    publishedAt: dayStart(update.startedOn),
    externalKey: `google-update:${update._id}`,
  };
  const existing = await ctx.db
    .query("newsItems")
    .withIndex("by_google_update", (q) => q.eq("googleUpdateId", update._id))
    .first();
  if (existing) await ctx.db.patch(existing._id, fields);
  else await ctx.db.insert("newsItems", { ...fields, createdAt: Date.now() });
}

/** Every Google update, the latest to start first: Admin → Content → Google updates. */
export const listGoogleUpdates = superAdminQuery({
  args: {},
  returns: v.array(adminValidator),
  handler: async (ctx) => {
    const rows = await ctx.db.query("googleUpdates").withIndex("by_started").order("desc").take(MAX_GOOGLE_UPDATES);
    return await Promise.all(rows.map((row) => adminRow(ctx, row)));
  },
});

/** One update for its editing page; null when it has gone. */
export const getGoogleUpdate = superAdminQuery({
  args: { updateId: v.id("googleUpdates") },
  returns: v.union(v.null(), adminValidator),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.updateId);
    return row ? await adminRow(ctx, row) : null;
  },
});

/**
 * The updates that started between two days, inclusive, earliest first, in the
 * reader's language: what a Sites chart over those dates marks (phase 10).
 * Every signed-in user's, as News is.
 */
export const listGoogleUpdatesBetween = tenantQuery({
  args: { from: v.string(), to: v.string(), language: v.string() },
  returns: v.array(readerValidator),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("googleUpdates")
      .withIndex("by_started", (q) => q.gte("startedOn", args.from).lte("startedOn", args.to))
      .take(MAX_GOOGLE_UPDATES);
    return await Promise.all(rows.map(async (row) => {
      const { title, description } = await updateInLanguage(ctx, row, args.language);
      return { _id: row._id, title, description, startedOn: row.startedOn, finishedOn: row.finishedOn ?? null, url: row.url };
    }));
  },
});

/**
 * The latest updates to start, newest first, in the reader's language, each
 * with its rollout and the News item that opens it: beside News's lead story
 * (R5), where "All Google updates" leads to the rest.
 */
export const listLatestGoogleUpdates = tenantQuery({
  args: { language: v.string() },
  returns: v.array(v.object({ _id: v.id("googleUpdates"), title: v.string(), itemId: v.union(v.id("newsItems"), v.null()), ...updateFactsValidator.fields })),
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("googleUpdates").withIndex("by_started").order("desc").take(LATEST_UPDATES_SHOWN);
    return await Promise.all(rows.map(async (row) => {
      const item = await ctx.db.query("newsItems").withIndex("by_google_update", (q) => q.eq("googleUpdateId", row._id)).first();
      const { title } = await updateInLanguage(ctx, row, args.language);
      return { _id: row._id, title, itemId: item?._id ?? null, ...updateFacts(row) };
    }));
  },
});

export const createGoogleUpdate = superAdminMutation({
  args: updateInput,
  returns: v.id("googleUpdates"),
  handler: async (ctx, args) => {
    const now = Date.now();
    const checked = checkedUpdate(args);
    const updateId = await ctx.db.insert("googleUpdates", { ...checked, createdAt: now, updatedAt: now });
    const update = await ctx.db.get(updateId);
    if (update) await syncNewsItem(ctx, update);
    await requestTranslation(ctx, "googleUpdates", updateId);
    await auditContentChange(ctx, "CREATE_GOOGLE_UPDATE", "googleUpdates", updateId, { title: checked.titleEn, startedOn: checked.startedOn });
    return updateId;
  },
});

export const updateGoogleUpdate = superAdminMutation({
  args: { updateId: v.id("googleUpdates"), ...updateInput },
  returns: v.null(),
  handler: async (ctx, { updateId, ...input }) => {
    const existing = await ctx.db.get(updateId);
    if (!existing) throw appError("NOT_FOUND", "That Google update is no longer here.");
    const checked = checkedUpdate(input);
    // `replace` rather than `patch`, so clearing the finish day really clears it.
    await ctx.db.replace(updateId, { ...checked, createdAt: existing.createdAt, updatedAt: Date.now() });
    const update = await ctx.db.get(updateId);
    if (update) await syncNewsItem(ctx, update);
    await requestTranslation(ctx, "googleUpdates", updateId);
    await auditContentChange(ctx, "UPDATE_GOOGLE_UPDATE", "googleUpdates", updateId, { title: checked.titleEn, startedOn: checked.startedOn });
    return null;
  },
});

export const deleteGoogleUpdate = superAdminMutation({
  args: { updateId: v.id("googleUpdates") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.updateId);
    if (!existing) return null;
    await removeNewsItem(ctx, args.updateId);
    await removeTranslations(ctx, "googleUpdates", args.updateId);
    await ctx.db.delete(args.updateId);
    await auditContentChange(ctx, "DELETE_GOOGLE_UPDATE", "googleUpdates", args.updateId, { title: existing.titleEn });
    return null;
  },
});

async function removeNewsItem(ctx: MutationCtx, updateId: Id<"googleUpdates">): Promise<void> {
  const items = await ctx.db
    .query("newsItems")
    .withIndex("by_google_update", (q) => q.eq("googleUpdateId", updateId))
    .take(10);
  for (const item of items) await ctx.db.delete(item._id);
}
