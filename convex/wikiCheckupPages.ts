import { v } from "convex/values";
import { documentFullText, WIKI_DISTILL_TEXT_MAX_CHARS } from "./wikiDocumentText";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { adminMutation, adminQuery } from "./tenantFunctions";
import { assertAdminCanAccessCompany } from "./authz";
import { appError } from "./utils/appError";
import { buildWikiSearchText } from "./wikiPages";
import { WIKI_PAGE_MAX_CHARS, linkKeyFor } from "./wikiRewriteService";
import {
  WIKI_MAX_TAGS_PER_PAGE,
  WIKI_WEBSITE_REREAD_MS,
  hasDisagreeNote,
  normaliseTag,
} from "./wikiCheckupRules";
import { isKnowledgeArticlePage } from "./utils/knowledgePageGuard";

/**
 * The daily check-up's hands (wiki-daily-checkup-plan.md): every change it
 * makes to a page lands here, through one audited door each — a fix by the
 * settling rules, a "sources disagree" note, a page moved to its right type,
 * two pages merged, a page removed, tags, and following a changed or removed
 * file. Every change to a page's words files the old words as a revision
 * first, so every fix can be undone from the page's history.
 */

type WikiScope = Id<"companies"> | undefined;
type WikiKind = Doc<"wikiPages">["kind"];

const KINDS: WikiKind[] = ["CUSTOMER", "PRODUCT", "POLICY", "ISSUE", "CLIENT", "SOURCE", "GOAL"];

function splitKey(key: string): { kind: WikiKind; subjectKey: string } | null {
  const separator = key.indexOf(":");
  if (separator <= 0) return null;
  const kind = key.slice(0, separator) as WikiKind;
  if (!KINDS.includes(kind)) return null;
  return { kind, subjectKey: key.slice(separator + 1) };
}

async function pageByKey(ctx: QueryCtx, companyId: WikiScope, key: string) {
  const parts = splitKey(key);
  if (!parts) return null;
  return await ctx.db
    .query("wikiPages")
    .withIndex("by_company_kind_subject", (q) =>
      q.eq("companyId", companyId).eq("kind", parts.kind).eq("subjectKey", parts.subjectKey)
    )
    .unique();
}

async function requireScopedPage(ctx: QueryCtx, companyId: WikiScope, pageId: Id<"wikiPages">) {
  const page = await ctx.db.get(pageId);
  if (!page || page.companyId !== companyId) return null;
  // A Knowledge article's copy is a person's writing, changed only in Admin, Content, Knowledge: the check-up's fixes,
  // merges, moves, removals and tags all leave it alone (utils/knowledgePageGuard.ts; wiki-sonae-catch-up-plan-2026-11-21.md).
  if (isKnowledgeArticlePage(page)) return null;
  return page;
}

/** Replace a page's words, old words filed as a revision, the fix audited. */
async function rewritePage(
  ctx: MutationCtx,
  args: {
    page: Doc<"wikiPages">;
    content: string;
    source: string;
    rule: string;
    detail?: string;
    maxChars?: number;
  }
): Promise<boolean> {
  const content = args.content.trim().slice(0, args.maxChars ?? WIKI_PAGE_MAX_CHARS);
  if (!content || content === args.page.content) return false;
  const now = Date.now();
  await ctx.db.insert("wikiPageRevisions", {
    pageId: args.page._id,
    companyId: args.page.companyId,
    content: args.page.content,
    source: args.source,
    createdAt: now,
  });
  await ctx.db.patch(args.page._id, {
    content,
    searchText: buildWikiSearchText({ title: args.page.title, subjectKey: args.page.subjectKey, content }),
    rewriteCount: args.page.rewriteCount + 1,
    lastRewriteSource: args.source,
    updatedAt: now,
  });
  await ctx.db.insert("auditLogs", {
    actionType: "WIKI_CHECKUP_FIX",
    entityType: "wikiPages",
    entityId: args.page._id.toString(),
    ...(args.page.companyId ? { companyId: args.page.companyId } : {}),
    timestamp: now,
    metadata: JSON.stringify({
      pageKey: linkKeyFor(args.page.kind, args.page.subjectKey),
      rule: args.rule,
      ...(args.detail ? { detail: args.detail.slice(0, 300) } : {}),
      before: args.page.content.slice(0, 400),
      after: content.slice(0, 400),
    }),
  });
  return true;
}

