import { v } from "convex/values";

import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { publicMutation, tenantMutation, tenantQuery } from "./tenantFunctions";
import { APP_LANGUAGES, SOURCE_LANGUAGE } from "./utils/contentLanguages";

/**
 * Each user's email choices (docs/plans/active/knowledge-news-and-digest-
 * plan.md, phase 8): the Weekly News Digest comes to every user until they
 * turn it off on their profile or with the link in the email (A5), in the
 * language they last used in the app (A16) — English until one is recorded.
 * A row is made the first time any of it is needed; no row reads as
 * subscribed, in English.
 */

export type ReaderPreferences = { newsDigest: boolean; language: string; unsubscribeToken: string | null };

const DEFAULTS: ReaderPreferences = { newsDigest: true, language: SOURCE_LANGUAGE, unsubscribeToken: null };

async function rowOf(ctx: QueryCtx, userId: Id<"users">): Promise<Doc<"readerPreferences"> | null> {
  return await ctx.db.query("readerPreferences").withIndex("by_user", (q) => q.eq("userId", userId)).first();
}

export async function readerPreferencesOf(ctx: QueryCtx, userId: Id<"users">): Promise<ReaderPreferences> {
  const row = await rowOf(ctx, userId);
  return row ? { newsDigest: row.newsDigest, language: row.language ?? SOURCE_LANGUAGE, unsubscribeToken: row.unsubscribeToken } : DEFAULTS;
}

/** An unguessable token for the unsubscribe link: the link carries it, never the user's id. */
function newToken(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "");
}

/** The user's row, made when first needed, with its unsubscribe token. */
export async function ensureReaderPreferences(ctx: MutationCtx, userId: Id<"users">): Promise<Doc<"readerPreferences">> {
  const held = await rowOf(ctx, userId);
  if (held) return held;
  const rowId = await ctx.db.insert("readerPreferences", { userId, newsDigest: true, unsubscribeToken: newToken(), updatedAt: Date.now() });
  return (await ctx.db.get(rowId))!;
}

/** The signed-in user's own choices, for their profile. */
export const getMyEmailPreferences = tenantQuery({
  args: {},
  returns: v.object({ newsDigest: v.boolean(), language: v.string() }),
  handler: async (ctx) => {
    const { newsDigest, language } = await readerPreferencesOf(ctx, ctx.userId);
    return { newsDigest, language };
  },
});

/** Turn the Weekly News Digest on or off, from the user's own profile. */
export const setMyNewsDigest = tenantMutation({
  args: { subscribed: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ensureReaderPreferences(ctx, ctx.userId);
    await ctx.db.patch(row._id, { newsDigest: args.subscribed, updatedAt: Date.now() });
    return null;
  },
});

/**
 * The language the user is using the app in, recorded when they sign in and
 * whenever they switch: their digest is written in it. Only a language the
 * app is read in; nothing written when it has not changed.
 */
export const recordMyLanguage = tenantMutation({
  args: { language: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await recordLanguage(ctx, ctx.userId, args.language);
    return null;
  },
});

/** Also called with each sign-in's record (`users.recordLogin`). */
export async function recordLanguage(ctx: MutationCtx, userId: Id<"users">, language: string): Promise<void> {
  if (!(APP_LANGUAGES as readonly string[]).includes(language)) return;
  const held = await rowOf(ctx, userId);
  if (held?.language === language) return;
  const row = held ?? await ensureReaderPreferences(ctx, userId);
  const now = Date.now();
  await ctx.db.patch(row._id, { language, languageAt: now, updatedAt: now });
}

async function unsubscribe(ctx: MutationCtx, token: string): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  const row = await ctx.db.query("readerPreferences").withIndex("by_token", (q) => q.eq("unsubscribeToken", token)).first();
  if (!row) return false;
  if (row.newsDigest) await ctx.db.patch(row._id, { newsDigest: false, updatedAt: Date.now() });
  return true;
}

/**
 * The button on the unsubscribe page the email links to: no sign-in, the
 * token is the proof. Never on arrival — mail scanners open links before
 * their readers do (`src/app/verify/page.tsx`).
 */
export const unsubscribeWithToken = publicMutation({
  reason: "Pressed on the unsubscribe page an email links to, by someone who may not be signed in. The unguessable token in the link is the proof; it can only turn the Weekly News Digest off.",
  args: { token: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => await unsubscribe(ctx, args.token),
});

/** The one-click unsubscribe a mail client sends (RFC 8058), through `http.ts`. */
export const unsubscribeWithTokenInternal = internalMutation({
  args: { token: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => await unsubscribe(ctx, args.token),
});
