import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { superAdminMutation, superAdminQuery } from "./tenantFunctions";
import { appError } from "./utils/appError";
import {
  BRAND_NAME_MESSAGES,
  readBrandNames,
} from "./websiteBrands";
import {
  WEBSITE_IDENTITY_MESSAGES,
  readWebsiteHost,
  type WebsiteIdentity,
} from "./websiteIdentity";
import {
  resolveWebsiteSchedule,
  soonestPull,
  type ResolvedWebsiteSchedule,
} from "./seoScheduleService";
import * as websiteShapes from "./utils/websiteShapes";
import {
  includesSearchTerm,
  normalizeSearchTerm,
  paginateItems,
} from "./adminQueryService";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

/**
 * A company's websites, and the competitors tracked against each.
 *
 *     Ronins Agency
 *      ├ ourshop.com          their website
 *      │    ├ rival-a.com     competitor
 *      │    └ rival-b.com     competitor
 *      └ ourtrade.com         their website
 *           └ rival-c.com     competitor
 *
 * Underneath all of it, **a website exists exactly once**. `ourshop.com` and
 * `rival-a.com` are both plain `websites` rows, and if another customer adds
 * `rival-a.com` — as a rival of theirs, or as their own site — they get the
 * same row and Hakken pays DataForSEO once. That promise lives in
 * `findOrCreateWebsite`, which is the only place a `websites` row is created.
 *
 * Super admin only for now. The tables and the functions are shaped so the
 * customer-facing half is an addition rather than a rewrite: `companyId` is on
 * both company-side tables, so a tenant-scoped list filters on one index, and
 * every handler here already scopes by company rather than trusting the route.
 */

const ENTRY_PURGE_BATCH = 100;
const WATCHER_LIMIT = 500;
const COMPETITOR_LIMIT = 1000;
/** The most competitors counted per website before the list says "100+". */
const COMPETITOR_COUNT_LIMIT = 100;

// ---------------------------------------------------------------------------
// Reading a host
// ---------------------------------------------------------------------------

function requireHost(raw: string): WebsiteIdentity {
  const result = readWebsiteHost(raw);
  if (!result.ok) {
    throw appError("INVALID_INPUT", WEBSITE_IDENTITY_MESSAGES[result.problem]);
  }
  return { host: result.host, displayHost: result.displayHost };
}

async function websiteByHost(ctx: QueryCtx | MutationCtx, host: string) {
  return await ctx.db
    .query("websites")
    .withIndex("by_host", (q) => q.eq("host", host))
    .first();
}

/**
 * What an add form is told before anything is written.
 *
 * Echoing the key back is not decoration: pasting a shop's URL and getting
 * `example.com` rather than `shop.example.com` is the only moment someone can
 * notice they are about to track the wrong thing. It also says whether the host
 * is one Hakken already holds, so joining an existing record is visible rather
 * than surprising.
 */
export const previewWebsiteHost = superAdminQuery({
  args: { url: v.string() },
  returns: websiteShapes.websitePreviewShape,
  handler: async (ctx, args) => {
    const result = readWebsiteHost(args.url);
    if (!result.ok) {
      return {
        ok: false as const,
        problem: result.problem,
        message: WEBSITE_IDENTITY_MESSAGES[result.problem],
      };
    }

    const existing = await websiteByHost(ctx, result.host);
    return {
      ok: true as const,
      host: result.host,
      displayHost: result.displayHost,
      alreadyKnown: existing !== null,
    };
  },
});

/**
 * The one place a `websites` row is ever created.
 *
 * Look up by host, reuse what is there, insert only when it is not. Every path
 * that adds a website — a company's own, or a competitor — goes through here,
 * because a second insert site is how duplicate records appear, and a duplicate
 * is invisible on screen. It shows up only as a bill twice the size it should
 * be.
 */