/**
 * A fix the check-up decided on: the page's new words, and the rule that
 * decided it. Pinned corrections are a separate layer and are never touched.
 */
export const applyCheckupFixInternal = internalMutation({
  args: {
    companyId: v.optional(v.id("companies")),
    pageId: v.id("wikiPages"),
    content: v.string(),
    rule: v.string(),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const page = await requireScopedPage(ctx, args.companyId, args.pageId);
    if (!page || page.kind === "SOURCE" || page.kind === "GOAL") return false;
    return await rewritePage(ctx, {
      page,
      content: args.content,
      source: `CHECKUP:${args.rule}`,
      rule: args.rule,
      ...(args.detail ? { detail: args.detail } : {}),
    });
  },
});

/**
 * The note an unsettled disagreement leaves: added once, in code, never by
 * the model. The page may run a little over its usual length to carry it —
 * dropping a fact to make room would be worse.
 */
export const appendDisagreeNoteInternal = internalMutation({
  args: {
    companyId: v.optional(v.id("companies")),
    pageId: v.id("wikiPages"),
    note: v.string(),
    otherPage: v.string(),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const page = await requireScopedPage(ctx, args.companyId, args.pageId);
    if (!page || page.kind === "SOURCE" || page.kind === "GOAL") return false;
    if (hasDisagreeNote(page.content, args.otherPage)) return false;
    return await rewritePage(ctx, {
      page,
      content: `${page.content.trim()}\n\n${args.note}`,
      source: "CHECKUP:UNSETTLED",
      rule: "UNSETTLED",
      detail: args.note,
      maxChars: WIKI_PAGE_MAX_CHARS + 800,
    });
  },
});

/** Take a page's key out of every page it links to (links are kept both ways). */
async function unlinkEverywhere(ctx: MutationCtx, page: Doc<"wikiPages">, replaceWith?: string) {
  const key = linkKeyFor(page.kind, page.subjectKey);
  for (const link of page.links) {
    const neighbour = await pageByKey(ctx, page.companyId, link);
    if (!neighbour || neighbour._id === page._id || !neighbour.links.includes(key)) continue;
    const next = neighbour.links.filter((entry) => entry !== key);
    if (replaceWith && replaceWith !== linkKeyFor(neighbour.kind, neighbour.subjectKey) && !next.includes(replaceWith)) {
      next.push(replaceWith);
    }
    await ctx.db.patch(neighbour._id, { links: next });
  }
}

async function deleteTagsFor(ctx: MutationCtx, pageId: Id<"wikiPages">) {
  const tags = await ctx.db
    .query("wikiPageTags")
    .withIndex("by_page", (q) => q.eq("pageId", pageId))
    .take(50);
  for (const tag of tags) await ctx.db.delete(tag._id);
}

/** Remove a page no source backs any more, with its links, receipts and tags. */
export const removePageInternal = internalMutation({
  args: { companyId: v.optional(v.id("companies")), pageId: v.id("wikiPages"), reason: v.string() },
  handler: async (ctx, args): Promise<boolean> => {
    const page = await requireScopedPage(ctx, args.companyId, args.pageId);
    if (!page || page.kind === "GOAL" || page.pinnedCorrections.length > 0) return false;
    await unlinkEverywhere(ctx, page);
    const receipts = await ctx.db
      .query("wikiPageSources")
      .withIndex("by_page", (q) => q.eq("pageId", page._id))
      .take(500);
    for (const receipt of receipts) await ctx.db.delete(receipt._id);
    await deleteTagsFor(ctx, page._id);
    await ctx.db.delete(page._id);
    await ctx.db.insert("auditLogs", {
      actionType: "WIKI_CHECKUP_PAGE_REMOVED",
      entityType: "wikiPages",
      entityId: page._id.toString(),
      ...(page.companyId ? { companyId: page.companyId } : {}),
      timestamp: Date.now(),
      metadata: JSON.stringify({
        pageKey: linkKeyFor(page.kind, page.subjectKey),
        reason: args.reason.slice(0, 200),
        content: page.content.slice(0, 1000),
      }),
    });
    return true;
  },
});

/**
 * Fold one page into another: the kept page takes the merged words, every
 * receipt, pin, tag and link of the other, and every page that pointed at
 * the other now points at the kept one. The other page is then removed.
 */
