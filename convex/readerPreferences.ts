import { v } from "convex/values";

import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { publicMutation, tenantMutation, tenantQuery } from "./tenantFunctions";
import { communicationValidator } from "./outboxSchema";
import { APP_LANGUAGES, SOURCE_LANGUAGE } from "./utils/contentLanguages";
import { CHOOSABLE_COMMUNICATIONS, isChoosable, type Communication } from "./utils/communications";

/**
 * Each user's email choices (docs/plans/active/knowledge-news-and-digest-
 * plan.md, phase 8; outbox-and-preferences-plan.md, B1): every type of email
 * a person may choose comes to them until they turn it off on their profile
 * or with the link in the email (A5), in the language they last used in the
 * app (A16) — English until one is recorded.
 * A row is made the first time any of it is needed; no row reads as
 * subscribed, in English.
 */

export type ReaderPreferences = { newsDigest: boolean; turnedOff: Communication[]; language: string; unsubscribeToken: string | null };

const DEFAULTS: ReaderPreferences = { newsDigest: true, turnedOff: [], language: SOURCE_LANGUAGE, unsubscribeToken: null };

/**
 * Whether someone turned a type of communication off (outbox-and-preferences-
 * plan.md, B1): the digest is its own switch, as it always was; the rest
 * are listed. Only the choosable ones can be off — every other kind comes.
 */
export function isTurnedOff(preferences: Pick<ReaderPreferences, "newsDigest" | "turnedOff">, communication: Communication): boolean {
  if (!isChoosable(communication)) return false;
  return communication === "WEEKLY_NEWS_DIGEST" ? !preferences.newsDigest : preferences.turnedOff.includes(communication);
}

/** Turn one choosable type on or off on a person's row. */
async function setTurnedOff(ctx: MutationCtx, row: Doc<"readerPreferences">, communication: Communication, off: boolean): Promise<void> {
  if (!isChoosable(communication)) return;
  const now = Date.now();
  if (communication === "WEEKLY_NEWS_DIGEST") {
    if (row.newsDigest === off) await ctx.db.patch(row._id, { newsDigest: !off, updatedAt: now });
    return;
  }
  const held = row.turnedOff ?? [];
  const next = off ? [...new Set([...held, communication])] : held.filter((entry) => entry !== communication);
  if (next.length !== held.length) await ctx.db.patch(row._id, { turnedOff: next, updatedAt: now });
  // Their tasks say how they'll hear (Hakken tasks): by email only while these emails are on.
  if (communication === "HAKKEN_TASKS") {
    for (const task of await ctx.db.query("hakkenTasks").withIndex("by_owner", (q) => q.eq("userId", row.userId)).take(300)) {
      if (task.state !== "DELETED" && task.channels.email === off) await ctx.db.patch(task._id, { channels: { ...task.channels, email: !off }, updatedAt: now });
    }
  }
}

/** Whether a person gets a type of email, for what a new task says it will send them. */
export const isEmailOnInternal = internalQuery({
  args: { userId: v.id("users"), communication: communicationValidator },
  returns: v.boolean(),
  handler: async (ctx, args) => !isTurnedOff(await readerPreferencesOf(ctx, args.userId), args.communication),
});

async function rowOf(ctx: QueryCtx, userId: Id<"users">): Promise<Doc<"readerPreferences"> | null> {
  return await ctx.db.query("readerPreferences").withIndex("by_user", (q) => q.eq("userId", userId)).first();
}

export async function readerPreferencesOf(ctx: QueryCtx, userId: Id<"users">): Promise<ReaderPreferences> {
  const row = await rowOf(ctx, userId);
  return row ? { newsDigest: row.newsDigest, turnedOff: row.turnedOff ?? [], language: row.language ?? SOURCE_LANGUAGE, unsubscribeToken: row.unsubscribeToken } : DEFAULTS;
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

/** The signed-in user's own choices, for their profile: each type they may choose, on or off. */
export const getMyEmailPreferences = tenantQuery({
  args: {},
  returns: v.object({
    language: v.string(),
    choices: v.array(v.object({ communication: communicationValidator, on: v.boolean() })),
  }),
  handler: async (ctx) => {
    const preferences = await readerPreferencesOf(ctx, ctx.userId);
    return {
      language: preferences.language,
      choices: CHOOSABLE_COMMUNICATIONS.map((communication) => ({ communication, on: !isTurnedOff(preferences, communication) })),
    };
  },
});

/** Turn one type of email on or off, from the user's own profile. */
export const setMyEmail = tenantMutation({
  args: { communication: communicationValidator, on: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ensureReaderPreferences(ctx, ctx.userId);
    await setTurnedOff(ctx, row, args.communication, !args.on);
    return null;
  },
});

/** Unsubscribe from all, or subscribe to all, from the user's own profile. */
export const setAllMyEmails = tenantMutation({
  args: { on: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const communication of CHOOSABLE_COMMUNICATIONS) {
      const row = await ensureReaderPreferences(ctx, ctx.userId);
      await setTurnedOff(ctx, row, communication, !args.on);
    }
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

/**
 * The link in an email turns its own type off (Anthony, 2026-10-07: one in
 * each email a person can opt out of). A link from before the types — the
 * digest's — names none, and turns the digest off as it always did.
 */
async function unsubscribe(ctx: MutationCtx, token: string, kind: string | undefined): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  const communication = kind ?? "WEEKLY_NEWS_DIGEST";
  if (!isChoosable(communication)) return false;
  const row = await ctx.db.query("readerPreferences").withIndex("by_token", (q) => q.eq("unsubscribeToken", token)).first();
  if (!row) return false;
  await setTurnedOff(ctx, row, communication, true);
  return true;
}

/**
 * The button on the unsubscribe page the email links to: no sign-in, the
 * token is the proof. Never on arrival — mail scanners open links before
 * their readers do (`src/app/verify/page.tsx`).
 */
export const unsubscribeWithToken = publicMutation({
  reason: "Pressed on the unsubscribe page an email links to, by someone who may not be signed in. The unguessable token in the link is the proof; it can only turn off the one type of email the link names, of those a person may choose.",
  args: { token: v.string(), kind: v.optional(v.string()) },
  returns: v.boolean(),
  handler: async (ctx, args) => await unsubscribe(ctx, args.token, args.kind),
});

/** The one-click unsubscribe a mail client sends (RFC 8058), through `http.ts`. */
export const unsubscribeWithTokenInternal = internalMutation({
  args: { token: v.string(), kind: v.optional(v.string()) },
  returns: v.boolean(),
  handler: async (ctx, args) => await unsubscribe(ctx, args.token, args.kind),
});