async function findOrCreateWebsite(
  ctx: MutationCtx,
  identity: WebsiteIdentity,
  now: number,
): Promise<{ websiteId: Id<"websites">; created: boolean }> {
  const existing = await websiteByHost(ctx, identity.host);
  if (existing) return { websiteId: existing._id, created: false };

  const websiteId = await ctx.db.insert("websites", {
    host: identity.host,
    displayHost: identity.displayHost,
    firstSeenAt: now,
  });
  return { websiteId, created: true };
}

// ---------------------------------------------------------------------------
// Cadence, derived rather than stored
// ---------------------------------------------------------------------------

/**
 * Everyone watching one host: the companies holding it as their own, and the
 * companies tracking it as a rival of one of theirs.
 *
 * A competitor has no cadence of its own. It is pulled at whatever rate the
 * website it is measured against is pulled at, which is the only rate that
 * makes the comparison meaningful — numbers from different weeks are not a
 * comparison.
 */
type WatcherFacts = {
  key: string;
  companyWebsite: Doc<"companyWebsites">;
  company: Doc<"companies"> | null;
  relationship: "OWNED" | "TRACKED";
  /** The company website a rival is measured against, when this is a rival. */
  againstHost: string | null;
  resolved: ResolvedWebsiteSchedule;
};

/**
 * The DataForSEO schedule a company runs on, if it has one.
 *
 * An ordinary `schedules` row, found by company. The same table, dispatcher and
 * helpers the workflow schedules have always used — this is only a lookup.
 */
async function companySchedule(ctx: QueryCtx, companyId: Id<"companies">) {
  return await ctx.db
    .query("schedules")
    .withIndex("by_company_agent", (q) => q.eq("companyId", companyId))
    .first();
}

async function loadWatchers(
  ctx: QueryCtx,
  websiteId: Id<"websites">,
): Promise<WatcherFacts[]> {
  const owners = await ctx.db
    .query("companyWebsites")
    .withIndex("by_website", (q) => q.eq("websiteId", websiteId))
    .take(WATCHER_LIMIT);

  const rivalEntries = await ctx.db
    .query("trackedCompetitors")
    .withIndex("by_website", (q) => q.eq("websiteId", websiteId))
    .take(WATCHER_LIMIT);

  const asOwner = await Promise.all(
    owners.map(async (companyWebsite) => {
      const company = await ctx.db.get(companyWebsite.companyId);
      const schedule = await companySchedule(ctx, companyWebsite.companyId);
      return {
        key: companyWebsite._id,
        companyWebsite,
        company,
        relationship: "OWNED" as const,
        againstHost: null,
        resolved: resolveWebsiteSchedule(schedule, companyWebsite),
      };
    }),
  );

  const asRival = await Promise.all(
    rivalEntries.map(async (entry) => {
      const companyWebsite = await ctx.db.get(entry.companyWebsiteId);
      if (!companyWebsite) return null;
      const company = await ctx.db.get(entry.companyId);
      const parentWebsite = await ctx.db.get(companyWebsite.websiteId);
      const schedule = await companySchedule(ctx, entry.companyId);
      return {
        key: entry._id,
        companyWebsite,
        company,
        relationship: "TRACKED" as const,
        againstHost: parentWebsite?.displayHost ?? null,
        // A rival follows the website it is measured against — numbers pulled
        // in different weeks are not a comparison.
        resolved: resolveWebsiteSchedule(schedule, companyWebsite),
      };
    }),
  );

  return [...asOwner, ...asRival.filter((row): row is NonNullable<typeof row> => row !== null)];
}

/**
 * When this host is next pulled, and whose schedule is driving that.
 *
 * One website, one record, one pull, so the host's real rate is whichever
 * watcher wants it soonest. Said as a *time* rather than a cadence word because
 * the schedule format can say "Mondays at 02:00", which has no single speed to
 * rank — and because a date is the more useful answer anyway.
 */
function deriveFetchRate(watchers: WatcherFacts[]) {
  const soonest = soonestPull(watchers.map((watcher) => ({ resolved: watcher.resolved, watcher })));
  if (!soonest) return { nextPullAt: null, fetchedFor: null };

  return {
    nextPullAt: soonest.nextRunAt,
    fetchedFor: {
      companyName: soonest.driver.company?.name ?? "Unknown company",
      context: soonest.driver.againstHost ?? "own website",
    },
  };
}