async function mergeInto(
  ctx: MutationCtx,
  args: { keep: Doc<"wikiPages">; drop: Doc<"wikiPages">; content: string; rule: string }
): Promise<void> {
  const { keep, drop } = args;
  const keepKey = linkKeyFor(keep.kind, keep.subjectKey);
  const dropKey = linkKeyFor(drop.kind, drop.subjectKey);
  await rewritePage(ctx, { page: keep, content: args.content, source: `CHECKUP:${args.rule}`, rule: args.rule, detail: `Merged ${dropKey} into this page.` });

  // Receipts follow, once per source.
  const receipts = await ctx.db
    .query("wikiPageSources")
    .withIndex("by_page", (q) => q.eq("pageId", drop._id))
    .take(500);
  let documentReceipts = 0;
  for (const receipt of receipts) {
    const existing = await ctx.db
      .query("wikiPageSources")
      .withIndex("by_page_ref", (q) => q.eq("pageId", keep._id).eq("kind", receipt.kind).eq("ref", receipt.ref))
      .unique();
    if (existing) {
      await ctx.db.delete(receipt._id);
    } else {
      await ctx.db.patch(receipt._id, { pageId: keep._id });
      if (receipt.kind === "DOCUMENT") documentReceipts += 1;
    }
  }

  // Tags follow, keeping who added them.
  const dropTags = await ctx.db.query("wikiPageTags").withIndex("by_page", (q) => q.eq("pageId", drop._id)).take(50);
  const keepTags = await ctx.db.query("wikiPageTags").withIndex("by_page", (q) => q.eq("pageId", keep._id)).take(50);
  for (const tag of dropTags) {
    const twin = keepTags.find((row) => row.tag === tag.tag);
    if (twin) {
      if (tag.byHuman && !twin.byHuman) await ctx.db.patch(twin._id, { byHuman: true });
      await ctx.db.delete(tag._id);
    } else {
      await ctx.db.patch(tag._id, { pageId: keep._id });
    }
  }
  const mergedTags = await ctx.db.query("wikiPageTags").withIndex("by_page", (q) => q.eq("pageId", keep._id)).take(50);

  // Links: everything that pointed at the dropped page points at the kept one.
  await unlinkEverywhere(ctx, drop, keepKey);
  const links = [...new Set([...keep.links, ...drop.links])].filter(
    (link) => link !== keepKey && link !== dropKey
  );
  const fresh = await ctx.db.get(keep._id);
  if (fresh) {
    await ctx.db.patch(keep._id, {
      links,
      pinnedCorrections: [...fresh.pinnedCorrections, ...drop.pinnedCorrections],
      documentSourceCount: (fresh.documentSourceCount ?? 0) + documentReceipts,
      tags: mergedTags.map((row) => row.tag),
    });
  }
  await ctx.db.delete(drop._id);
  await ctx.db.insert("auditLogs", {
    actionType: "WIKI_CHECKUP_MERGE",
    entityType: "wikiPages",
    entityId: keep._id.toString(),
    ...(keep.companyId ? { companyId: keep.companyId } : {}),
    timestamp: Date.now(),
    metadata: JSON.stringify({ kept: keepKey, merged: dropKey, rule: args.rule, mergedContent: drop.content.slice(0, 1000) }),
  });
}

export const mergePagesInternal = internalMutation({
  args: {
    companyId: v.optional(v.id("companies")),
    keepPageId: v.id("wikiPages"),
    dropPageId: v.id("wikiPages"),
    content: v.string(),
    rule: v.string(),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const keep = await requireScopedPage(ctx, args.companyId, args.keepPageId);
    const drop = await requireScopedPage(ctx, args.companyId, args.dropPageId);
    if (!keep || !drop || keep._id === drop._id) return false;
    // Goals are people's own intent and source notes are whole documents:
    // neither is ever merged away.
    if (drop.kind === "GOAL" || drop.kind === "SOURCE" || keep.kind === "SOURCE") return false;
    await mergeInto(ctx, { keep, drop, content: args.content, rule: args.rule });
    return true;
  },
});

/**
 * Move a page to its right type. Its name stays, so every [[reference]] in
 * other pages' words still resolves; every recorded link is re-pointed. If a
 * page of that name already exists under the right type, nothing moves and
 * the caller is told, so it can merge the two instead.
 */
