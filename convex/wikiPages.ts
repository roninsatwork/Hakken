import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { adminMutation, adminQuery, moduleQuery } from "./tenantFunctions";
import { CORE_MODULES } from "./utils/coreModules";
import { assertAdminCanAccessCompany, getActiveCompanyId } from "./authz";
import {
  WIKI_PAGE_MAX_CHARS,
  extractWikiLinkSlugs,
  linkKeyFor,
  normaliseEmail,
  parseSourceKey,
  renderPageForReading,
} from "./wikiRewriteService";
import { normalisePhoneNumber } from "./telephonyService";

const wikiKindValidator = v.union(
  v.literal("CUSTOMER"),
  v.literal("PRODUCT"),
  v.literal("POLICY"),
  v.literal("ISSUE"),
  v.literal("SOURCE")
);

type WikiKind = "CUSTOMER" | "PRODUCT" | "POLICY" | "ISSUE" | "SOURCE";

/** A brain to read or write: a company's, or (absent) the global shelf. */
type WikiScope = Id<"companies"> | undefined;

/** A source note keeps a document substantially intact — far above the
 * briefing-note cap, and never sent through a model. */
export const WIKI_SOURCE_NOTE_MAX_CHARS = 24_000;

async function getPage(
  ctx: QueryCtx,
  companyId: WikiScope,
  kind: WikiKind,
  subjectKey: string
): Promise<Doc<"wikiPages"> | null> {
  return await ctx.db
    .query("wikiPages")
    .withIndex("by_company_kind_subject", (q) =>
      q.eq("companyId", companyId).eq("kind", kind).eq("subjectKey", subjectKey)
    )
    .unique();
}

/**
 * A page rendered with its neighbourhood (wiki plan, phase 5): the page
 * whole, then up to two linked pages whole — one hop, wiki-fashion. More
 * than that is a crawl, not a briefing.
 */
async function renderWithNeighbours(ctx: QueryCtx, page: Doc<"wikiPages">): Promise<string> {
  const parts = [renderPageForReading(page)];
  for (const link of page.links.slice(0, 2)) {
    const separator = link.indexOf(":");
    if (separator <= 0) continue;
    const kind = link.slice(0, separator) as WikiKind;
    const neighbour = await getPage(ctx, page.companyId, kind, link.slice(separator + 1));
    if (neighbour) parts.push(`Related page — ${renderPageForReading(neighbour)}`);
  }
  return parts.join("\n\n");
}

/**
 * The wiki's doors below the surface: what the rewrite loop and the reading
 * doors use. Everything here is internal — the admin screens (wiki plan,
 * phase 3) get their own tenant-scoped doors.
 *
 * Two rules hold everywhere (self-improving-wiki-plan.md, acceptance 3-4):
 * a rewrite never touches `pinnedCorrections` — that field belongs to
 * people — and every change writes both a revision (the text as it stood)
 * and an audit row (who or what changed it, and why).
 */

export const getCustomerPageInternal = internalQuery({
  args: { companyId: v.id("companies"), subjectKey: v.string() },
  handler: async (ctx, args): Promise<Doc<"wikiPages"> | null> => {
    return await getPage(ctx, args.companyId, "CUSTOMER", args.subjectKey);
  },
});

export const getPageOfKindInternal = internalQuery({
  args: { companyId: v.optional(v.id("companies")), kind: wikiKindValidator, subjectKey: v.string() },
  handler: async (ctx, args): Promise<Doc<"wikiPages"> | null> => {
    return await getPage(ctx, args.companyId, args.kind, args.subjectKey);
  },
});

/** The backfill's road from a document to its synthesis pages: every page
 * whose receipts name the document gets linked to its source note, both
 * ways (wiki-agents plan, phase 3). Mechanical and idempotent. */
export const linkSourceNoteToTaughtPagesInternal = internalMutation({
  args: { companyId: v.optional(v.id("companies")), documentId: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const note = await getPage(ctx, args.companyId, "SOURCE", args.documentId);
    if (!note) return;
    const receipts = await ctx.db
      .query("wikiPageSources")
      .withIndex("by_company_ref", (q) =>
        q.eq("companyId", args.companyId).eq("kind", "DOCUMENT").eq("ref", args.documentId)
      )
      .take(100);
    const noteKey = linkKeyFor("SOURCE", args.documentId);
    const taughtKeys: string[] = [];
    for (const receipt of receipts) {
      if (receipt.pageId === note._id) continue;
      const taught = await ctx.db.get(receipt.pageId);
      if (!taught) continue;
      taughtKeys.push(linkKeyFor(taught.kind, taught.subjectKey));
      if (!taught.links.includes(noteKey)) {
        await ctx.db.patch(taught._id, { links: [...taught.links, noteKey] });
      }
    }
    const merged = [...new Set([...note.links, ...taughtKeys])];
    if (merged.length !== note.links.length) {
      await ctx.db.patch(note._id, { links: merged });
    }
  },
});

/** Mechanical bookkeeping after a topic learns from an event: both ends of
 * the link recorded, as a set. The map is drawn from exactly this. */
export const addLinksInternal = internalMutation({
  args: {
    companyId: v.optional(v.id("companies")),
    kind: wikiKindValidator,
    subjectKey: v.string(),
    add: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    const page = await getPage(ctx, args.companyId, args.kind, args.subjectKey);
    if (!page) return;
    const links = [...new Set([...page.links, ...args.add])];
    if (links.length !== page.links.length) {
      await ctx.db.patch(page._id, { links });
    }
  },
});

/**
 * The title index (wiki plan, phase 5): topic pages matched by the words in
 * their names — a mechanical lookup, no embeddings, exactly how a person
 * scans a wiki's index. CUSTOMER pages are deliberately excluded: an
 * anonymous caller must never be read another customer's page.
 */
export const findTopicPagesForQueryInternal = internalQuery({
  args: { companyId: v.optional(v.id("companies")), query: v.string() },
  handler: async (ctx, args): Promise<string[]> => {
    const queryWords = new Set(
      args.query
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length >= 4)
    );
    if (queryWords.size === 0) return [];
    const pages = await ctx.db
      .query("wikiPages")
      .withIndex("by_company_updated", (q) => q.eq("companyId", args.companyId))
      .take(500);
    return pages
      .filter((page) => page.kind !== "CUSTOMER")
      .map((page) => {
        const titleWords = `${page.title} ${page.subjectKey}`
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((word) => word.length >= 4);
        const overlap = titleWords.filter((word) => queryWords.has(word)).length;
        return { page, overlap };
      })
      .filter((entry) => entry.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap)
      .slice(0, 2)
      .map((entry) => renderPageForReading(entry.page));
  },
});

/**
 * The answering read (wiki-replaces-knowledge plan, stage two): how a
 * question finds its pages. The index is scanned the way a person scans a
 * wiki — names first, then the words on the pages — the best few pages are
 * opened WHOLE, and one hop is taken along the best page's links. No
 * embeddings anywhere. Customer pages join only for signed-in company
 * surfaces; an anonymous caller can never pull another customer's page.
 */
