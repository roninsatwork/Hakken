import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { superAdminMutation, superAdminQuery, tenantQuery } from "./tenantFunctions";
import { appError } from "./utils/appError";
import { auditContentChange, checkedText } from "./utils/contentAdmin";
import {
  fingerprint,
  readerFields,
  removeTranslations,
  requestTranslation,
  sourceFields,
  translationProgress,
  translationProgressValidator,
} from "./contentTranslation";
import { readInsightsCounts, refreshInsightsCounts } from "./insightsCounts";
import { syncOursInList, syncWebInList } from "./knowledgeList";

/**
 * Topics (docs/plans/active/insights-helpful-content-plan.md, IH20): one list,
 * shared by Knowledge, Helpful content and Who to follow, that the super admin
 * adds to, changes and deletes in Admin → Content → Topics. Readers see it in
 * Insights' side menu and filters, in its order and in their language.
 *
 * What uses a topic keeps its key (`topicsSchema.ts`). Deleting a topic asks
 * first on screen, then takes it off everything that used it in the same
 * write: those are left without a topic until another is chosen.
 */

/** The most topics: each is a line in Insights' side menu, and the list is read whole. */
export const MAX_TOPICS = 30;
/** A topic's name sits in a side menu and a filter chip. */
export const MAX_TOPIC_NAME = 40;
/** Rows read when counting or clearing one topic's uses: as many as any one list reads whole (Helpful content's and Who to follow's 500). */
const USES_READ = 500;

/** The topics there were before the list (R9), kept under the keys their articles carry, with the Italian already written for them. */
const FIRST_TOPICS = [
  { key: "TRAFFIC", nameEn: "Traffic", it: "Traffico" },
  { key: "RANKINGS", nameEn: "Rankings", it: "Posizionamenti" },
  { key: "AI_ANSWERS", nameEn: "AI answers", it: "Risposte AI" },
  { key: "BACKLINKS", nameEn: "Backlinks", it: "Backlink" },
] as const;

const usesValidator = v.object({ knowledge: v.number(), helpful: v.number(), people: v.number() });
const adminValidator = v.object({
  _id: v.id("topics"),
  key: v.string(),
  nameEn: v.string(),
  /** Its place in menus, from 1. */
  order: v.number(),
  uses: usesValidator,
  translations: translationProgressValidator,
});

export async function topicsInOrder(ctx: QueryCtx): Promise<Array<Doc<"topics">>> {
  return await ctx.db.query("topics").withIndex("by_position").take(MAX_TOPICS);
}

async function topicByKey(ctx: QueryCtx, key: string) {
  return await ctx.db.query("topics").withIndex("by_key", (q) => q.eq("key", key)).first();
}

/** A topic chosen in an editor, as stored: its key, or none; refused when it is not in the list. */
export async function checkedTopicKey(ctx: QueryCtx, key: string | undefined): Promise<string | undefined> {
  const trimmed = key?.trim();
  if (!trimmed) return undefined;
  if (!(await topicByKey(ctx, trimmed))) throw appError("INVALID_INPUT", "That topic is no longer in the list. Choose another.");
  return trimmed;
}

/** A new topic's key from its English name — "LOCAL_SEARCH" for "Local search" — kept unique. */
export function keyFromName(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  return base || "TOPIC";
}

async function uniqueKey(ctx: QueryCtx, name: string): Promise<string> {
  const base = keyFromName(name);
  let key = base;
  for (let suffix = 2; await topicByKey(ctx, key); suffix += 1) key = `${base}_${suffix}`;
  return key;
}

/** No use yet. */
const NO_USES = { knowledge: 0, helpful: 0, people: 0 };

async function adminRow(ctx: QueryCtx, row: Doc<"topics">, order: number, uses: Record<string, typeof NO_USES>) {
  return {
    _id: row._id,
    key: row.key,
    nameEn: row.nameEn,
    order,
    // Kept as they change (IH21): what uses each topic is never counted on a page view.
    uses: uses[row.key] ?? NO_USES,
    translations: await translationProgress(ctx, "topics", row._id, sourceFields("topics", row)),
  };
}