export const movePageKindInternal = internalMutation({
  args: {
    companyId: v.optional(v.id("companies")),
    pageId: v.id("wikiPages"),
    toKind: v.union(v.literal("PRODUCT"), v.literal("POLICY"), v.literal("ISSUE"), v.literal("CLIENT")),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ moved: boolean; conflictPageId: Id<"wikiPages"> | null }> => {
    const page = await requireScopedPage(ctx, args.companyId, args.pageId);
    if (!page || page.kind === args.toKind) return { moved: false, conflictPageId: null };
    if (page.kind !== "PRODUCT" && page.kind !== "POLICY" && page.kind !== "ISSUE") {
      return { moved: false, conflictPageId: null };
    }
    const target = await pageByKey(ctx, args.companyId, linkKeyFor(args.toKind, page.subjectKey));
    if (target) return { moved: false, conflictPageId: target._id };
    const oldKey = linkKeyFor(page.kind, page.subjectKey);
    const newKey = linkKeyFor(args.toKind, page.subjectKey);
    await unlinkEverywhere(ctx, page, newKey);
    await ctx.db.patch(page._id, { kind: args.toKind, updatedAt: Date.now() });
    await ctx.db.insert("auditLogs", {
      actionType: "WIKI_CHECKUP_REFILED",
      entityType: "wikiPages",
      entityId: page._id.toString(),
      ...(page.companyId ? { companyId: page.companyId } : {}),
      timestamp: Date.now(),
      metadata: JSON.stringify({ from: oldKey, to: newKey }),
    });
    return { moved: true, conflictPageId: null };
  },
});

// ---------------------------------------------------------------------------
// Undo: put an earlier version of a page back.
// ---------------------------------------------------------------------------

async function restoreRevision(
  ctx: MutationCtx,
  args: { companyId: WikiScope; userId: Id<"users">; revisionId: Id<"wikiPageRevisions"> }
): Promise<void> {
  const revision = await ctx.db.get(args.revisionId);
  if (!revision || revision.companyId !== args.companyId) throw appError("NOT_FOUND", "That version could not be found.");
  const page = await requireScopedPage(ctx, args.companyId, revision.pageId);
  if (!page) throw appError("NOT_FOUND", "Page not found.");
  if (revision.content === page.content) return;
  const now = Date.now();
  const source = `HUMAN:${args.userId}`;
  await ctx.db.insert("wikiPageRevisions", {
    pageId: page._id,
    companyId: page.companyId,
    content: page.content,
    source,
    createdAt: now,
  });
  await ctx.db.patch(page._id, {
    content: revision.content,
    searchText: buildWikiSearchText({ title: page.title, subjectKey: page.subjectKey, content: revision.content }),
    lastRewriteSource: source,
    updatedAt: now,
  });
  await ctx.db.insert("auditLogs", {
    actorId: args.userId,
    actionType: "WIKI_PAGE_RESTORED",
    entityType: "wikiPages",
    entityId: page._id.toString(),
    ...(page.companyId ? { companyId: page.companyId } : {}),
    timestamp: now,
    metadata: JSON.stringify({ revisionId: revision._id, restoredFrom: revision.createdAt }),
  });
}

