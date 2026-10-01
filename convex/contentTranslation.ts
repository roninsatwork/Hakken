import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { TRANSLATED_OWNERS, translatedOwnerValidator, type TranslatedOwner } from "./contentTranslationSchema";
import { TRANSLATED_LANGUAGES, isTranslatedLanguage, type AppLanguage } from "./utils/contentLanguages";
import { TRANSLATOR } from "./utils/contentTranslator";

export { TRANSLATOR, parseTranslation } from "./utils/contentTranslator";

/**
 * The Translator (docs/plans/active/knowledge-news-and-digest-plan.md,
 * revised 2026-10-01). Anthony: people write once, in English, and the
 * machine translates into every language Hakken is read in — never a field
 * per language, and nothing waits for a person to write each one.
 *
 * Each write that changes the English asks for a translation at once
 * (`requestTranslation`); the Translator writes every other language with a
 * model and keeps it with a fingerprint of the English it came from. A reader
 * sees their language when its translation is of the English as it stands,
 * and the English otherwise — so a change is never shown half-translated.
 *
 * It is a real agent, seeded like the wiki staff: on the Agents screen, its
 * model calls in the cost ledger, switchable off, and its Run button
 * translating whatever is missing. Its model calls run on Node, beside the
 * wiki staff's, in `contentTranslationActions.ts`.
 */


/** Rows of each kind read when looking for what is missing. */
const TRANSLATION_SCAN_LIMIT = 200;

type Fields = Record<string, string>;

/**
 * The English to translate, under the names a reader's copy keeps: an
 * article only while published; a Google update's News item through the
 * update itself, so the same words are never translated twice.
 */
export function sourceFields(owner: TranslatedOwner, row: Doc<TranslatedOwner>): Fields | null {
  switch (owner) {
    case "knowledgeArticles": {
      const article = row as Doc<"knowledgeArticles">;
      return article.status === "PUBLISHED" ? { title: article.titleEn, body: article.bodyEn } : null;
    }
    case "googleUpdates": {
      const update = row as Doc<"googleUpdates">;
      return { title: update.titleEn, description: update.descriptionEn };
    }
    case "newsFollows":
      return { why: (row as Doc<"newsFollows">).whyEn };
    case "newsItems": {
      const item = row as Doc<"newsItems">;
      return item.googleUpdateId ? null : { title: item.titleEn, summary: item.summaryEn, meaning: item.meaningEn };
    }
  }
}

/** A short fingerprint of the English (FNV-1a), so a translation of older words is known for what it is. */
export function fingerprint(fields: Fields): string {
  const text = JSON.stringify(Object.keys(fields).sort().map((key) => [key, fields[key]]));
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

async function loadOwner(ctx: QueryCtx, owner: TranslatedOwner, ownerId: string): Promise<Doc<TranslatedOwner> | null> {
  const id = ctx.db.normalizeId(owner, ownerId);
  return id ? await ctx.db.get(id) : null;
}

async function translationOf(ctx: QueryCtx, owner: TranslatedOwner, ownerId: string, language: string) {
  return await ctx.db
    .query("contentTranslations")
    .withIndex("by_owner_language", (q) => q.eq("owner", owner).eq("ownerId", ownerId).eq("language", language))
    .first();
}

/**
 * The words a reader sees: their language's, when it was made from the English
 * as it stands; otherwise the English. An empty translated value keeps the
 * English rather than showing nothing.
 */
export async function readerFields(ctx: QueryCtx, owner: TranslatedOwner, ownerId: string, english: Fields, language: string): Promise<Fields> {
  if (!isTranslatedLanguage(language)) return english;
  const translation = await translationOf(ctx, owner, ownerId, language);
  if (!translation || translation.sourceHash !== fingerprint(english)) return english;
  const fields: Fields = { ...english };
  for (const [key, value] of Object.entries(translation.fields)) if (key in english && value.trim()) fields[key] = value;
  return fields;
}

/** How many of the translated languages are done from the English as it stands: Admin's lists say so. */
export async function translationProgress(ctx: QueryCtx, owner: TranslatedOwner, ownerId: string, english: Fields | null) {
  if (!english) return { done: 0, total: 0 };
  const hash = fingerprint(english);
  let done = 0;
  for (const language of TRANSLATED_LANGUAGES) {
    if ((await translationOf(ctx, owner, ownerId, language))?.sourceHash === hash) done += 1;
  }
  return { done, total: TRANSLATED_LANGUAGES.length };
}

export const translationProgressValidator = v.object({ done: v.number(), total: v.number() });

/** Asks the Translator for a row whose English was just written. It skips what is already done. */
export async function requestTranslation(ctx: MutationCtx, owner: TranslatedOwner, ownerId: Id<TranslatedOwner>): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.contentTranslationActions.translateNow, { owner, ownerId });
}

