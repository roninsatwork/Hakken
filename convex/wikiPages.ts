import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { adminMutation, tenantQuery } from "./tenantFunctions";
import { getActiveCompanyId } from "./authz";
import {
  WIKI_PAGE_MAX_CHARS,
  linkKeyFor,
  normaliseEmail,
  renderPageForReading,
} from "./wikiRewriteService";
import { normalisePhoneNumber } from "./telephonyService";

const wikiKindValidator = v.union(
  v.literal("CUSTOMER"),
  v.literal("PRODUCT"),
  v.literal("POLICY"),
  v.literal("ISSUE")
);

type WikiKind = "CUSTOMER" | "PRODUCT" | "POLICY" | "ISSUE";

async function getPage(
  ctx: QueryCtx,
  companyId: Id<"companies">,
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
  args: { companyId: v.id("companies"), kind: wikiKindValidator, subjectKey: v.string() },
  handler: async (ctx, args): Promise<Doc<"wikiPages"> | null> => {
    return await getPage(ctx, args.companyId, args.kind, args.subjectKey);
  },
});

/** Mechanical bookkeeping after a topic learns from an event: both ends of
 * the link recorded, as a set. The map is drawn from exactly this. */
export const addLinksInternal = internalMutation({
  args: {
    companyId: v.id("companies"),
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
  args: { companyId: v.id("companies"), query: v.string() },
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
 * The machine's rewrite landing. Creates the page on first contact;
 * otherwise files the outgoing text as a revision and replaces the body.
 * Never touches the pinned layer.
 */
export const applyRewriteInternal = internalMutation({
  args: {
    companyId: v.id("companies"),
    subjectKey: v.string(),
    title: v.string(),
    content: v.string(),
    source: v.string(),
    /** Absent means CUSTOMER — the phase-1 callers never say. */
    kind: v.optional(wikiKindValidator),
  },
  handler: async (ctx, args): Promise<void> => {
    const kind = args.kind ?? "CUSTOMER";
    const now = Date.now();
    const content = args.content.slice(0, WIKI_PAGE_MAX_CHARS);
    const existing = await getPage(ctx, args.companyId, kind, args.subjectKey);

    if (!existing) {
      const pageId = await ctx.db.insert("wikiPages", {
        companyId: args.companyId,
        kind,
        subjectKey: args.subjectKey,
        title: args.title,
        content,
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
      return;
    }

    // The unchanged case is a real outcome, not a failure: the model judged
    // the event added nothing. No revision, no audit noise.
    if (existing.content === content) {
      await ctx.db.patch(existing._id, { updatedAt: now, lastRewriteSource: args.source });
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
  },
});

// ---------------------------------------------------------------------------
// The Pages screen's doors (wiki plan, phase 3): company-scoped reading for
// any workspace member, editing for admins, everything audited. People
// outrank the machine here — a human edit files a revision exactly as a
// machine rewrite does, and the pinned layer is theirs alone.
// ---------------------------------------------------------------------------

export const listCompanyPages = tenantQuery({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { companyId } = ctx;
    if (!companyId) return [];
    const pages = await ctx.db
      .query("wikiPages")
      .withIndex("by_company_updated", (q) => q.eq("companyId", companyId))
      .order("desc")
      .take(500);
    const needle = args.search?.trim().toLowerCase();
    return pages
      .filter(
        (page) =>
          !needle ||
          page.title.toLowerCase().includes(needle) ||
          page.content.toLowerCase().includes(needle)
      )
      .map((page) => ({
        pageId: page._id,
        kind: page.kind,
        title: page.title,
        subjectKey: page.subjectKey,
        links: page.links,
        preview: page.content.slice(0, 160),
        rewriteCount: page.rewriteCount,
        pinnedCount: page.pinnedCorrections.length,
        lastRewriteSource: page.lastRewriteSource,
        updatedAt: page.updatedAt,
      }));
  },
});

export const getPageDetail = tenantQuery({
  args: { pageId: v.id("wikiPages") },
  handler: async (ctx, args) => {
    const { companyId } = ctx;
    const page = await ctx.db.get(args.pageId);
    if (!page || !companyId || page.companyId !== companyId) return null;
    const revisions = await ctx.db
      .query("wikiPageRevisions")
      .withIndex("by_page", (q) => q.eq("pageId", page._id))
      .order("desc")
      .take(20);
    return {
      pageId: page._id,
      kind: page.kind,
      title: page.title,
      subjectKey: page.subjectKey,
      content: page.content,
      pinnedCorrections: page.pinnedCorrections,
      rewriteCount: page.rewriteCount,
      lastRewriteSource: page.lastRewriteSource,
      updatedAt: page.updatedAt,
      createdAt: page.createdAt,
      revisions: revisions.map((revision) => ({
        content: revision.content,
        source: revision.source,
        createdAt: revision.createdAt,
      })),
    };
  },
});

/** An admin's own guarded page: right company, or nothing. */
async function requireCompanyPage(
  ctx: QueryCtx & { user: Doc<"users"> },
  pageId: Id<"wikiPages">
): Promise<{ page: Doc<"wikiPages">; companyId: Id<"companies"> }> {
  const companyId = getActiveCompanyId(ctx.user);
  if (!companyId) throw new Error("No workspace selected.");
  const page = await ctx.db.get(pageId);
  if (!page || page.companyId !== companyId) throw new Error("Page not found.");
  return { page, companyId };
}

export const editPageContent = adminMutation({
  args: { pageId: v.id("wikiPages"), content: v.string() },
  handler: async (ctx, args) => {
    const { page, companyId } = await requireCompanyPage(ctx, args.pageId);
    const content = args.content.trim().slice(0, WIKI_PAGE_MAX_CHARS);
    if (!content) throw new Error("A page cannot be emptied — pin a correction instead.");
    if (content === page.content) return;

    const now = Date.now();
    const source = `HUMAN:${ctx.userId}`;
    await ctx.db.insert("wikiPageRevisions", {
      pageId: page._id,
      companyId,
      content: page.content,
      source,
      createdAt: now,
    });
    await ctx.db.patch(page._id, { content, lastRewriteSource: source, updatedAt: now });
    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: "WIKI_PAGE_HUMAN_EDIT",
      entityId: page._id.toString(),
      entityType: "wikiPages",
      companyId,
      timestamp: now,
      metadata: JSON.stringify({
        subjectKey: page.subjectKey,
        beforeChars: page.content.length,
        afterChars: content.length,
      }),
    });
  },
});

export const pinCorrection = adminMutation({
  args: { pageId: v.id("wikiPages"), text: v.string() },
  handler: async (ctx, args) => {
    const { page, companyId } = await requireCompanyPage(ctx, args.pageId);
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
      actorId: ctx.userId,
      actionType: "WIKI_PAGE_PIN",
      entityId: page._id.toString(),
      entityType: "wikiPages",
      companyId,
      timestamp: now,
      metadata: JSON.stringify({ subjectKey: page.subjectKey, text }),
    });
  },
});

export const unpinCorrection = adminMutation({
  args: { pageId: v.id("wikiPages"), pinnedAt: v.number() },
  handler: async (ctx, args) => {
    const { page, companyId } = await requireCompanyPage(ctx, args.pageId);
    const remaining = page.pinnedCorrections.filter(
      (correction) => correction.pinnedAt !== args.pinnedAt
    );
    if (remaining.length === page.pinnedCorrections.length) return;

    const now = Date.now();
    await ctx.db.patch(page._id, { pinnedCorrections: remaining, updatedAt: now });
    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: "WIKI_PAGE_UNPIN",
      entityId: page._id.toString(),
      entityType: "wikiPages",
      companyId,
      timestamp: now,
      metadata: JSON.stringify({ subjectKey: page.subjectKey }),
    });
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