export const restoreRevisionForCompany = adminMutation({
  args: { companyId: v.id("companies"), revisionId: v.id("wikiPageRevisions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertAdminCanAccessCompany(ctx.user, args.companyId, "Unauthorized Access");
    await restoreRevision(ctx, { companyId: args.companyId, userId: ctx.userId, revisionId: args.revisionId });
    return null;
  },
});

export const restoreRevisionForGlobal = adminMutation({
  args: { revisionId: v.id("wikiPageRevisions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (ctx.user.role !== "SUPER_ADMIN") throw appError("UNAUTHORIZED", "Unauthorized access to the platform wiki");
    await restoreRevision(ctx, { companyId: undefined, userId: ctx.userId, revisionId: args.revisionId });
    return null;
  },
});

// ---------------------------------------------------------------------------
// Tags (wiki-daily-checkup-plan.md, section 4).
// ---------------------------------------------------------------------------

async function refreshTagCache(ctx: MutationCtx, pageId: Id<"wikiPages">): Promise<string[]> {
  const rows = await ctx.db.query("wikiPageTags").withIndex("by_page", (q) => q.eq("pageId", pageId)).take(50);
  const tags = rows.map((row) => row.tag).sort();
  await ctx.db.patch(pageId, { tags });
  return tags;
}

/**
 * The machine's tags for a page: its own earlier tags are replaced, a
 * person's are never touched. Returns how many tags changed.
 */
export const setMachineTagsInternal = internalMutation({
  args: { companyId: v.optional(v.id("companies")), pageId: v.id("wikiPages"), tags: v.array(v.string()) },
  handler: async (ctx, args): Promise<number> => {
    const page = await requireScopedPage(ctx, args.companyId, args.pageId);
    if (!page) return 0;
    const rows = await ctx.db.query("wikiPageTags").withIndex("by_page", (q) => q.eq("pageId", page._id)).take(50);
    const human = rows.filter((row) => row.byHuman).map((row) => row.tag);
    const wanted = new Set(
      args.tags
        .map((tag) => normaliseTag(tag))
        .filter((tag): tag is string => tag !== null && !human.includes(tag))
        .slice(0, Math.max(0, WIKI_MAX_TAGS_PER_PAGE - human.length))
    );
    let changed = 0;
    for (const row of rows) {
      if (row.byHuman) continue;
      if (wanted.has(row.tag)) {
        wanted.delete(row.tag);
      } else {
        await ctx.db.delete(row._id);
        changed += 1;
      }
    }
    for (const tag of wanted) {
      await ctx.db.insert("wikiPageTags", { companyId: page.companyId, pageId: page._id, tag, byHuman: false, addedAt: Date.now() });
      changed += 1;
    }
    await refreshTagCache(ctx, page._id);
    return changed;
  },
});

/** The most tag rows read for one wiki's tag counts. */
const WIKI_TAG_ROWS_READ = 8_000;
/** The most website pages looked at for one night's re-reads. */
const WIKI_WEBSITE_PAGES_READ = 2_000;

/** How often each tag is used in one wiki, for the vocabulary and the filter. */
async function tagUsage(ctx: QueryCtx, companyId: WikiScope): Promise<Array<{ tag: string; count: number }>> {
  const rows = await ctx.db
    .query("wikiPageTags")
    .withIndex("by_company_tag", (q) => q.eq("companyId", companyId))
    .take(WIKI_TAG_ROWS_READ + 1);
  // Past the cap each count is "at least": the rarest tags may be missing from the vocabulary.
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.tag, (counts.get(row.tag) ?? 0) + 1);
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag));
}

export const listTagUsageInternal = internalQuery({
  args: { companyId: v.optional(v.id("companies")) },
  handler: async (ctx, args) => await tagUsage(ctx, args.companyId),
});

/**
 * Fold one tag's spelling into another across a wiki: "refunds" becomes
 * "refund". A page that already has the target keeps one row; a person's
 * mark survives the fold.
 */
export const renameTagInternal = internalMutation({
  args: { companyId: v.optional(v.id("companies")), from: v.string(), to: v.string() },
  handler: async (ctx, args): Promise<number> => {
    if (args.from === args.to) return 0;
    const rows = await ctx.db
      .query("wikiPageTags")
      .withIndex("by_company_tag", (q) => q.eq("companyId", args.companyId).eq("tag", args.from))
      .take(500);
    let changed = 0;
    for (const row of rows) {
      const twin = await ctx.db
        .query("wikiPageTags")
        .withIndex("by_page", (q) => q.eq("pageId", row.pageId))
        .take(50)
        .then((tags) => tags.find((tag) => tag.tag === args.to));
      if (twin) {
        if (row.byHuman && !twin.byHuman) await ctx.db.patch(twin._id, { byHuman: true });
        await ctx.db.delete(row._id);
      } else {
        await ctx.db.patch(row._id, { tag: args.to });
      }
      await refreshTagCache(ctx, row.pageId);
      changed += 1;
    }
    return changed;
  },
});

const tagUsageShape = v.array(v.object({ tag: v.string(), count: v.number() }));

export const listTagsForCompany = adminQuery({
  args: { companyId: v.id("companies") },
  returns: tagUsageShape,
  handler: async (ctx, args) => {
    assertAdminCanAccessCompany(ctx.user, args.companyId, "Unauthorized Access");
    return await tagUsage(ctx, args.companyId);
  },
});