export const getWikiAnswerContextInternal = internalQuery({
  args: {
    companyId: v.optional(v.id("companies")),
    query: v.string(),
    includeCustomerPages: v.boolean(),
    maxChars: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ context: string; pageKeys: string[] }> => {
    const budget = args.maxChars ?? 14_000;
    // Three letters admits SEO, iOS, app; the rarity weight below keeps the
    // company's own name from lighting up every page equally.
    const queryWords = [
      ...new Set(
        args.query
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((word) => word.length >= 3)
      ),
    ];
    if (queryWords.length === 0) return { context: "", pageKeys: [] };

    const pages = await ctx.db
      .query("wikiPages")
      .withIndex("by_company_updated", (q) => q.eq("companyId", args.companyId))
      .take(500);
    const eligible = pages.filter(
      (page) => args.includeCustomerPages || page.kind !== "CUSTOMER"
    );

    // A word on every page tells you nothing; a word on one page is the page.
    const rarity = new Map<string, number>();
    for (const word of queryWords) {
      const holders = eligible.filter((page) =>
        `${page.title} ${page.subjectKey} ${page.content}`.toLowerCase().includes(word)
      ).length;
      rarity.set(word, holders === 0 ? 0 : 1 / Math.log2(2 + holders));
    }

    const scored = eligible
      .map((page) => {
        const titleText = `${page.title} ${page.subjectKey}`.toLowerCase();
        const content = page.content.toLowerCase();
        let score = 0;
        for (const word of queryWords) {
          const weight = rarity.get(word) ?? 0;
          if (weight === 0) continue;
          if (titleText.includes(word)) score += 3 * weight;
          else if (content.includes(word)) score += weight;
        }
        return { page, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) return { context: "", pageKeys: [] };

    const chosen: typeof pages = [];
    const chosenKeys = new Set<string>();
    const admit = (page: (typeof pages)[number]) => {
      const key = linkKeyFor(page.kind, page.subjectKey);
      if (chosenKeys.has(key)) return;
      chosenKeys.add(key);
      chosen.push(page);
    };
    for (const entry of scored.slice(0, 4)) admit(entry.page);
    // One hop along the best page's links, wiki-fashion.
    for (const link of scored[0].page.links.slice(0, 2)) {
      const separator = link.indexOf(":");
      if (separator <= 0) continue;
      const kind = link.slice(0, separator) as WikiKind;
      if (kind === "CUSTOMER" && !args.includeCustomerPages) continue;
      const neighbour = await getPage(ctx, args.companyId, kind, link.slice(separator + 1));
      if (neighbour) admit(neighbour);
    }

    const parts: string[] = [];
    const pageKeys: string[] = [];
    let used = 0;
    for (const page of chosen) {
      const rendered = renderPageForReading(page);
      if (used + rendered.length > budget && parts.length > 0) break;
      parts.push(rendered);
      pageKeys.push(linkKeyFor(page.kind, page.subjectKey));
      used += rendered.length;
    }
    return {
      context: parts.length
        ? `${
            args.companyId
              ? "Company wiki pages that apply here (tended by the AI, corrected by staff)"
              : "Platform wiki pages that apply to every company (tended by the AI)"
          }:\n\n${parts.join("\n\n---\n\n")}`
        : "",
      pageKeys,
    };
  },
});

/**
 * The index as a model reads it (wiki-replaces-knowledge, stage two): every
 * page's name and first line, small enough to hand to a fast model whole —
 * exactly how Karpathy's agent chooses pages. Customer pages appear only
 * for surfaces allowed to see them; source notes only for readers that
 * want fine print (the answer chooser yes, the prose weaver no).
 */
export const getWikiIndexInternal = internalQuery({
  args: {
    companyId: v.optional(v.id("companies")),
    includeCustomerPages: v.boolean(),
    includeSourceNotes: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args
  ): Promise<Array<{ key: string; title: string; hint: string }>> => {
    const pages = await ctx.db
      .query("wikiPages")
      .withIndex("by_company_updated", (q) => q.eq("companyId", args.companyId))
      .take(800);
    return pages
      .filter((page) => args.includeCustomerPages || page.kind !== "CUSTOMER")
      .filter((page) => (args.includeSourceNotes ?? false) || page.kind !== "SOURCE")
      .map((page) => ({
        key: linkKeyFor(page.kind, page.subjectKey),
        title: page.title,
        hint: page.content.slice(0, 90).replace(/\s+/g, " "),
      }));
  },
});

/**
 * Full import first (wiki-agents plan, phase 3): one wiki note per
 * document, substantially intact — mechanical, revisioned when the
 * document changes, receipted to the document it mirrors, and never
 * touched by a model. The synthesis pages stand on this layer.
 */
export const upsertSourceNoteInternal = internalMutation({
  args: {
    companyId: v.optional(v.id("companies")),
    documentId: v.string(),
    title: v.string(),
    text: v.string(),
    sourceLabel: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const now = Date.now();
    const content = args.text.slice(0, WIKI_SOURCE_NOTE_MAX_CHARS);
    const source = `DOCUMENT:${args.documentId}`;
    const existing = await getPage(ctx, args.companyId, "SOURCE", args.documentId);
    if (!existing) {
      const pageId = await ctx.db.insert("wikiPages", {
        companyId: args.companyId,
        kind: "SOURCE",
        subjectKey: args.documentId,
        title: args.title,
        content,
        searchText: buildWikiSearchText({
          title: args.title,
          subjectKey: args.documentId,
          content,
        }),
        links: [],
        pinnedCorrections: [],
        rewriteCount: 1,
        lastRewriteSource: source,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("auditLogs", {
        actionType: "WIKI_PAGE_CREATED",
        entityId: pageId.toString(),
        entityType: "wikiPages",
        companyId: args.companyId,
        timestamp: now,
        metadata: JSON.stringify({ subjectKey: args.documentId, source, kind: "SOURCE", chars: content.length }),
      });
      await upsertSourceReceipt(ctx, {
        pageId,
        companyId: args.companyId,
        source,
        sourceLabel: args.sourceLabel,
      });
      return;
    }
    if (existing.content !== content) {
      await ctx.db.insert("wikiPageRevisions", {
        pageId: existing._id,
        companyId: args.companyId,
        content: existing.content,
        source,
        createdAt: now,
      });
      await ctx.db.patch(existing._id, {
        content,
        searchText: buildWikiSearchText({
          title: existing.title,
          subjectKey: existing.subjectKey,
          content,
        }),
        rewriteCount: existing.rewriteCount + 1,
        updatedAt: now,
      });
    }
  },
});

/**
 * What the list's search box looks through: a page's name, its subject key
 * and its text, in one field. Kept in step on every write so the search
 * index is never a stale copy of the page.
 */
export function buildWikiSearchText(args: {
  title: string;
  subjectKey: string;
  content: string;
}) {
  return `${args.title}\n${args.subjectKey}\n${args.content}`.slice(0, 20000);
}


/** The chosen pages, opened whole with one hop from the first — the model's
 * picks validated against the wall before anything is read. */
export const getPagesByKeysInternal = internalQuery({
  args: {
    companyId: v.optional(v.id("companies")),
    keys: v.array(v.string()),
    includeCustomerPages: v.boolean(),
    maxChars: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ context: string; pageKeys: string[] }> => {
    const budget = args.maxChars ?? 14_000;
    const chosen: Doc<"wikiPages">[] = [];
    const chosenKeys = new Set<string>();
    const admit = async (key: string) => {
      if (chosenKeys.has(key)) return;
      const separator = key.indexOf(":");
      if (separator <= 0) return;
      const kind = key.slice(0, separator) as WikiKind;
      if (kind === "CUSTOMER" && !args.includeCustomerPages) return;
      const page = await getPage(ctx, args.companyId, kind, key.slice(separator + 1));
      if (!page) return;
      chosenKeys.add(key);
      chosen.push(page);
    };
    for (const key of args.keys.slice(0, 5)) await admit(key);
    if (chosen.length > 0) {
      // The hop, fine-print-first: the best page's own source note carries
      // the detail the synthesis dropped, so it gets the first seat; one
      // sibling page follows if room remains.
      const hops = [...chosen[0].links].sort((a, b) => {
        const aSource = a.startsWith("SOURCE:") ? 0 : 1;
        const bSource = b.startsWith("SOURCE:") ? 0 : 1;
        return aSource - bSource;
      });
      for (const link of hops.slice(0, 2)) await admit(link);
    }

    const parts: string[] = [];
    const pageKeys: string[] = [];
    let used = 0;
    for (const page of chosen) {
      // A source note can be bigger than the whole budget; it is truncated
      // to fit rather than blowing the reading pile open.
      const rendered = renderPageForReading(page).slice(0, budget);
      if (used + rendered.length > budget && parts.length > 0) break;
      parts.push(rendered);
      pageKeys.push(linkKeyFor(page.kind, page.subjectKey));
      used += rendered.length;
    }
    return {
      context: parts.length
        ? `${
            args.companyId
              ? "Company wiki pages that apply here (tended by the AI, corrected by staff)"
              : "Platform wiki pages that apply to every company (tended by the AI)"
          }:\n\n${parts.join("\n\n---\n\n")}`
        : "",
      pageKeys,
    };
  },
});

/** Whether the global brain holds anything yet — the content-carried
 * cutover switch (global-wiki-plan.md, phase 2): while this is false, the
 * old global chunk search still serves; the first global page retires it. */
export const hasGlobalWikiPagesInternal = internalQuery({
  args: {},
  handler: async (ctx): Promise<boolean> => {
    const first = await ctx.db
      .query("wikiPages")
      .withIndex("by_company_updated", (q) => q.eq("companyId", undefined))
      .first();
    return first !== null;
  },
});

/**
 * The [[references]] a page's text makes, resolved to living pages and
 * recorded on BOTH ends (wiki interlinking, Anthony's steer 2026-08-15):
 * the graph is drawn from what the pages actually say, Obsidian-fashion. A
 * reference to a page that does not exist resolves to nothing — no ghost
 * nodes.
 */
async function syncLinksFromContent(
  ctx: MutationCtx,
  page: Doc<"wikiPages">
): Promise<void> {
  const slugs = extractWikiLinkSlugs(page.content);
  const additions: string[] = [];
  for (const slug of slugs.slice(0, 8)) {
    for (const kind of ["PRODUCT", "POLICY", "ISSUE"] as const) {
      const target = await getPage(ctx, page.companyId, kind, slug);
      if (!target) continue;
      const key = linkKeyFor(kind, slug);
      if (key !== linkKeyFor(page.kind, page.subjectKey)) {
        additions.push(key);
        // The other end points back, so the map needs no direction.
        const backKey = linkKeyFor(page.kind, page.subjectKey);
        if (!target.links.includes(backKey)) {
          await ctx.db.patch(target._id, { links: [...target.links, backKey] });
        }
      }
      break;
    }
  }
  if (additions.length > 0) {
    const links = [...new Set([...page.links, ...additions])];
    if (links.length !== page.links.length) {
      await ctx.db.patch(page._id, { links });
    }
  }
}

/**
 * The machine's rewrite landing. Creates the page on first contact;
 * otherwise files the outgoing text as a revision and replaces the body.
 * Never touches the pinned layer.
 */
/**
 * The receipt behind a page (wiki-replaces-knowledge plan, screen 3): the
 * teaching source recorded once per page-and-source pair. Tending carries
 * no colon and HUMAN edits are the audit trail's job — both skipped here.
 */
async function upsertSourceReceipt(
  ctx: MutationCtx,
  args: { pageId: Id<"wikiPages">; companyId: WikiScope; source: string; sourceLabel?: string }
): Promise<void> {
  const parsed = parseSourceKey(args.source);
  if (!parsed || parsed.kind === "HUMAN") return;
  const existing = await ctx.db
    .query("wikiPageSources")
    .withIndex("by_page_ref", (q) =>
      q.eq("pageId", args.pageId).eq("kind", parsed.kind).eq("ref", parsed.ref)
    )
    .unique();
  if (existing) return;
  const fallbackLabels = { DOCUMENT: "Document", PHONE_CALL: "Phone call", EMAIL: "Email", CHAT: "Chat answer" } as const;
  await ctx.db.insert("wikiPageSources", {
    pageId: args.pageId,
    companyId: args.companyId,
    kind: parsed.kind,
    ref: parsed.ref,
    label: args.sourceLabel?.trim() || fallbackLabels[parsed.kind],
    addedAt: Date.now(),
  });
  if (parsed.kind === "DOCUMENT") {
    const page = await ctx.db.get(args.pageId);
    if (page) {
      await ctx.db.patch(args.pageId, {
        documentSourceCount: (page.documentSourceCount ?? 0) + 1,
      });
    }
  }
}

export const applyRewriteInternal = internalMutation({
  args: {
    companyId: v.optional(v.id("companies")),
    subjectKey: v.string(),
    title: v.string(),
    content: v.string(),
    source: v.string(),
    /** What the page's source list shows for this teacher. */
    sourceLabel: v.optional(v.string()),
    /** Absent means CUSTOMER — the phase-1 callers never say. */
    kind: v.optional(wikiKindValidator),
  },
  handler: async (ctx, args): Promise<void> => {
    const kind = args.kind ?? "CUSTOMER";
    const now = Date.now();
    if (!args.companyId && kind === "CUSTOMER") {
      // The global shelf holds nothing company-specific, and customers are
      // the most company-specific thing there is. Refused with a trace, not
      // thrown — a thrown mutation would roll its own audit row back.
      await ctx.db.insert("auditLogs", {
        actionType: "WIKI_PAGE_REFUSED",
        entityId: args.subjectKey,
        entityType: "wikiPages",
        timestamp: now,
        metadata: JSON.stringify({ reason: "CUSTOMER pages cannot exist on the global shelf" }),
      });
      return;
    }
    const content = args.content.slice(0, WIKI_PAGE_MAX_CHARS);
    const existing = await getPage(ctx, args.companyId, kind, args.subjectKey);

    if (!existing) {
      const pageId = await ctx.db.insert("wikiPages", {
        companyId: args.companyId,
        kind,
        subjectKey: args.subjectKey,
        title: args.title,
        content,
        searchText: buildWikiSearchText({
          title: args.title,
          subjectKey: args.subjectKey,
          content,
        }),
        links: [],
        pinnedCorrections: [],
        rewriteCount: 1,
        lastRewriteSource: args.source,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("auditLogs", {
        actionType: "WIKI_PAGE_CREATED",
        entityId: pageId.toString(),
        entityType: "wikiPages",
        companyId: args.companyId,
        timestamp: now,
        metadata: JSON.stringify({ subjectKey: args.subjectKey, source: args.source, chars: content.length }),
      });
      await upsertSourceReceipt(ctx, {
        pageId,
        companyId: args.companyId,
        source: args.source,
        ...(args.sourceLabel ? { sourceLabel: args.sourceLabel } : {}),
      });
      const created = await ctx.db.get(pageId);
      if (created) await syncLinksFromContent(ctx, created);
      return;
    }

    // The unchanged case is a real outcome, not a failure: the model judged
    // the event added nothing. No revision, no audit noise — but the teacher
    // is still a receipt: it looked, and the page already knew.
    if (existing.content === content) {
      await ctx.db.patch(existing._id, { updatedAt: now, lastRewriteSource: args.source });
      await upsertSourceReceipt(ctx, {
        pageId: existing._id,
        companyId: args.companyId,
        source: args.source,
        ...(args.sourceLabel ? { sourceLabel: args.sourceLabel } : {}),
      });
      return;
    }

    await ctx.db.insert("wikiPageRevisions", {
      pageId: existing._id,
      companyId: args.companyId,
      content: existing.content,
      source: args.source,
      createdAt: now,
    });
    await ctx.db.patch(existing._id, {
      content,
      rewriteCount: existing.rewriteCount + 1,
      lastRewriteSource: args.source,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actionType: "WIKI_PAGE_REWRITE",
      entityId: existing._id.toString(),
      entityType: "wikiPages",
      companyId: args.companyId,
      timestamp: now,
      metadata: JSON.stringify({
        subjectKey: args.subjectKey,
        source: args.source,
        beforeChars: existing.content.length,
        afterChars: content.length,
      }),
    });
    await upsertSourceReceipt(ctx, {
      pageId: existing._id,
      companyId: args.companyId,
      source: args.source,
      ...(args.sourceLabel ? { sourceLabel: args.sourceLabel } : {}),
    });
    const rewritten = await ctx.db.get(existing._id);
    if (rewritten) await syncLinksFromContent(ctx, rewritten);
  },
});

/** Topic pages still light on connections — the catch-up linker's list.
 * Hub index pages are mechanical and never sent to a model. */
export const listSparselyLinkedTopicsInternal = internalQuery({
  args: { companyId: v.optional(v.id("companies")), limit: v.number() },
  handler: async (
    ctx,
    args
  ): Promise<Array<{ kind: string; subjectKey: string; title: string; excerpt: string; links: number }>> => {
    const pages = await ctx.db
      .query("wikiPages")
      .withIndex("by_company_updated", (q) => q.eq("companyId", args.companyId))
      .take(500);
    const now = Date.now();
    const restMs = 7 * 24 * 60 * 60 * 1000;
    return pages
      .filter((page) => {
        if (page.kind === "CUSTOMER") return false;
        // Source notes get their links mechanically from the distiller.
        if (page.kind === "SOURCE") return false;
        if (page.subjectKey.endsWith("-index")) return false;
        // Only links to *other topics* count as connections. A page's link
        // down to the document it came from is mechanical — the distiller
        // writes it — and says nothing about how connected the page is to
        // the rest of the wiki.
        //
        // Counting those is what left the map as islands. A document
        // yielding three topics gave each of them two siblings and one
        // source note: three links on the day it was written, at the
        // threshold, so the Linker never looked at any of them again and no
        // bridge between documents was ever built.
        const bridges = page.links.filter((link) => !link.startsWith("SOURCE:"));
        if (bridges.length >= 3) return false;
        // Rested like the orphan notes: a page the model genuinely cannot
        // place is not re-read every night for ever.
        return now - (page.lastTendedAt ?? 0) >= restMs;
      })
      .slice(0, args.limit)
      .map((page) => ({
        kind: page.kind,
        subjectKey: page.subjectKey,
        title: page.title,
        excerpt: page.content.slice(0, 900),
        links: page.links.length,
      }));
  },
});

/** Source documents with no connections at all — the Linker's orphan list
 * (Anthony's steer, 2026-08-16: "we should not have any orphans"). A
 * document that taught no topics floats alone on the map until the Linker
 * reads it against the index. Visited notes rest a week (`lastTendedAt`),
 * so a genuinely unrelatable page is not re-asked nightly forever. */
export const listOrphanSourceNotesInternal = internalQuery({
  args: { companyId: v.optional(v.id("companies")), limit: v.number() },
  handler: async (
    ctx,
    args
  ): Promise<Array<{ kind: string; subjectKey: string; title: string; excerpt: string }>> => {
    const pages = await ctx.db
      .query("wikiPages")
      .withIndex("by_company_updated", (q) => q.eq("companyId", args.companyId))
      .take(500);
    const now = Date.now();
    const restMs = 7 * 24 * 60 * 60 * 1000;
    return pages
      .filter(
        (page) =>
          page.kind === "SOURCE" &&
          page.links.length === 0 &&
          now - (page.lastTendedAt ?? 0) >= restMs
      )
      .slice(0, args.limit)
      .map((page) => ({
        kind: page.kind,
        subjectKey: page.subjectKey,
        title: page.title,
        excerpt: page.content.slice(0, 900),
      }));
  },
});

/**
 * The hubs (Anthony's Obsidian steer, 2026-08-15): every wiki needs a
 * spine, and his vault's is its index pages — the directory every profile
 * hangs off. Sonae's hubs are mechanical, not model-written: one index page
 * per topic kind, listing its members as [[references]], linked both ways.
 * Always accurate, never costs a model call, and gives the map its centres.
 */
export const refreshHubPagesInternal = internalMutation({
  args: { companyId: v.optional(v.id("companies")) },
  handler: async (ctx, args): Promise<void> => {
    const pages = await ctx.db
      .query("wikiPages")
      .withIndex("by_company_updated", (q) => q.eq("companyId", args.companyId))
      .take(500);
    const now = Date.now();
    const hubs = [
      { kind: "PRODUCT" as const, subjectKey: "products-index", intro: "Everything the company offers, one page per product or service" },
      { kind: "POLICY" as const, subjectKey: "policies-index", intro: "How the company works, one page per policy" },
      { kind: "ISSUE" as const, subjectKey: "issues-index", intro: "What keeps coming up, one page per recurring issue" },
    ];
    for (const hub of hubs) {
      const members = pages.filter(
        (page) => page.kind === hub.kind && page.subjectKey !== hub.subjectKey
      );
      if (members.length === 0) continue;
      const memberKeys = members.map((page) => linkKeyFor(page.kind, page.subjectKey));
      const content =
        `${hub.intro}: ` +
        members.map((page) => `[[${page.subjectKey}]]`).join(", ") +
        ".";
      const existing = pages.find(
        (page) => page.kind === hub.kind && page.subjectKey === hub.subjectKey
      );
      if (existing) {
        if (existing.content !== content || existing.links.length !== memberKeys.length) {
          await ctx.db.patch(existing._id, {
            content,
            searchText: buildWikiSearchText({
              title: existing.title,
              subjectKey: existing.subjectKey,
              content,
            }),
            links: memberKeys,
            updatedAt: now,
          });
        }
      } else {
        await ctx.db.insert("wikiPages", {
          companyId: args.companyId,
          kind: hub.kind,
          subjectKey: hub.subjectKey,
          title: hub.subjectKey,
          content,
          searchText: buildWikiSearchText({
            title: hub.subjectKey,
            subjectKey: hub.subjectKey,
            content,
          }),
          links: memberKeys,
          pinnedCorrections: [],
          rewriteCount: 1,
          lastRewriteSource: "TENDING",
          createdAt: now,
          updatedAt: now,
        });
      }
      const hubKey = linkKeyFor(hub.kind, hub.subjectKey);
      for (const member of members) {
        if (!member.links.includes(hubKey)) {
          await ctx.db.patch(member._id, { links: [...member.links, hubKey] });
        }
      }
    }
  },
});

// ---------------------------------------------------------------------------
// The Pages screen's doors (wiki plan, phase 3): company-scoped reading for
// any workspace member, editing for admins, everything audited. People
// outrank the machine here — a human edit files a revision exactly as a
// machine rewrite does, and the pinned layer is theirs alone.
// ---------------------------------------------------------------------------

async function listPagesRows(
  ctx: QueryCtx,
  companyId: WikiScope,
  paginationOpts: { numItems: number; cursor: string | null },
  search?: string,
  kind?: "CUSTOMER" | "PRODUCT" | "POLICY" | "ISSUE" | "SOURCE"
) {
  const needle = search?.trim();
  // Searched, filtered and paged where the pages are. This used to take five
  // hundred rows and sift them in the browser: a growing bill on every
  // keystroke, and page five hundred and one simply did not exist.
  const page = needle
    ? await ctx.db
      .query("wikiPages")
      .withSearchIndex("search_text", (q) => {
        const base = q.search("searchText", needle).eq("companyId", companyId);
        return kind ? base.eq("kind", kind) : base;
      })
      .paginate(paginationOpts)
    : await ctx.db
      .query("wikiPages")
      .withIndex("by_company_updated", (q) => q.eq("companyId", companyId))
      .order("desc")
      .paginate(paginationOpts);

  const rows = kind && !needle ? page.page.filter((row) => row.kind === kind) : page.page;

  return {
    ...page,
    page: rows.map((page) => ({
      pageId: page._id,
      kind: page.kind,
      title: page.title,
      subjectKey: page.subjectKey,
      links: page.links,
      preview: page.content.slice(0, 160),
      rewriteCount: page.rewriteCount,
      pinnedCount: page.pinnedCorrections.length,
      // Denormalised in upsertSourceReceipt: counting per row here would be
      // an N+1 across the whole wiki on every keystroke of the search box.
      sourceCount: page.documentSourceCount ?? 0,
      lastRewriteSource: page.lastRewriteSource,
      updatedAt: page.updatedAt,
      // The loop's marks (closing-the-loop plan, phase 2).
      usageCount: page.usageCount ?? 0,
      lastUsedAt: page.lastUsedAt ?? null,
      createdAt: page.createdAt,
    })),
  };
}

async function pageDetailFor(ctx: QueryCtx, companyId: WikiScope, pageId: Id<"wikiPages">) {
  const page = await ctx.db.get(pageId);
  if (!page || page.companyId !== companyId) return null;
  const revisions = await ctx.db
    .query("wikiPageRevisions")
    .withIndex("by_page", (q) => q.eq("pageId", page._id))
    .order("desc")
    .take(20);
  const sources = await ctx.db
    .query("wikiPageSources")
    .withIndex("by_page", (q) => q.eq("pageId", page._id))
    .order("desc")
    .take(50);

  // The reading wiki's plumbing (reading-wiki designs, screen 1): every
  // [[reference]] and recorded link resolved to a living page — id, title
  // and an excerpt for the hover peek — and the reverse direction: every
  // page that links HERE, with the sentence that does. One bounded scan
  // serves both; the wall is the index the scan starts from.
  const neighbourhood = await ctx.db
    .query("wikiPages")
    .withIndex("by_company_updated", (q) => q.eq("companyId", companyId))
    .take(500);
  const myKey = linkKeyFor(page.kind, page.subjectKey);
  const bySubject = new Map<string, (typeof neighbourhood)[number]>();
  for (const candidate of neighbourhood) {
    bySubject.set(linkKeyFor(candidate.kind, candidate.subjectKey), candidate);
  }
  const wantedKeys = new Set<string>(page.links);
  for (const slug of extractWikiLinkSlugs(page.content)) {
    for (const kind of ["PRODUCT", "POLICY", "ISSUE", "CUSTOMER", "SOURCE"] as const) {
      const key = linkKeyFor(kind, slug);
      if (bySubject.has(key)) {
        wantedKeys.add(key);
        break;
      }
    }
  }
  const resolvedLinks = [...wantedKeys]
    .map((key) => {
      const target = bySubject.get(key);
      if (!target || target._id === page._id) return null;
      return {
        key,
        slug: target.subjectKey,
        pageId: target._id,
        title: target.title,
        excerpt: target.content.slice(0, 160).replace(/\s+/g, " "),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const quoteFor = (content: string): string => {
    const mention = content.indexOf(`[[${page.subjectKey}]]`);
    if (mention === -1) return content.slice(0, 110).replace(/\s+/g, " ");
    const start = Math.max(0, mention - 60);
    return `…${content.slice(start, mention + page.subjectKey.length + 64).replace(/\s+/g, " ")}…`;
  };
  const backlinks = neighbourhood
    .filter((candidate) => candidate._id !== page._id && candidate.links.includes(myKey))
    .slice(0, 30)
    .map((candidate) => ({
      pageId: candidate._id,
      title: candidate.title,
      subjectKey: candidate.subjectKey,
      kind: candidate.kind,
      quote: quoteFor(candidate.content),
    }));

  // Health on the page (living-wiki plan, phase 3): the Freshness
  // Checker's last verification rides on the row already; the open
  // questions naming this page come from their own indexed shelf.
  const openQuestions = await ctx.db
    .query("wikiOpenQuestions")
    .withIndex("by_company_status", (q) => q.eq("companyId", companyId).eq("status", "OPEN"))
    .take(100);
  const openQuestionCount = openQuestions.filter(
    (question) => question.pageKeyA === myKey || question.pageKeyB === myKey
  ).length;

  return {
    resolvedLinks,
    backlinks,
    lastVerifiedAt: page.lastVerifiedAt ?? null,
    openQuestionCount,
    pageId: page._id,
    kind: page.kind,
    sources: sources.map((source) => ({
      kind: source.kind,
      ref: source.ref,
      label: source.label,
      addedAt: source.addedAt,
    })),
    title: page.title,
    subjectKey: page.subjectKey,
    content: page.content,
    pinnedCorrections: page.pinnedCorrections,
    rewriteCount: page.rewriteCount,
    lastRewriteSource: page.lastRewriteSource,
    updatedAt: page.updatedAt,
    createdAt: page.createdAt,
    usageCount: page.usageCount ?? 0,
    lastUsedAt: page.lastUsedAt ?? null,
    revisions: revisions.map((revision) => ({
      content: revision.content,
      source: revision.source,
      createdAt: revision.createdAt,
    })),
  };
}

export const listCompanyPages = moduleQuery({
  module: CORE_MODULES.wiki,
  args: { search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { companyId } = ctx;
    if (!companyId) return [];
    const needle = args.search?.trim().toLowerCase();
    const rows = await listPagesForMap(ctx, companyId);
    return needle
      ? rows.filter(
        (row) =>
          row.title.toLowerCase().includes(needle) ||
          row.subjectKey.toLowerCase().includes(needle)
      )
      : rows;
  },
});

export const getPageDetail = moduleQuery({
  module: CORE_MODULES.wiki,
  args: { pageId: v.id("wikiPages") },
  handler: async (ctx, args) => {
    const { companyId } = ctx;
    if (!companyId) return null;
    return await pageDetailFor(ctx, companyId, args.pageId);
  },
});

/**
 * The quick switcher's read (living-wiki plan, phase 1): a few letters
 * find any page, and each hit shows the sentence that matched so the
 * reader knows why. Bounded scan of the scope's newest 500 — the same
 * bound as every wiki screen — behind the same walls.
 */
async function searchRows(ctx: QueryCtx, companyId: WikiScope, term: string) {
  const needle = term.trim().toLowerCase();
  if (needle.length < 2) return [];
  const pages = await ctx.db
    .query("wikiPages")
    .withIndex("by_company_updated", (q) => q.eq("companyId", companyId))
    .take(500);
  const hits = [];
  for (const page of pages) {
    const inTitle =
      page.title.toLowerCase().includes(needle) || page.subjectKey.toLowerCase().includes(needle);
    const contentIndex = page.content.toLowerCase().indexOf(needle);
    if (!inTitle && contentIndex === -1) continue;
    let snippet = "";
    if (contentIndex !== -1) {
      const start = Math.max(0, contentIndex - 60);
      snippet = `…${page.content
        .slice(start, contentIndex + needle.length + 80)
        .replace(/\s+/g, " ")
        .trim()}…`;
    }
    hits.push({
      pageId: page._id,
      title: page.title,
      kind: page.kind,
      subjectKey: page.subjectKey,
      snippet,
      // Titles beat body hits; busier pages beat quiet ones.
      rank: (inTitle ? 2 : 0) + Math.min((page.usageCount ?? 0) / 50, 1),
    });
  }
  return hits
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 12)
    .map(({ rank: _rank, ...hit }) => hit);
}

export const searchPagesForCompany = adminQuery({
  args: { companyId: v.id("companies"), term: v.string() },
  handler: async (ctx, args) => {
    assertAdminCanAccessCompany(ctx.user, args.companyId, "Unauthorized Access");
    return await searchRows(ctx, args.companyId, args.term);
  },
});

export const searchPagesForGlobal = adminQuery({
  args: { term: v.string() },
  handler: async (ctx, args) => {
    assertPlatformWikiRead(ctx.user);
    return await searchRows(ctx, undefined, args.term);
  },
});

/**
 * "Your brain is yours" (Anthony's pick, 2026-08-17): everything needed
 * to write this scope's wiki out as an Obsidian vault — every page with
 * its receipts, links intact in the prose. The same walls as the list
 * doors; the zip is assembled in the browser.
 */
async function exportRows(ctx: QueryCtx, companyId: WikiScope) {
  const pages = await ctx.db
    .query("wikiPages")
    .withIndex("by_company_updated", (q) => q.eq("companyId", companyId))
    .take(1000);
  const result = [];
  for (const page of pages) {
    const sources = await ctx.db
      .query("wikiPageSources")
      .withIndex("by_page", (q) => q.eq("pageId", page._id))
      .take(20);
    result.push({
      kind: page.kind,
      subjectKey: page.subjectKey,
      title: page.title,
      content: page.content,
      pinnedCorrections: page.pinnedCorrections.map((pin) => pin.text),
      sources: sources.map((source) => source.label),
      updatedAt: page.updatedAt,
    });
  }
  return result;
}

export const getExportForCompany = adminQuery({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    assertAdminCanAccessCompany(ctx.user, args.companyId, "Unauthorized Access");
    return await exportRows(ctx, args.companyId);
  },
});

export const getExportForGlobal = adminQuery({
  args: {},
  handler: async (ctx) => {
    assertPlatformWikiRead(ctx.user);
    return await exportRows(ctx, undefined);
  },
});

/** The platform wiki is the super admin's alone to write; the read-only
 * console role may look. Company admins never see it from here — and a
 * company's wiki is never visible outside its own section (Anthony's
 * ruling, 2026-08-16). */
function assertPlatformWikiRead(user: Doc<"users">) {
  if (user.role !== "SUPER_ADMIN" && user.role !== "READ_ONLY") {
    throw new Error("Unauthorized access to the platform wiki");
  }
}

function assertPlatformWikiWrite(user: Doc<"users">) {
  if (user.role !== "SUPER_ADMIN") {
    throw new Error("Unauthorized access to the platform wiki");
  }
}

export const listPagesForGlobal = adminQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    kind: v.optional(wikiKindValidator),
  },
  handler: async (ctx, args) => {
    assertPlatformWikiRead(ctx.user);
    return await listPagesRows(ctx, undefined, args.paginationOpts, args.search, args.kind);
  },
});

export const getPageDetailForGlobal = adminQuery({
  args: { pageId: v.id("wikiPages") },
  handler: async (ctx, args) => {
    assertPlatformWikiRead(ctx.user);
    return await pageDetailFor(ctx, undefined, args.pageId);
  },
});

// The company-level doors (Anthony's ruling, 2026-08-14): the wiki IS
// company-scoped data, so the company detail screen reads it like Knowledge
// and Memory do — one named company at a time, behind the same access
// assertion every other company screen uses.


/** The map's read: the whole shape of a wiki, bounded and light. A picture
 * of everything cannot be paged — but it can be capped, and it carries only
 * the handful of fields the drawing needs. */
const WIKI_MAP_LIMIT = 1000;

async function listPagesForMap(ctx: QueryCtx, companyId: WikiScope) {
  const pages = await ctx.db
    .query("wikiPages")
    .withIndex("by_company_updated", (q) => q.eq("companyId", companyId))
    .order("desc")
    .take(WIKI_MAP_LIMIT);
  return pages.map((page) => ({
    pageId: page._id,
    kind: page.kind,
    title: page.title,
    subjectKey: page.subjectKey,
    links: page.links,
    usageCount: page.usageCount ?? 0,
    updatedAt: page.updatedAt,
  }));
}

export const listPagesForMapForCompany = adminQuery({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    assertAdminCanAccessCompany(ctx.user, args.companyId, "Unauthorized Access");
    return await listPagesForMap(ctx, args.companyId);
  },
});

export const listPagesForMapForGlobal = adminQuery({
  args: {},
  handler: async (ctx) => {
    assertPlatformWikiRead(ctx.user);
    return await listPagesForMap(ctx, undefined);
  },
});

export const listPagesForCompany = adminQuery({
  args: {
    companyId: v.id("companies"),
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    kind: v.optional(wikiKindValidator),
  },
  handler: async (ctx, args) => {
    assertAdminCanAccessCompany(ctx.user, args.companyId, "Unauthorized Access");
    return await listPagesRows(ctx, args.companyId, args.paginationOpts, args.search, args.kind);
  },
});

export const getPageDetailForCompany = adminQuery({
  args: { companyId: v.id("companies"), pageId: v.id("wikiPages") },
  handler: async (ctx, args) => {
    assertAdminCanAccessCompany(ctx.user, args.companyId, "Unauthorized Access");
    return await pageDetailFor(ctx, args.companyId, args.pageId);
  },
});

/** A page proven to be the named company's, or nothing. */
async function requirePageInCompany(
  ctx: QueryCtx,
  companyId: WikiScope,
  pageId: Id<"wikiPages">
): Promise<Doc<"wikiPages">> {
  const page = await ctx.db.get(pageId);
  if (!page || page.companyId !== companyId) throw new Error("Page not found.");
  return page;
}

async function applyHumanEdit(
  ctx: MutationCtx,
  args: { companyId: WikiScope; userId: Id<"users">; pageId: Id<"wikiPages">; content: string }
): Promise<void> {
  const page = await requirePageInCompany(ctx, args.companyId, args.pageId);
  const content = args.content.trim().slice(0, WIKI_PAGE_MAX_CHARS);
  if (!content) throw new Error("A page cannot be emptied — pin a correction instead.");
  if (content === page.content) return;

  const now = Date.now();
  const source = `HUMAN:${args.userId}`;
  await ctx.db.insert("wikiPageRevisions", {
    pageId: page._id,
    companyId: args.companyId,
    content: page.content,
    source,
    createdAt: now,
  });
  await ctx.db.patch(page._id, {
    content,
    searchText: buildWikiSearchText({
      title: page.title,
      subjectKey: page.subjectKey,
      content,
    }),
    lastRewriteSource: source,
    updatedAt: now,
  });
  await ctx.db.insert("auditLogs", {
    actorId: args.userId,
    actionType: "WIKI_PAGE_HUMAN_EDIT",
    entityId: page._id.toString(),
    entityType: "wikiPages",
    companyId: args.companyId,
    timestamp: now,
    metadata: JSON.stringify({
      subjectKey: page.subjectKey,
      beforeChars: page.content.length,
      afterChars: content.length,
    }),
  });
}

async function applyPin(
  ctx: MutationCtx,
  args: { companyId: WikiScope; userId: Id<"users">; pageId: Id<"wikiPages">; text: string }
): Promise<void> {
  const page = await requirePageInCompany(ctx, args.companyId, args.pageId);
  const text = args.text.trim().slice(0, 500);
  if (!text) throw new Error("A pinned correction needs words.");

  const now = Date.now();
  // Attribution lives in the audit row below, not on the pin: the pin is
  // company knowledge, and a person's erasure must not have to edit it.
  await ctx.db.patch(page._id, {
    pinnedCorrections: [...page.pinnedCorrections, { text, pinnedAt: now }],
    updatedAt: now,
  });
  await ctx.db.insert("auditLogs", {
    actorId: args.userId,
    actionType: "WIKI_PAGE_PIN",
    entityId: page._id.toString(),
    entityType: "wikiPages",
    companyId: args.companyId,
    timestamp: now,
    metadata: JSON.stringify({ subjectKey: page.subjectKey, text }),
  });
}

async function applyUnpin(
  ctx: MutationCtx,
  args: { companyId: WikiScope; userId: Id<"users">; pageId: Id<"wikiPages">; pinnedAt: number }
): Promise<void> {
  const page = await requirePageInCompany(ctx, args.companyId, args.pageId);
  const remaining = page.pinnedCorrections.filter(
    (correction) => correction.pinnedAt !== args.pinnedAt
  );
  if (remaining.length === page.pinnedCorrections.length) return;

  const now = Date.now();
  await ctx.db.patch(page._id, { pinnedCorrections: remaining, updatedAt: now });
  await ctx.db.insert("auditLogs", {
    actorId: args.userId,
    actionType: "WIKI_PAGE_UNPIN",
    entityId: page._id.toString(),
    entityType: "wikiPages",
    companyId: args.companyId,
    timestamp: now,
    metadata: JSON.stringify({ subjectKey: page.subjectKey }),
  });
}

/**
 * Remove one page outright, receipts and all.
 *
 * The wiki had no way to take a page off the shelf: documents could be
 * deleted, pages could not, so clearing a workspace's knowledge left every
 * page standing and pointing at files that no longer existed (Anthony,
 * 2026-08-20: "the wiki is still full"). Links from other pages to the
 * deleted one are left for the nightly tending pass, which already repairs
 * dangling links — deleting must not require reading every other page.
 */
async function applyDelete(
  ctx: MutationCtx,
  args: { companyId: WikiScope; userId: Id<"users">; pageId: Id<"wikiPages"> }
): Promise<void> {
  const page = await requirePageInCompany(ctx, args.companyId, args.pageId);
  const receipts = await ctx.db
    .query("wikiPageSources")
    .withIndex("by_page", (q) => q.eq("pageId", args.pageId))
    .take(500);
  for (const receipt of receipts) {
    await ctx.db.delete(receipt._id);
  }
  await ctx.db.delete(page._id);
  await ctx.db.insert("auditLogs", {
    actorId: args.userId,
    actionType: "WIKI_PAGE_DELETE",
    entityId: page._id.toString(),
    entityType: "wikiPages",
    ...(args.companyId ? { companyId: args.companyId } : {}),
    timestamp: Date.now(),
    metadata: JSON.stringify({ kind: page.kind, subjectKey: page.subjectKey, title: page.title }),
  });
}

export const deletePageForCompany = adminMutation({
  args: { companyId: v.id("companies"), pageId: v.id("wikiPages") },
  handler: async (ctx, args) => {
    assertAdminCanAccessCompany(ctx.user, args.companyId, "Unauthorized Access");
    await applyDelete(ctx, { userId: ctx.userId, ...args });
  },
});

export const deletePageForGlobal = adminMutation({
  args: { pageId: v.id("wikiPages") },
  handler: async (ctx, args) => {
    assertPlatformWikiWrite(ctx.user);
    await applyDelete(ctx, { companyId: undefined, userId: ctx.userId, ...args });
  },
});

/**
 * Empty one company's wiki in a single press — every page, every receipt.
 *
 * For starting a workspace's knowledge over: today's need was a wiki built
 * by the broken distiller that had to go before the documents were fed in
 * again. Batched because a mutation cannot delete without bound; the screen
 * calls it until `remaining` reaches zero.
 */
export const clearWikiForCompany = adminMutation({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args): Promise<{ deleted: number; remaining: number }> => {
    assertAdminCanAccessCompany(ctx.user, args.companyId, "Unauthorized Access");
    const pages = await ctx.db
      .query("wikiPages")
      .withIndex("by_company_updated", (q) => q.eq("companyId", args.companyId))
      .take(50);
    for (const page of pages) {
      await applyDelete(ctx, { companyId: args.companyId, userId: ctx.userId, pageId: page._id });
    }
    const left = await ctx.db
      .query("wikiPages")
      .withIndex("by_company_updated", (q) => q.eq("companyId", args.companyId))
      .take(1);
    return { deleted: pages.length, remaining: left.length };
  },
});

function requireActiveCompany(user: Doc<"users">): Id<"companies"> {
  const companyId = getActiveCompanyId(user);
  if (!companyId) throw new Error("No workspace selected.");
  return companyId;
}

export const editPageContent = adminMutation({
  args: { pageId: v.id("wikiPages"), content: v.string() },
  handler: async (ctx, args) => {
    await applyHumanEdit(ctx, {
      companyId: requireActiveCompany(ctx.user),
      userId: ctx.userId,
      ...args,
    });
  },
});

export const pinCorrection = adminMutation({
  args: { pageId: v.id("wikiPages"), text: v.string() },
  handler: async (ctx, args) => {
    await applyPin(ctx, { companyId: requireActiveCompany(ctx.user), userId: ctx.userId, ...args });
  },
});

export const unpinCorrection = adminMutation({
  args: { pageId: v.id("wikiPages"), pinnedAt: v.number() },
  handler: async (ctx, args) => {
    await applyUnpin(ctx, { companyId: requireActiveCompany(ctx.user), userId: ctx.userId, ...args });
  },
});

// The same three doors from the company detail screen, one named company at
// a time (Anthony's ruling, 2026-08-14).

export const editPageContentForCompany = adminMutation({
  args: { companyId: v.id("companies"), pageId: v.id("wikiPages"), content: v.string() },
  handler: async (ctx, args) => {
    assertAdminCanAccessCompany(ctx.user, args.companyId, "Unauthorized Access");
    await applyHumanEdit(ctx, { userId: ctx.userId, ...args });
  },
});

export const pinCorrectionForCompany = adminMutation({
  args: { companyId: v.id("companies"), pageId: v.id("wikiPages"), text: v.string() },
  handler: async (ctx, args) => {
    assertAdminCanAccessCompany(ctx.user, args.companyId, "Unauthorized Access");
    await applyPin(ctx, { userId: ctx.userId, ...args });
  },
});

export const editPageContentForGlobal = adminMutation({
  args: { pageId: v.id("wikiPages"), content: v.string() },
  handler: async (ctx, args) => {
    assertPlatformWikiWrite(ctx.user);
    await applyHumanEdit(ctx, { companyId: undefined, userId: ctx.userId, ...args });
  },
});

export const pinCorrectionForGlobal = adminMutation({
  args: { pageId: v.id("wikiPages"), text: v.string() },
  handler: async (ctx, args) => {
    assertPlatformWikiWrite(ctx.user);
    await applyPin(ctx, { companyId: undefined, userId: ctx.userId, ...args });
  },
});

export const unpinCorrectionForGlobal = adminMutation({
  args: { pageId: v.id("wikiPages"), pinnedAt: v.number() },
  handler: async (ctx, args) => {
    assertPlatformWikiWrite(ctx.user);
    await applyUnpin(ctx, { companyId: undefined, userId: ctx.userId, ...args });
  },
});

export const unpinCorrectionForCompany = adminMutation({
  args: { companyId: v.id("companies"), pageId: v.id("wikiPages"), pinnedAt: v.number() },
  handler: async (ctx, args) => {
    assertAdminCanAccessCompany(ctx.user, args.companyId, "Unauthorized Access");
    await applyUnpin(ctx, { userId: ctx.userId, ...args });
  },
});

/**
 * The email door's twin of `matchCallerToCustomer`: the sender matched
 * against the workspace's own customers by address. A match names the page;
 * an unknown sender never becomes a page.
 */
/**
 * The knowing doors' read (wiki plan, phase 2): who is this, and what does
 * their page say — rendered whole, pinned layer appended, ready for a
 * model's context. Null when the person is unknown or their page does not
 * exist yet; a door that learns nothing loses nothing.
 */
export const getRenderedPageForPhoneNumber = internalQuery({
  args: { companyId: v.id("companies"), phoneNumber: v.string() },
  handler: async (
    ctx,
    args
  ): Promise<{ subjectKey: string; pageText: string } | null> => {
    const caller = normalisePhoneNumber(args.phoneNumber);
    if (!caller) return null;
    const customers = await ctx.db
      .query("salesDataCustomers")
      .withIndex("by_company_account", (q) => q.eq("companyId", args.companyId))
      .take(2000);
    const match = customers.find(
      (customer) =>
        (customer.phone && normalisePhoneNumber(customer.phone) === caller) ||
        (customer.mobile && normalisePhoneNumber(customer.mobile) === caller)
    );
    if (!match) return null;
    const page = await getPage(ctx, args.companyId, "CUSTOMER", match.accountNameKey);
    if (!page) return null;
    return { subjectKey: match.accountNameKey, pageText: await renderWithNeighbours(ctx, page) };
  },
});

/** One matching rule for every email door: either address column, normalised. */
async function matchEmailToCustomerKey(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  email: string | undefined | null
): Promise<string | null> {
  const sender = normaliseEmail(email);
  if (!sender) return null;
  const customers = await ctx.db
    .query("salesDataCustomers")
    .withIndex("by_company_account", (q) => q.eq("companyId", companyId))
    .take(2000);
  const match = customers.find(
    (customer) =>
      normaliseEmail(customer.email) === sender || normaliseEmail(customer.accountsEmail) === sender
  );
  return match?.accountNameKey ?? null;
}

/**
 * The widget door's read (wiki plan, phase 2): a visitor who gave their
 * email at the widget's gateway is matched like any sender. The email rides
 * in the thread's first gateway-masked message; no gateway, no identity,
 * no page.
 */
export const getRenderedPageForWidgetThread = internalQuery({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args): Promise<string | null> => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread?.widgetId || !thread.companyId) return null;
    const openingMessages = await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .take(3);
    const gateway = openingMessages.find(
      (message) => message.role === "user" && message.content.startsWith("[System Gateway:")
    );
    if (!gateway) return null;
    const email = /<([^<>]+@[^<>]+)>/.exec(gateway.content.split("\n")[0] ?? "")?.[1];
    const subjectKey = await matchEmailToCustomerKey(ctx, thread.companyId, email);
    if (!subjectKey) return null;
    const page = await getPage(ctx, thread.companyId, "CUSTOMER", subjectKey);
    return page ? await renderWithNeighbours(ctx, page) : null;
  },
});