// ---------------------------------------------------------------------------
// Reading — a company's own websites
// ---------------------------------------------------------------------------

async function countCompetitors(ctx: QueryCtx, companyWebsiteId: Id<"companyWebsites">) {
  const rows = await ctx.db
    .query("trackedCompetitors")
    .withIndex("by_company_website", (q) => q.eq("companyWebsiteId", companyWebsiteId))
    .take(COMPETITOR_COUNT_LIMIT + 1);

  return {
    competitorCount: Math.min(rows.length, COMPETITOR_COUNT_LIMIT),
    competitorCountIsCapped: rows.length > COMPETITOR_COUNT_LIMIT,
  };
}

/** One company's own websites, newest first, paged on the server. */
export const getCompanyWebsites = superAdminQuery({
  args: {
    companyId: v.id("companies"),
    paginationOpts: paginationOptsValidator,
  },
  returns: websiteShapes.companyWebsitePageShape,
  handler: async (ctx, args) => {
    // One lookup for the whole page: every website in a company resolves
    // against the same schedule row, so fetching it per row would be the same
    // read repeated fifteen times.
    const schedule = await companySchedule(ctx, args.companyId);
    const page = await ctx.db
      .query("companyWebsites")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .order("desc")
      .paginate(args.paginationOpts);

    const rows = await Promise.all(
      page.page.map(async (companyWebsite) => {
        const website = await ctx.db.get(companyWebsite.websiteId);
        const resolved = resolveWebsiteSchedule(schedule, companyWebsite);
        const counts = await countCompetitors(ctx, companyWebsite._id);

        return {
          ...companyWebsite,
          host: website?.host ?? "",
          displayHost: website?.displayHost ?? "",
          ...counts,
          collecting: resolved.active,
          scheduleSource: resolved.source,
          nextRunAt: resolved.nextRunAt,
        };
      }),
    );

    return { ...page, page: rows };
  },
});

/** One of a company's websites, with its settings resolved against the company's. */
export const getCompanyWebsiteById = superAdminQuery({
  args: { id: v.id("companyWebsites") },
  returns: websiteShapes.companyWebsiteDetailShape,
  handler: async (ctx, args) => {
    const companyWebsite = await ctx.db.get(args.id);
    if (!companyWebsite) return null;

    const [website, company, schedule] = await Promise.all([
      ctx.db.get(companyWebsite.websiteId),
      ctx.db.get(companyWebsite.companyId),
      companySchedule(ctx, companyWebsite.companyId),
    ]);
    const resolved = resolveWebsiteSchedule(schedule, companyWebsite);

    return {
      ...companyWebsite,
      host: website?.host ?? "",
      displayHost: website?.displayHost ?? "",
      companyName: company?.name ?? null,
      /** The company's own schedule, so the screen can show what is inherited. */
      companyIntervalStr: schedule?.intervalStr ?? null,
      companyScheduleActive: schedule?.isActive ?? false,
      effective: {
        active: resolved.active,
        intervalStr: resolved.intervalStr,
        source: resolved.source,
        nextRunAt: resolved.nextRunAt,
      },
    };
  },
});

/** The competitors tracked against one of a company's websites. */
export const getTrackedCompetitors = superAdminQuery({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    searchTerm: v.optional(v.string()),
    page: v.number(),
    pageSize: v.number(),
  },
  returns: websiteShapes.trackedCompetitorPageShape,
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("trackedCompetitors")
      .withIndex("by_company_website", (q) => q.eq("companyWebsiteId", args.companyWebsiteId))
      .order("desc")
      .take(COMPETITOR_LIMIT);

    const joined = await Promise.all(
      entries.map(async (entry) => {
        const website = await ctx.db.get(entry.websiteId);
        return website ? { ...entry, host: website.host, displayHost: website.displayHost } : null;
      }),
    );

    const rows = joined.filter((row): row is NonNullable<typeof row> => row !== null);
    const term = normalizeSearchTerm(args.searchTerm ?? "");
    const matching = term
      ? rows.filter((row) => includesSearchTerm(row.displayHost, term) || includesSearchTerm(row.host, term))
      : rows;

    return paginateItems(matching, args.page, args.pageSize);
  },
});