export const listTagsForGlobal = adminQuery({
  args: {},
  returns: tagUsageShape,
  handler: async (ctx) => {
    if (ctx.user.role !== "SUPER_ADMIN" && ctx.user.role !== "READ_ONLY") {
      throw appError("UNAUTHORIZED", "Unauthorized access to the platform wiki");
    }
    return await tagUsage(ctx, undefined);
  },
});

async function addHumanTag(ctx: MutationCtx, args: { companyId: WikiScope; userId: Id<"users">; pageId: Id<"wikiPages">; tag: string }) {
  const page = await requireScopedPage(ctx, args.companyId, args.pageId);
  if (!page) throw appError("NOT_FOUND", "Page not found.");
  const tag = normaliseTag(args.tag);
  if (!tag) throw appError("INVALID_INPUT", "A tag needs at least two letters or numbers.");
  const rows = await ctx.db.query("wikiPageTags").withIndex("by_page", (q) => q.eq("pageId", page._id)).take(50);
  const existing = rows.find((row) => row.tag === tag);
  if (existing) {
    if (!existing.byHuman) await ctx.db.patch(existing._id, { byHuman: true });
  } else {
    if (rows.filter((row) => row.byHuman).length >= WIKI_MAX_TAGS_PER_PAGE) {
      throw appError("INVALID_INPUT", `A page can carry at most ${WIKI_MAX_TAGS_PER_PAGE} tags.`);
    }
    // A person's tag takes priority: a machine tag makes room for it.
    if (rows.length >= WIKI_MAX_TAGS_PER_PAGE) {
      const machine = rows.filter((row) => !row.byHuman).sort((left, right) => left.addedAt - right.addedAt)[0];
      if (machine) await ctx.db.delete(machine._id);
    }
    await ctx.db.insert("wikiPageTags", { companyId: page.companyId, pageId: page._id, tag, byHuman: true, addedAt: Date.now() });
  }
  await refreshTagCache(ctx, page._id);
  await ctx.db.insert("auditLogs", {
    actorId: args.userId,
    actionType: "WIKI_TAG_ADDED",
    entityType: "wikiPages",
    entityId: page._id.toString(),
    ...(page.companyId ? { companyId: page.companyId } : {}),
    timestamp: Date.now(),
    metadata: JSON.stringify({ tag }),
  });
}

async function removeTag(ctx: MutationCtx, args: { companyId: WikiScope; userId: Id<"users">; pageId: Id<"wikiPages">; tag: string }) {
  const page = await requireScopedPage(ctx, args.companyId, args.pageId);
  if (!page) throw appError("NOT_FOUND", "Page not found.");
  const rows = await ctx.db.query("wikiPageTags").withIndex("by_page", (q) => q.eq("pageId", page._id)).take(50);
  const row = rows.find((candidate) => candidate.tag === args.tag);
  if (!row) return;
  await ctx.db.delete(row._id);
  await refreshTagCache(ctx, page._id);
  await ctx.db.insert("auditLogs", {
    actorId: args.userId,
    actionType: "WIKI_TAG_REMOVED",
    entityType: "wikiPages",
    entityId: page._id.toString(),
    ...(page.companyId ? { companyId: page.companyId } : {}),
    timestamp: Date.now(),
    metadata: JSON.stringify({ tag: args.tag }),
  });
}

export const addTagForCompany = adminMutation({
  args: { companyId: v.id("companies"), pageId: v.id("wikiPages"), tag: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertAdminCanAccessCompany(ctx.user, args.companyId, "Unauthorized Access");
    await addHumanTag(ctx, { ...args, userId: ctx.userId });
    return null;
  },
});

export const addTagForGlobal = adminMutation({
  args: { pageId: v.id("wikiPages"), tag: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (ctx.user.role !== "SUPER_ADMIN") throw appError("UNAUTHORIZED", "Unauthorized access to the platform wiki");
    await addHumanTag(ctx, { ...args, companyId: undefined, userId: ctx.userId });
    return null;
  },
});

export const removeTagForCompany = adminMutation({
  args: { companyId: v.id("companies"), pageId: v.id("wikiPages"), tag: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertAdminCanAccessCompany(ctx.user, args.companyId, "Unauthorized Access");
    await removeTag(ctx, { ...args, userId: ctx.userId });
    return null;
  },
});

