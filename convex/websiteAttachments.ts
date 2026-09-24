import { v } from "convex/values";

import { superAdminMutation, superAdminQuery } from "./tenantFunctions";
import { appError } from "./utils/appError";
import { isTrackedHold } from "./utils/websitePairing";
import { findOrCreateWebsite, requireHost } from "./websites";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requestGroupGapRebuilds } from "./siteRankings";

/**
 * A company's choice of which websites it owns and which it watches.
 *
 * Anthony, 2026-09-22: *"we have owned websites and tracked websites — in a
 * company you set which you own and which you track. This comes from the
 * global pool or you add one new into the pool."* This module is the second
 * half of that sentence. The pool is `websites`; a choice is a `companyWebsites`
 * row; and a tracked row is the only thing that may spend a company's money on
 * somebody else's site.
 *
 * Its own module rather than more of `websites.ts`, which sat at 919 lines
 * against a thousand-line ceiling. The seam is real as well as forced: that
 * file owns the host record and reads it by host, and this one owns a
 * company's holds and never reads `websites` by anything but an id it was
 * handed, so the tenancy guard's two-file allowance stands untouched.
 */

/** A company with more of its own sites than this has a plan problem, not a query one. */
const OWNED_LIST_LIMIT = 200;

/**
 * One of this company's *own* holds, or a clear refusal.
 *
 * A tracked site may only be paired with a site the company owns. Pairing it
 * with another tracked one would make "collected with" circular, and pairing it
 * with another company's hold would let one tenant set another's schedule.
 */
async function requireOwnedHold(
  ctx: { db: QueryCtx["db"] },
  companyId: Id<"companies">,
  companyWebsiteId: Id<"companyWebsites">,
): Promise<Doc<"companyWebsites">> {
  const hold = await ctx.db.get(companyWebsiteId);
  if (!hold || hold.companyId !== companyId) {
    throw appError("NOT_FOUND", "That website is not one of this company's.");
  }
  if (isTrackedHold(hold)) {
    throw appError(
      "INVALID_INPUT",
      "A tracked site can only be watched against a site this company owns.",
    );
  }
  return hold;
}

/**
 * Put a website on a company's list as one it watches.
 *
 * `against` is the company's own site it is compared with, or null to collect
 * it on its own. Paired, it is collected on its pair's day and from its pair's
 * place; unpaired, it follows the company schedule like any hold.
 *
 * A pairing also records the rivalry on the host, because that much is shared
 * market knowledge and costs nothing to know. Nothing reads that record to
 * decide a purchase — only this row does.
 */
export async function trackWebsiteCore(
  ctx: MutationCtx,
  args: {
    companyId: Id<"companies">;
    url: string;
    against: Doc<"companyWebsites"> | null;
    userId: Id<"users">;
    via: "added" | "discovered";
  },
): Promise<Id<"companyWebsites">> {
  const identity = requireHost(args.url);
  const now = Date.now();
  const { websiteId } = await findOrCreateWebsite(ctx, identity, now);

  if (args.against && websiteId === args.against.websiteId) {
    throw appError("INVALID_INPUT", "A website cannot compete with itself.");
  }

  const existing = await ctx.db
    .query("companyWebsites")
    .withIndex("by_company_website", (q) =>
      q.eq("companyId", args.companyId).eq("websiteId", websiteId))
    .first();
  if (existing) {
    throw appError("INVALID_INPUT", "This company already holds that website.");
  }

  const holdId = await ctx.db.insert("companyWebsites", {
    companyId: args.companyId,
    websiteId,
    relationship: "TRACKED",
    ...(args.against ? { againstWebsiteId: args.against.websiteId } : {}),
    createdAt: now,
  });

  if (args.against) {
    const againstWebsiteId = args.against.websiteId;
    const edge = await ctx.db
      .query("websiteRivals")
      .withIndex("by_website_rival", (q) =>
        q.eq("websiteId", againstWebsiteId).eq("rivalWebsiteId", websiteId))
      .first();
    if (!edge) {
      await ctx.db.insert("websiteRivals", {
        websiteId: againstWebsiteId,
        rivalWebsiteId: websiteId,
        source: args.via === "discovered" ? "DISCOVERED" : "ASSERTED",
        createdAt: now,
      });
    }
    // A new rival changes what every site in the group is missing, on the
    // client's Sites screens — its own gap included.
    await requestGroupGapRebuilds(ctx, args.against);
  }

  await ctx.db.insert("auditLogs", {
    actorId: args.userId,
    actionType: "ADD_TRACKED_WEBSITE",
    entityId: holdId,
    entityType: "companyWebsites",
    companyId: args.companyId,
    metadata: JSON.stringify({
      host: identity.host,
      via: args.via,
      paired: Boolean(args.against),
    }),
    timestamp: now,
  });

  return holdId;
}

/**
 * Track a rival of one of a company's own sites.
 *
 * The shape the site screen and discovery both reach for: they already know
 * which of the company's sites the rival is compared with.
 */