/** Removes a row's translations with the row. */
export async function removeTranslations(ctx: MutationCtx, owner: TranslatedOwner, ownerId: string): Promise<void> {
  const rows = await ctx.db
    .query("contentTranslations")
    .withIndex("by_owner", (q) => q.eq("owner", owner).eq("ownerId", ownerId))
    .take(50);
  for (const row of rows) await ctx.db.delete(row._id);
}

/** Idempotent: the Translator's agent, created once and kept in step; never overwrites its on/off switch. */
export const ensureTranslatorInternal = internalMutation({
  args: {},
  handler: async (ctx): Promise<void> => {
    const now = Date.now();
    const agents = (await ctx.db.query("agents").withIndex("by_active_created", (q) => q.eq("isActive", true)).take(500))
      .concat(await ctx.db.query("agents").withIndex("by_active_created", (q) => q.eq("isActive", false)).take(500));
    const existing = agents.find((agent) => agent.systemKey === TRANSLATOR.systemKey);
    const definition = {
      name: TRANSLATOR.name,
      description: TRANSLATOR.description,
      systemPrompt: TRANSLATOR.systemPrompt,
      standingObjective: TRANSLATOR.standingObjective,
    };
    if (!existing) {
      await ctx.db.insert("agents", {
        ...definition,
        systemKey: TRANSLATOR.systemKey,
        modelId: "fast-chat (resolved at run time)",
        thinkingMode: false,
        isActive: true,
        isGlobal: true,
        createdAt: now,
        updatedAt: now,
      });
      return;
    }
    if (Object.entries(definition).some(([key, value]) => existing[key as keyof typeof definition] !== value)) {
      await ctx.db.patch(existing._id, { ...definition, updatedAt: now });
    }
  },
});

/** The English to translate and the languages still missing for it; null when nothing is to be translated. */
export const sourceForInternal = internalQuery({
  args: { owner: translatedOwnerValidator, ownerId: v.string() },
  handler: async (ctx, args): Promise<{ fields: Fields; hash: string; missing: AppLanguage[] } | null> => {
    const row = await loadOwner(ctx, args.owner, args.ownerId);
    const fields = row ? sourceFields(args.owner, row) : null;
    if (!fields) return null;
    const hash = fingerprint(fields);
    const missing: AppLanguage[] = [];
    for (const language of TRANSLATED_LANGUAGES) {
      if ((await translationOf(ctx, args.owner, args.ownerId, language))?.sourceHash !== hash) missing.push(language);
    }
    return { fields, hash, missing };
  },
});

/** Keeps a translation — unless the English changed while it was being made, when the newer request will. */
export const saveTranslationInternal = internalMutation({
  args: { owner: translatedOwnerValidator, ownerId: v.string(), language: v.string(), fields: v.record(v.string(), v.string()), sourceHash: v.string() },
  handler: async (ctx, args): Promise<boolean> => {
    const row = await loadOwner(ctx, args.owner, args.ownerId);
    const english = row ? sourceFields(args.owner, row) : null;
    if (!english || fingerprint(english) !== args.sourceHash) return false;
    const existing = await translationOf(ctx, args.owner, args.ownerId, args.language);
    const value = { owner: args.owner, ownerId: args.ownerId, language: args.language, fields: args.fields, sourceHash: args.sourceHash, translatedAt: Date.now() };
    if (existing) await ctx.db.replace(existing._id, value);
    else await ctx.db.insert("contentTranslations", value);
    return true;
  },
});

/** Every row whose translations are missing or older than its English, up to `limit`. */
export const missingTranslationsInternal = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, args): Promise<Array<{ owner: TranslatedOwner; ownerId: string }>> => {
    const found: Array<{ owner: TranslatedOwner; ownerId: string }> = [];
    for (const owner of TRANSLATED_OWNERS) {
      const rows: Array<Doc<TranslatedOwner>> = await ctx.db.query(owner).order("desc").take(TRANSLATION_SCAN_LIMIT);
      for (const row of rows) {
        if (found.length >= args.limit) return found;
        const english = sourceFields(owner, row);
        if (!english) continue;
        const progress = await translationProgress(ctx, owner, row._id, english);
        if (progress.done < progress.total) found.push({ owner, ownerId: row._id });
      }
    }
    return found;
  },
});