export const removeTagForGlobal = adminMutation({
  args: { pageId: v.id("wikiPages"), tag: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (ctx.user.role !== "SUPER_ADMIN") throw appError("UNAUTHORIZED", "Unauthorized access to the platform wiki");
    await removeTag(ctx, { ...args, companyId: undefined, userId: ctx.userId });
    return null;
  },
});

// ---------------------------------------------------------------------------
// Following a changed or removed file.
// ---------------------------------------------------------------------------

/**
 * Record that a document changed or was removed, with the pages it taught.
 * Shared by the document's own delete (a mutation) and the refresh hook.
 */
export async function recordSourceChange(
  ctx: MutationCtx,
  args: {
    companyId: WikiScope;
    documentId: string;
    kind: "CHANGED" | "REMOVED";
    title: string;
    oldContent: string;
    newContent?: string;
  }
): Promise<boolean> {
  const receipts = await ctx.db
    .query("wikiPageSources")
    .withIndex("by_company_ref", (q) =>
      q.eq("companyId", args.companyId).eq("kind", "DOCUMENT").eq("ref", args.documentId)
    )
    .take(200);
  const pageIds: Array<Id<"wikiPages">> = [];
  for (const receipt of receipts) {
    const page = await ctx.db.get(receipt.pageId);
    if (!page || page.kind === "SOURCE" || pageIds.includes(page._id)) continue;
    pageIds.push(page._id);
  }
  if (pageIds.length === 0) return false;
  await ctx.db.insert("wikiSourceChanges", {
    ...(args.companyId ? { companyId: args.companyId } : {}),
    documentId: args.documentId,
    kind: args.kind,
    title: args.title.slice(0, 200),
    oldContent: args.oldContent.slice(0, WIKI_DISTILL_TEXT_MAX_CHARS),
    ...(args.newContent !== undefined ? { newContent: args.newContent.slice(0, WIKI_DISTILL_TEXT_MAX_CHARS) } : {}),
    pageIds,
    status: "PENDING",
    attempts: 0,
    createdAt: Date.now(),
  });
  await ctx.scheduler.runAfter(0, internal.wikiCheckupActions.processSourceChanges, {
    ...(args.companyId ? { companyId: args.companyId } : {}),
  });
  return true;
}

/**
 * A document deleted from the library leaves the wiki the same moment.
 *
 * Its own source page goes, receipts and tags included — deleting a file
 * used to leave its source page standing, describing a document that no
 * longer existed (Anthony, 2026-08-20). And what it taught leaves the topic
 * pages it fed: its words are kept on the change record, because they are
 * gone once the delete commits, and those pages are rewritten from the
 * sources that are left (wiki-daily-checkup-plan.md, "a file removed").
 */
export async function removeDocumentFromWiki(
  ctx: MutationCtx,
  args: { companyId: WikiScope; documentId: Id<"knowledgeDocuments">; title: string; text?: string }
): Promise<void> {
  const sourcePage = await ctx.db
    .query("wikiPages")
    .withIndex("by_company_kind_subject", (q) =>
      q.eq("companyId", args.companyId).eq("kind", "SOURCE").eq("subjectKey", args.documentId)
    )
    .first();
  // The whole document, read while it is still filed (2026-11-12): the
  // source note keeps only its first 24,000 characters, so what a long
  // file taught further in could never be found again to take out.
  const document = await ctx.db.get(args.documentId);
  const fullText = args.text?.trim() || (document ? (await documentFullText(ctx, document)).trim() : "");
  await recordSourceChange(ctx, {
    companyId: args.companyId,
    documentId: args.documentId,
    kind: "REMOVED",
    title: args.title,
    oldContent: fullText || sourcePage?.content || "",
  });
  if (!sourcePage) return;
  const receipts = await ctx.db
    .query("wikiPageSources")
    .withIndex("by_page", (q) => q.eq("pageId", sourcePage._id))
    .take(500);
  for (const receipt of receipts) await ctx.db.delete(receipt._id);
  await deleteTagsFor(ctx, sourcePage._id);
  await ctx.db.delete(sourcePage._id);
}