// ---------------------------------------------------------------------------
// Reading — every website in the system
// ---------------------------------------------------------------------------

export const getPaginatedWebsites = superAdminQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    searchTerm: v.optional(v.string()),
  },
  returns: websiteShapes.globalWebsitePageShape,
  handler: async (ctx, args) => {
    const searchTerm = args.searchTerm?.trim();

    const page = searchTerm
      ? await ctx.db
        .query("websites")
        .withSearchIndex("search_host", (q) => q.search("displayHost", searchTerm))
        .paginate(args.paginationOpts)
      : await ctx.db.query("websites").order("desc").paginate(args.paginationOpts);

    const rows = await Promise.all(
      page.page.map(async (website) => {
        const watchers = await loadWatchers(ctx, website._id);
        const companies = new Set(watchers.map((watcher) => watcher.companyWebsite.companyId));

        return {
          ...website,
          watcherCount: watchers.length,
          companyCount: companies.size,
          ownedCount: watchers.filter((w) => w.relationship === "OWNED").length,
          trackedCount: watchers.filter((w) => w.relationship === "TRACKED").length,
          ...deriveFetchRate(watchers),
        };
      }),
    );

    return { ...page, page: rows };
  },
});

export const getWebsiteById = superAdminQuery({
  args: { id: v.id("websites") },
  returns: websiteShapes.websiteDetailShape,
  handler: async (ctx, args) => {
    const website = await ctx.db.get(args.id);
    if (!website) return null;

    const watchers = await loadWatchers(ctx, args.id);

    return {
      ...website,
      nextPullAt: deriveFetchRate(watchers).nextPullAt,
      watchers: watchers.map((watcher) => ({
        key: watcher.key,
        companyId: watcher.companyWebsite.companyId,
        companyName: watcher.company?.name ?? "Unknown company",
        relationship: watcher.relationship,
        againstHost: watcher.againstHost,
        companyWebsiteId: watcher.companyWebsite._id,
        intervalStr: watcher.resolved.intervalStr,
        collecting: watcher.resolved.active,
        nextRunAt: watcher.resolved.nextRunAt,
      })),
    };
  },
});

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/** Add one of a company's own websites. */
export const addCompanyWebsite = superAdminMutation({
  args: { companyId: v.id("companies"), url: v.string() },
  returns: v.id("companyWebsites"),
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.companyId);
    if (!company) throw appError("NOT_FOUND", "Company not found");

    const identity = requireHost(args.url);
    const now = Date.now();
    const { websiteId, created } = await findOrCreateWebsite(ctx, identity, now);

    const existing = await ctx.db
      .query("companyWebsites")
      .withIndex("by_company_website", (q) =>
        q.eq("companyId", args.companyId).eq("websiteId", websiteId),
      )
      .first();
    if (existing) throw appError("CONFLICT", "This company already has that website.");

    const companyWebsiteId = await ctx.db.insert("companyWebsites", {
      companyId: args.companyId,
      websiteId,
      createdAt: now,
    });

    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: "ADD_COMPANY_WEBSITE",
      entityId: companyWebsiteId,
      entityType: "companyWebsites",
      companyId: args.companyId,
      // Whether this is new spend or joins a host already being fetched.
      metadata: JSON.stringify({ host: identity.host, websiteCreated: created }),
      timestamp: now,
    });

    return companyWebsiteId;
  },
});

