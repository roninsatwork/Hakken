import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { WIKI_PAGE_MAX_CHARS, normaliseEmail } from "./wikiRewriteService";

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
    return await ctx.db
      .query("wikiPages")
      .withIndex("by_company_kind_subject", (q) =>
        q.eq("companyId", args.companyId).eq("kind", "CUSTOMER").eq("subjectKey", args.subjectKey)
      )
      .unique();
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
  },
  handler: async (ctx, args): Promise<void> => {
    const now = Date.now();
    const content = args.content.slice(0, WIKI_PAGE_MAX_CHARS);
    const existing = await ctx.db
      .query("wikiPages")
      .withIndex("by_company_kind_subject", (q) =>
        q.eq("companyId", args.companyId).eq("kind", "CUSTOMER").eq("subjectKey", args.subjectKey)
      )
      .unique();

    if (!existing) {
      const pageId = await ctx.db.insert("wikiPages", {
        companyId: args.companyId,
        kind: "CUSTOMER",
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

/**
 * The email door's twin of `matchCallerToCustomer`: the sender matched
 * against the workspace's own customers by address. A match names the page;
 * an unknown sender never becomes a page.
 */
export const matchEmailSenderToCustomer = internalQuery({
  args: { companyId: v.id("companies"), email: v.string() },
  handler: async (ctx, args): Promise<string | null> => {
    const sender = normaliseEmail(args.email);
    if (!sender) return null;
    const customers = await ctx.db
      .query("salesDataCustomers")
      .withIndex("by_company_account", (q) => q.eq("companyId", args.companyId))
      .take(2000);
    const match = customers.find(
      (customer) =>
        normaliseEmail(customer.email) === sender || normaliseEmail(customer.accountsEmail) === sender
    );
    return match?.accountNameKey ?? null;
  },
});