export const recordSourceChangeInternal = internalMutation({
  args: {
    companyId: v.optional(v.id("companies")),
    documentId: v.string(),
    kind: v.union(v.literal("CHANGED"), v.literal("REMOVED")),
    title: v.string(),
    oldContent: v.string(),
    newContent: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<boolean> =>
    await recordSourceChange(ctx, { ...args, companyId: args.companyId }),
});

export const listPendingSourceChangesInternal = internalQuery({
  args: { companyId: v.optional(v.id("companies")), limit: v.number() },
  handler: async (ctx, args) =>
    await ctx.db
      .query("wikiSourceChanges")
      .withIndex("by_company_status", (q) => q.eq("companyId", args.companyId).eq("status", "PENDING"))
      .take(Math.max(1, Math.min(50, args.limit))),
});

export const settleSourceChangeInternal = internalMutation({
  args: { changeId: v.id("wikiSourceChanges"), ok: v.boolean() },
  handler: async (ctx, args): Promise<void> => {
    const change = await ctx.db.get(args.changeId);
    if (!change || change.status !== "PENDING") return;
    const attempts = change.attempts + 1;
    if (args.ok || attempts >= 3) {
      await ctx.db.patch(change._id, { status: args.ok ? "DONE" : "FAILED", attempts, doneAt: Date.now() });
    } else {
      await ctx.db.patch(change._id, { attempts });
    }
  },
});

/**
 * Take a removed document's receipt off a page, so the page no longer
 * claims it as a source. Returns what still backs the page.
 */
export const dropDocumentReceiptInternal = internalMutation({
  args: { companyId: v.optional(v.id("companies")), pageId: v.id("wikiPages"), documentId: v.string() },
  handler: async (ctx, args): Promise<{ remainingDocuments: number; remainingOther: number; pinned: boolean } | null> => {
    const page = await requireScopedPage(ctx, args.companyId, args.pageId);
    if (!page) return null;
    const receipts = await ctx.db
      .query("wikiPageSources")
      .withIndex("by_page", (q) => q.eq("pageId", page._id))
      .take(500);
    let removed = 0;
    let remainingDocuments = 0;
    let remainingOther = 0;
    for (const receipt of receipts) {
      if (receipt.kind === "DOCUMENT" && receipt.ref === args.documentId) {
        await ctx.db.delete(receipt._id);
        removed += 1;
      } else if (receipt.kind === "DOCUMENT") {
        remainingDocuments += 1;
      } else {
        remainingOther += 1;
      }
    }
    if (removed > 0) {
      await ctx.db.patch(page._id, { documentSourceCount: Math.max(0, (page.documentSourceCount ?? 0) - removed) });
    }
    // A person who edited the page by hand vouched for it: that counts as
    // something still backing it.
    const humanTouched = page.lastRewriteSource.startsWith("HUMAN:");
    return {
      remainingDocuments,
      remainingOther: remainingOther + (humanTouched ? 1 : 0),
      pinned: page.pinnedCorrections.length > 0,
    };
  },
});

// ---------------------------------------------------------------------------
// Monthly website re-reads and web look-ups (section 7).
// ---------------------------------------------------------------------------

/**
 * Website pages not re-read for a month go back in the reading queue, a
 * bounded number a night. The re-read lands through the ordinary import,
 * and a changed page then updates what it taught.
 */
export const queueWebsiteRereadsInternal = internalMutation({
  args: { companyId: v.optional(v.id("companies")), limit: v.number() },
  handler: async (ctx, args): Promise<number> => {
    const now = Date.now();
    const rows = await ctx.db
      .query("knowledgeDocuments")
      .withIndex("by_company_format", (q) => q.eq("companyId", args.companyId).eq("format", "url"))
      .take(WIKI_WEBSITE_PAGES_READ + 1);
    if (rows.length > WIKI_WEBSITE_PAGES_READ) console.error(`Website re-reads looked at the first ${WIKI_WEBSITE_PAGES_READ} pages only`);
    let queued = 0;
    for (const document of rows) {
      if (queued >= args.limit) break;
      if (document.threadId || document.agentId || !document.sourceUrl) continue;
      if (document.status !== "ready") continue;
      const lastRead = Math.max(document.lastQueuedAt ?? 0, document.lastIngestedAt ?? 0, document.createdAt);
      if (now - lastRead < WIKI_WEBSITE_REREAD_MS) continue;
      await ctx.db.patch(document._id, { status: "pending", lastQueuedAt: now, lastIngestionError: undefined });
      queued += 1;
    }
    if (queued > 0) await ctx.scheduler.runAfter(0, internal.knowledgeActions.processWebsiteQueue);
    return queued;
  },
});