/** Track a competitor against one of a company's websites. */
export const addTrackedCompetitor = superAdminMutation({
  args: { companyWebsiteId: v.id("companyWebsites"), url: v.string() },
  returns: v.id("trackedCompetitors"),
  handler: async (ctx, args) => {
    const companyWebsite = await ctx.db.get(args.companyWebsiteId);
    if (!companyWebsite) throw appError("NOT_FOUND", "Website not found");

    const identity = requireHost(args.url);
    const now = Date.now();

    // A website cannot be its own competitor. Easy to do by pasting the same
    // address twice, and meaningless if allowed.
    const parentWebsite = await ctx.db.get(companyWebsite.websiteId);
    if (parentWebsite?.host === identity.host) {
      throw appError("INVALID_INPUT", "A website cannot be its own competitor.");
    }

    const { websiteId, created } = await findOrCreateWebsite(ctx, identity, now);

    const existing = await ctx.db
      .query("trackedCompetitors")
      .withIndex("by_parent_website", (q) =>
        q.eq("companyWebsiteId", args.companyWebsiteId).eq("websiteId", websiteId),
      )
      .first();
    if (existing) throw appError("CONFLICT", "That competitor is already tracked against this website.");

    const competitorId = await ctx.db.insert("trackedCompetitors", {
      companyWebsiteId: args.companyWebsiteId,
      companyId: companyWebsite.companyId,
      websiteId,
      createdAt: now,
    });

    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: "ADD_TRACKED_COMPETITOR",
      entityId: competitorId,
      entityType: "trackedCompetitors",
      companyId: companyWebsite.companyId,
      metadata: JSON.stringify({
        host: identity.host,
        against: parentWebsite?.host,
        websiteCreated: created,
      }),
      timestamp: now,
    });

    return competitorId;
  },
});

/**
 * This website's own schedule, or absence meaning "follow the company".
 *
 * `refreshIntervalStr` is the same format `schedules.intervalStr` uses and is
 * edited with the same `ScheduleBuilder` control, so there is one schedule
 * vocabulary in the product rather than two. Passing `undefined` clears the
 * override and puts the website back to following — absence is what
 * inheritance is, so clearing is expressed as absence rather than as a null.
 */
export const setCompanyWebsiteSchedule = superAdminMutation({
  args: {
    id: v.id("companyWebsites"),
    refreshIntervalStr: v.optional(v.string()),
    collectionEnabled: v.optional(v.boolean()),
  },
  returns: v.id("companyWebsites"),
  handler: async (ctx, args) => {
    const companyWebsite = await ctx.db.get(args.id);
    if (!companyWebsite) throw appError("NOT_FOUND", "Website not found");

    const now = Date.now();
    await ctx.db.patch(args.id, {
      refreshIntervalStr: args.refreshIntervalStr,
      collectionEnabled: args.collectionEnabled,
      updatedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: "UPDATE_COMPANY_WEBSITE_SCHEDULE",
      entityId: args.id,
      entityType: "companyWebsites",
      companyId: companyWebsite.companyId,
      metadata: JSON.stringify({
        interval: args.refreshIntervalStr ?? "inherit",
        collecting: args.collectionEnabled ?? "inherit",
      }),
      timestamp: now,
    });

    return args.id;
  },
});

/**
 * Stop tracking a competitor against one website.
 *
 * The competitor's `websites` row and its data stay. Another company may still
 * be watching it, and even if nobody is, the data was paid for. Deleting a
 * website outright is a different action on All Websites, worded so the two
 * cannot be confused.
 */
export const removeTrackedCompetitor = superAdminMutation({
  args: { id: v.id("trackedCompetitors") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.id);
    if (!entry) throw appError("NOT_FOUND", "That competitor is not tracked here.");

    const website = await ctx.db.get(entry.websiteId);
    await ctx.db.delete(args.id);

    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: "REMOVE_TRACKED_COMPETITOR",
      entityId: args.id,
      entityType: "trackedCompetitors",
      companyId: entry.companyId,
      metadata: JSON.stringify({ host: website?.host }),
      timestamp: Date.now(),
    });

    return true;
  },
});

/**
 * Remove one of a company's websites, and the competitors tracked against it.
 *
 * The `websites` rows survive — this company's own and every rival's. What goes
 * is this company's interest in them.
 */