/** A name as stored: trimmed, within its length, and not another topic's. */
async function checkedName(ctx: QueryCtx, name: string, exceptId?: Id<"topics">): Promise<string> {
  const nameEn = checkedText(name, "A name", MAX_TOPIC_NAME);
  const lower = nameEn.toLocaleLowerCase("en-GB");
  const clash = (await topicsInOrder(ctx)).find((topic) => topic._id !== exceptId && topic.nameEn.toLocaleLowerCase("en-GB") === lower);
  if (clash) throw appError("INVALID_INPUT", `There is already a topic called “${clash.nameEn}”.`);
  return nameEn;
}

/** Puts a topic at `order` (from 1) and numbers the rest after it, changing only what moved. */
async function placeAt(ctx: MutationCtx, topicId: Id<"topics">, order: number | undefined) {
  const others = (await topicsInOrder(ctx)).filter((topic) => topic._id !== topicId);
  const at = order === undefined ? others.length : Math.min(Math.max(Math.round(order) - 1, 0), others.length);
  const ids = [...others.slice(0, at).map((topic) => topic._id), topicId, ...others.slice(at).map((topic) => topic._id)];
  const current = new Map((await topicsInOrder(ctx)).map((topic) => [topic._id, topic.position]));
  for (const [index, id] of ids.entries()) {
    if (current.get(id) !== index + 1) await ctx.db.patch(id, { position: index + 1 });
  }
}

/** The list in order, in the reader's language: Insights' side menu, its filters and each article's facts. */
export const listTopics = tenantQuery({
  args: { language: v.string() },
  returns: v.array(v.object({ key: v.string(), name: v.string() })),
  handler: async (ctx, args) => {
    const rows = await topicsInOrder(ctx);
    return await Promise.all(rows.map(async (row) => ({
      key: row.key,
      name: (await readerFields(ctx, "topics", row._id, { name: row.nameEn }, args.language)).name,
    })));
  },
});

/** The list in order, in English: the topic chooser in every Admin editor and filter. */
export const listTopicChoices = superAdminQuery({
  args: {},
  returns: v.array(v.object({ key: v.string(), nameEn: v.string() })),
  handler: async (ctx) => (await topicsInOrder(ctx)).map((row) => ({ key: row.key, nameEn: row.nameEn })),
});

/** Admin → Content → Topics: each topic, what uses it, and how far its translations have got. */
export const listTopicsForAdmin = superAdminQuery({
  args: {},
  returns: v.array(adminValidator),
  handler: async (ctx) => {
    const rows = await topicsInOrder(ctx);
    const { uses } = await readInsightsCounts(ctx);
    return await Promise.all(rows.map((row, index) => adminRow(ctx, row, index + 1, uses)));
  },
});

/** One topic for its own page; null when it has gone. */
export const getTopic = superAdminQuery({
  args: { topicId: v.id("topics") },
  returns: v.union(v.null(), adminValidator),
  handler: async (ctx, args) => {
    const rows = await topicsInOrder(ctx);
    const index = rows.findIndex((row) => row._id === args.topicId);
    return index < 0 ? null : await adminRow(ctx, rows[index], index + 1, (await readInsightsCounts(ctx)).uses);
  },
});

export const createTopic = superAdminMutation({
  args: { nameEn: v.string(), order: v.optional(v.number()) },
  returns: v.id("topics"),
  handler: async (ctx, args) => {
    if ((await topicsInOrder(ctx)).length >= MAX_TOPICS) {
      throw appError("INVALID_INPUT", `There can be at most ${MAX_TOPICS} topics. Delete one first.`);
    }
    const nameEn = await checkedName(ctx, args.nameEn);
    const now = Date.now();
    const topicId = await ctx.db.insert("topics", { key: await uniqueKey(ctx, nameEn), nameEn, position: MAX_TOPICS + 1, createdAt: now, updatedAt: now });
    await placeAt(ctx, topicId, args.order);
    await requestTranslation(ctx, "topics", topicId);
    await auditContentChange(ctx, "CREATE_TOPIC", "topics", topicId, { name: nameEn });
    return topicId;
  },
});