/** A subject's page rendered for a reader, or null before first contact. */
export const getRenderedCustomerPageInternal = internalQuery({
  args: { companyId: v.id("companies"), subjectKey: v.string() },
  handler: async (ctx, args): Promise<string | null> => {
    const page = await getPage(ctx, args.companyId, "CUSTOMER", args.subjectKey);
    return page ? await renderWithNeighbours(ctx, page) : null;
  },
});

export const matchEmailSenderToCustomer = internalQuery({
  args: { companyId: v.id("companies"), email: v.string() },
  handler: async (ctx, args): Promise<string | null> => {
    return await matchEmailToCustomerKey(ctx, args.companyId, args.email);
  },
});

/**
 * One-off: give pages written before the search field existed their
 * searchable text. Bounded per run and idempotent — pages already carrying
 * the field are skipped, so it can be run again safely.
 */
export const backfillSearchTextInternal = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ filled: number; remaining: boolean }> => {
    const batch = Math.min(Math.max(args.limit ?? 200, 1), 500);
    const pages = await ctx.db.query("wikiPages").take(batch + 1);
    let filled = 0;
    for (const page of pages.slice(0, batch)) {
      if (page.searchText) continue;
      await ctx.db.patch(page._id, {
        searchText: buildWikiSearchText({
          title: page.title,
          subjectKey: page.subjectKey,
          content: page.content,
        }),
      });
      filled += 1;
    }
    return { filled, remaining: pages.length > batch };
  },
});