export const removeCompanyWebsite = superAdminMutation({
  args: { id: v.id("companyWebsites") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const companyWebsite = await ctx.db.get(args.id);
    if (!companyWebsite) throw appError("NOT_FOUND", "Website not found");

    const website = await ctx.db.get(companyWebsite.websiteId);
    await ctx.db.delete(args.id);
    await ctx.scheduler.runAfter(0, internal.websites.purgeCompanyWebsiteCompetitorsInternal, {
      companyWebsiteId: args.id,
    });

    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: "REMOVE_COMPANY_WEBSITE",
      entityId: args.id,
      entityType: "companyWebsites",
      companyId: companyWebsite.companyId,
      metadata: JSON.stringify({ host: website?.host }),
      timestamp: Date.now(),
    });

    return true;
  },
});

/** Add a host to the system without attaching it to anyone. */
export const createWebsite = superAdminMutation({
  args: { url: v.string() },
  returns: v.object({ websiteId: v.id("websites"), created: v.boolean() }),
  handler: async (ctx, args) => {
    const identity = requireHost(args.url);
    const now = Date.now();
    const { websiteId, created } = await findOrCreateWebsite(ctx, identity, now);

    if (created) {
      await ctx.db.insert("auditLogs", {
        actorId: ctx.userId,
        actionType: "CREATE_WEBSITE",
        entityId: websiteId,
        entityType: "websites",
        metadata: JSON.stringify({ host: identity.host }),
        timestamp: now,
      });
    }

    return { websiteId, created };
  },
});

/**
 * Delete a website, its data, and every company's hold on it.
 *
 * This is the sharp edge of a shared record: one delete can strip a competitor
 * out of three clients' setups at once. The screen names them before it
 * happens and the audit entry keeps that list, so a super admin may still go
 * ahead — what they may not do is find out afterwards.
 */
export const deleteWebsite = superAdminMutation({
  args: { id: v.id("websites") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const website = await ctx.db.get(args.id);
    if (!website) throw appError("NOT_FOUND", "Website not found");

    const now = Date.now();
    const watchers = await loadWatchers(ctx, args.id);
    const affected = watchers.map((watcher) => ({
      companyName: watcher.company?.name ?? "Unknown company",
      relationship: watcher.relationship,
      against: watcher.againstHost,
    }));

    await ctx.db.delete(args.id);
    await ctx.scheduler.runAfter(0, internal.websites.purgeWebsiteHoldingsInternal, {
      websiteId: args.id,
    });

    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: "DELETE_WEBSITE",
      entityId: args.id,
      entityType: "websites",
      metadata: JSON.stringify({ host: website.host, affected }),
      timestamp: now,
    });

    return true;
  },
});

// ---------------------------------------------------------------------------
// Sweeps
// ---------------------------------------------------------------------------

/**
 * Everything pointing at a deleted website.
 *
 * A company website row going means its own competitors go too, so this
 * reschedules until both tables are clear rather than assuming one pass.
 */
export const purgeWebsiteHoldingsInternal = internalMutation({
  args: { websiteId: v.id("websites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owners = await ctx.db
      .query("companyWebsites")
      .withIndex("by_website", (q) => q.eq("websiteId", args.websiteId))
      .take(ENTRY_PURGE_BATCH);

    for (const owner of owners) {
      await ctx.db.delete(owner._id);
      await ctx.scheduler.runAfter(0, internal.websites.purgeCompanyWebsiteCompetitorsInternal, {
        companyWebsiteId: owner._id,
      });
    }

    const rivals = await ctx.db
      .query("trackedCompetitors")
      .withIndex("by_website", (q) => q.eq("websiteId", args.websiteId))
      .take(ENTRY_PURGE_BATCH);

    for (const rival of rivals) await ctx.db.delete(rival._id);

    if (owners.length === ENTRY_PURGE_BATCH || rivals.length === ENTRY_PURGE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.websites.purgeWebsiteHoldingsInternal, {
        websiteId: args.websiteId,
      });
    }
    return null;
  },
});