export const updateTopic = superAdminMutation({
  args: { topicId: v.id("topics"), nameEn: v.string(), order: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.topicId);
    if (!existing) throw appError("NOT_FOUND", "That topic is no longer in the list.");
    const nameEn = await checkedName(ctx, args.nameEn, args.topicId);
    // The key never changes: everything that uses the topic keeps it through a rename.
    await ctx.db.patch(args.topicId, { nameEn, updatedAt: Date.now() });
    await placeAt(ctx, args.topicId, args.order);
    if (nameEn !== existing.nameEn) await requestTranslation(ctx, "topics", args.topicId);
    await auditContentChange(ctx, "UPDATE_TOPIC", "topics", args.topicId, { name: nameEn, was: existing.nameEn });
    return null;
  },
});

/** Deletes a topic and takes it off everything that used it, which is left without one. Asked first on screen. */
export const deleteTopic = superAdminMutation({
  args: { topicId: v.id("topics") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.topicId);
    if (!existing) return null;
    const key = existing.key;
    const [knowledge, helpful, people] = await Promise.all([
      ctx.db.query("knowledgeArticles").withIndex("by_topic", (q) => q.eq("topic", key)).take(USES_READ),
      ctx.db.query("libraryArticles").withIndex("by_topic", (q) => q.eq("topic", key)).take(USES_READ),
      ctx.db.query("newsFollows").withIndex("by_topic", (q) => q.eq("topic", key)).take(USES_READ),
    ]);
    await Promise.all([...knowledge, ...helpful, ...people].map((row) => ctx.db.patch(row._id, { topic: undefined })));
    for (const article of knowledge) await syncOursInList(ctx, article._id);
    for (const article of helpful) await syncWebInList(ctx, article._id);
    await ctx.db.delete(args.topicId);
    await removeTranslations(ctx, "topics", args.topicId);
    // Close the gap its place left.
    const rest = await topicsInOrder(ctx);
    for (const [index, topic] of rest.entries()) if (topic.position !== index + 1) await ctx.db.patch(topic._id, { position: index + 1 });
    await refreshInsightsCounts(ctx);
    await auditContentChange(ctx, "DELETE_TOPIC", "topics", args.topicId, {
      name: existing.nameEn,
      cleared: { knowledge: knowledge.length, helpful: helpful.length, people: people.length },
    });
    return null;
  },
});

/**
 * The topics there were before the list, as its first rows, with their Italian
 * as `messages/it.json` had it — so no reader sees a topic's name change.
 * Idempotent: a topic already there, or a translation already written, is left.
 */
export async function seedFirstTopics(ctx: MutationCtx): Promise<number> {
  let added = 0;
  const now = Date.now();
  for (const [index, topic] of FIRST_TOPICS.entries()) {
    let row = await topicByKey(ctx, topic.key);
    if (!row) {
      const topicId = await ctx.db.insert("topics", { key: topic.key, nameEn: topic.nameEn, position: index + 1, createdAt: now, updatedAt: now });
      row = await ctx.db.get(topicId);
      added += 1;
    }
    if (!row) continue;
    const italian = await ctx.db
      .query("contentTranslations")
      .withIndex("by_owner_language", (q) => q.eq("owner", "topics").eq("ownerId", row._id).eq("language", "it"))
      .first();
    if (!italian && row.nameEn === topic.nameEn) {
      await ctx.db.insert("contentTranslations", {
        owner: "topics",
        ownerId: row._id,
        language: "it",
        fields: { name: topic.it },
        sourceHash: fingerprint({ name: row.nameEn }),
        translatedAt: now,
      });
    }
  }
  return added;
}

/** For tests and the migration: the first topics, once. */
export const seedFirstTopicsInternal = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => await seedFirstTopics(ctx),
});