export async function trackCompetitorCore(
  ctx: MutationCtx,
  args: {
    companyWebsiteId: Id<"companyWebsites">;
    url: string;
    userId: Id<"users">;
    via: "added" | "discovered";
  },
): Promise<Id<"companyWebsites">> {
  const against = await ctx.db.get(args.companyWebsiteId);
  if (!against) throw appError("NOT_FOUND", "That website is no longer held by this company.");
  const owned = await requireOwnedHold(ctx, against.companyId, against._id);

  return await trackWebsiteCore(ctx, {
    companyId: owned.companyId,
    url: args.url,
    against: owned,
    userId: args.userId,
    via: args.via,
  });
}

/** Track a rival of one of a company's own sites, from a form. */
export const addTrackedCompetitor = superAdminMutation({
  args: { companyWebsiteId: v.id("companyWebsites"), url: v.string() },
  returns: v.id("companyWebsites"),
  handler: async (ctx, args) => await trackCompetitorCore(ctx, {
    companyWebsiteId: args.companyWebsiteId,
    url: args.url,
    userId: ctx.userId,
    via: "added",
  }),
});

/**
 * Put a website on a company's list as tracked, paired or not.
 *
 * What the company's own Add form calls when "they track it" is chosen. The
 * pairing is optional because a company may watch a site it has no site of its
 * own to compare with; such a site is collected on its own.
 */
export const addTrackedWebsite = superAdminMutation({
  args: {
    companyId: v.id("companies"),
    url: v.string(),
    againstCompanyWebsiteId: v.optional(v.id("companyWebsites")),
  },
  returns: v.id("companyWebsites"),
  handler: async (ctx, args) => {
    const against = args.againstCompanyWebsiteId
      ? await requireOwnedHold(ctx, args.companyId, args.againstCompanyWebsiteId)
      : null;
    return await trackWebsiteCore(ctx, {
      companyId: args.companyId,
      url: args.url,
      against,
      userId: ctx.userId,
      via: "added",
    });
  },
});

/**
 * Change which of a company's own sites a tracked one is watched against.
 *
 * `null` unpairs it, after which it follows the company schedule on its own.
 * Changing the pair moves the day it is collected, which is the point: it lands
 * with whichever site it is now compared to.
 */
export const setTrackedPairing = superAdminMutation({
  args: {
    id: v.id("companyWebsites"),
    againstCompanyWebsiteId: v.union(v.id("companyWebsites"), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.id);
    if (!hold) throw appError("NOT_FOUND", "That website is no longer held by this company.");
    if (!isTrackedHold(hold)) {
      throw appError("INVALID_INPUT", "Only a tracked site is watched against another.");
    }

    const against = args.againstCompanyWebsiteId
      ? await requireOwnedHold(ctx, hold.companyId, args.againstCompanyWebsiteId)
      : null;
    if (against && against.websiteId === hold.websiteId) {
      throw appError("INVALID_INPUT", "A website cannot compete with itself.");
    }

    // Pairing takes the pair's day and place, so any schedule or place this
    // site had of its own stops meaning anything. Cleared rather than kept:
    // a stored value nothing reads is a setting that lies the moment somebody
    // unpairs it again and finds last spring's override still in force.
    await ctx.db.patch(args.id, {
      againstWebsiteId: against?.websiteId,
      ...(against
        ? {
          refreshIntervalStr: undefined,
          collectionEnabled: undefined,
          locationCode: undefined,
          locationLabel: undefined,
        }
        : {}),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: "SET_TRACKED_PAIRING",
      entityId: args.id,
      entityType: "companyWebsites",
      companyId: hold.companyId,
      metadata: JSON.stringify({ against: against?.websiteId ?? null }),
      timestamp: Date.now(),
    });
    return null;
  },
});

/**
 * The sites a company owns, for a pairing picker, in the order it added them.
 *
 * Added order rather than alphabetical because the first entry is the default
 * pair, and a company's first site is nearly always its main one — sorting by
 * name made the default whichever test site happened to start with "b".
 *
 * Small and bounded rather than paged: it feeds a select box, and a company
 * with more of its own sites than fit in one is not choosing from a dropdown.
 */
export const listCompanyOwnedWebsites = superAdminQuery({
  args: { companyId: v.id("companies") },
  returns: v.array(v.object({
    companyWebsiteId: v.id("companyWebsites"),
    websiteId: v.id("websites"),
    displayHost: v.string(),
  })),
  handler: async (ctx, args) => {
    const holds = await ctx.db
      .query("companyWebsites")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .take(OWNED_LIST_LIMIT);

    const owned = holds.filter((hold) => !isTrackedHold(hold));
    const rows = await Promise.all(owned.map(async (hold) => {
      const website = await ctx.db.get(hold.websiteId);
      return {
        companyWebsiteId: hold._id,
        websiteId: hold.websiteId,
        displayHost: website?.displayHost ?? "",
      };
    }));
    // `by_company` already returns them in the order they were added.
    return rows;
  },
});