/** Competitors left behind by a removed company website. */
export const purgeCompanyWebsiteCompetitorsInternal = internalMutation({
  args: { companyWebsiteId: v.id("companyWebsites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("trackedCompetitors")
      .withIndex("by_company_website", (q) => q.eq("companyWebsiteId", args.companyWebsiteId))
      .take(ENTRY_PURGE_BATCH);

    for (const row of rows) await ctx.db.delete(row._id);

    if (rows.length === ENTRY_PURGE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.websites.purgeCompanyWebsiteCompetitorsInternal, {
        companyWebsiteId: args.companyWebsiteId,
      });
    }
    return null;
  },
});

/** A deleted company's websites and competitors. The `websites` rows survive it. */
export const purgeCompanyWebsitesInternal = internalMutation({
  args: { companyId: v.id("companies") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rivals = await ctx.db
      .query("trackedCompetitors")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .take(ENTRY_PURGE_BATCH);
    for (const rival of rivals) await ctx.db.delete(rival._id);

    const owned = await ctx.db
      .query("companyWebsites")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .take(ENTRY_PURGE_BATCH);
    for (const row of owned) await ctx.db.delete(row._id);

    if (rivals.length === ENTRY_PURGE_BATCH || owned.length === ENTRY_PURGE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.websites.purgeCompanyWebsitesInternal, {
        companyId: args.companyId,
      });
    }
    return null;
  },
});

// ---------------------------------------------------------------------------
// Writing — the names a site goes by, and where a company watches it from
// ---------------------------------------------------------------------------

/**
 * Set the names this website is known by.
 *
 * **Super admin only, and deliberately so.** The list sits on the shared
 * `websites` row, so one operator editing it changes what every company
 * tracking that host sees. Anthony, 2026-09-21: *"let's make it super admin for
 * now as I don't fully understand it yet."* Every edit is audited, including
 * what the list was before, because a shared record that someone blanked needs
 * to be recoverable from the trail rather than from memory.
 *
 * It is on the website rather than on a company's hold of it because two
 * companies would not disagree: anyone tracking a host writes down the same
 * names for it. The dedupe rule's test is disagreement, not ownership.
 */
export const setWebsiteBrandNames = superAdminMutation({
  args: {
    websiteId: v.id("websites"),
    names: v.array(v.object({
      name: v.string(),
      isPrimary: v.optional(v.boolean()),
    })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const website = await ctx.db.get(args.websiteId);
    if (!website) throw appError("NOT_FOUND", "That website no longer exists.");

    const read = readBrandNames(args.names);
    if (!read.ok) throw appError("INVALID_INPUT", BRAND_NAME_MESSAGES[read.problem]);

    const now = Date.now();
    await ctx.db.patch(args.websiteId, { brandNames: read.names });

    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: "SET_WEBSITE_BRAND_NAMES",
      entityId: args.websiteId,
      entityType: "websites",
      // Both sides of the change: this list is shared, so an edit that removed
      // somebody else's name has to be readable afterwards.
      metadata: JSON.stringify({
        host: website.host,
        before: (website.brandNames ?? []).map((entry) => entry.name),
        after: read.names.map((entry) => entry.name),
      }),
      timestamp: now,
    });

    return null;
  },
});

/**
 * Set where this company watches this website from.
 *
 * On the hold rather than on the website, and unlike brand names this really is
 * per-company: a London agency and a Manchester one tracking the same host care
 * about different places.
 *
 * Absent means the registry's own default, which is the United Kingdom. Clearing
 * it is how a company goes back to that, so `null` is a real instruction here
 * rather than a missing argument.
 */
export const setCompanyWebsiteLocation = superAdminMutation({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    locationCode: v.union(v.number(), v.null()),
    locationLabel: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const companyWebsite = await ctx.db.get(args.companyWebsiteId);
    if (!companyWebsite) throw appError("NOT_FOUND", "That website is no longer held by this company.");

    const label = args.locationLabel?.trim();
    if (args.locationCode !== null && !label) {
      throw appError("INVALID_INPUT", "Pick a place from the list so its name can be shown.");
    }

    await ctx.db.patch(args.companyWebsiteId, {
      locationCode: args.locationCode ?? undefined,
      locationLabel: args.locationCode === null ? undefined : label,
      updatedAt: Date.now(),
    });

    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: "SET_COMPANY_WEBSITE_LOCATION",
      entityId: args.companyWebsiteId,
      entityType: "companyWebsites",
      companyId: companyWebsite.companyId,
      metadata: JSON.stringify({ locationCode: args.locationCode, locationLabel: label ?? null }),
      timestamp: Date.now(),
    });

    return null;
  },
});


/**
 * Resolve hosts to the website records they name.
 *
 * Here rather than at the call site because the tenancy guard allows exactly
 * two files to read the `websites` table, and that narrowness is the point: the
 * leak it prevents is a query that starts from a shared record and walks
 * outward to its watchers. This walks nowhere — it turns a host into an id so a
 * bulk result can be filed against the right site — but the rule is structural
 * on purpose, because a rule with exceptions is a rule nobody can check.
 *
 * A host with no record is simply absent from the answer. Filing a number
 * against the wrong website would be worse than filing none.
 */
export async function resolveWebsiteIdsByHost(
  ctx: QueryCtx | MutationCtx,
  hosts: readonly string[],
): Promise<Map<string, Id<"websites">>> {
  const found = new Map<string, Id<"websites">>();

  for (const host of hosts) {
    if (found.has(host)) continue;
    const website = await ctx.db
      .query("websites")
      .withIndex("by_host", (q) => q.eq("host", host))
      .unique();
    if (website) found.set(host, website._id);
  }

  return found;
}


/**
 * Every website that has brand names, for matching an AI answer against.
 *
 * This is the read that makes one purchase serve every watcher: an answer
 * names whoever it names, and we look for every name we know. Here rather than
 * in the parse path for the same reason as `resolveWebsiteIdsByHost` — the
 * tenancy guard allows exactly two files to read this table, and it walks
 * nowhere towards a watcher.
 *
 * Bounded, and by a number that is a ceiling on the platform's tracked estate
 * rather than on this feature. When the estate outgrows it, the answer is an
 * index on "has brand names", not a bigger number.
 */
export async function listBrandedWebsites(
  ctx: QueryCtx | MutationCtx,
  limit: number,
): Promise<Array<{ _id: Id<"websites">; host: string; brandNames: NonNullable<Doc<"websites">["brandNames"]> }>> {
  const rows = await ctx.db.query("websites").take(limit);
  return rows
    .filter((row): row is Doc<"websites"> & { brandNames: NonNullable<Doc<"websites">["brandNames"]> } =>
      Array.isArray(row.brandNames) && row.brandNames.length > 0)
    .map((row) => ({ _id: row._id, host: row.host, brandNames: row.brandNames }));
}


/**
 * Branded websites, for an action that has to match an AI answer against them.
 *
 * A thin wrapper over `listBrandedWebsites` because the matching now happens in
 * an action — it has to, so the stance Decision can be asked about each hit
 * before anything is written. The answer text therefore never reaches a
 * mutation at all, which is a stronger version of the rule that none of it is
 * stored.
 */
export const listBrandedWebsitesInternal = internalQuery({
  args: { limit: v.number() },
  returns: v.array(v.object({
    websiteId: v.id("websites"),
    host: v.string(),
    brandNames: v.array(v.object({
      name: v.string(),
      isPrimary: v.boolean(),
      kind: v.optional(v.union(v.literal("NAME"), v.literal("MISSPELLING"))),
    })),
  })),
  handler: async (ctx, args) => {
    const rows = await listBrandedWebsites(ctx, args.limit);
    return rows.map((row) => ({ websiteId: row._id, host: row.host, brandNames: row.brandNames }));
  },
});
