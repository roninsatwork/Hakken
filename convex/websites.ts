import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

import { internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { superAdminMutation, superAdminQuery } from "./tenantFunctions";
import { appError } from "./utils/appError";
import {
  BRAND_NAME_MESSAGES,
  readBrandNames,
} from "./utils/websiteBrands";
import {
  WEBSITE_IDENTITY_MESSAGES,
  readWebsiteHost,
  type WebsiteIdentity,
} from "./websiteIdentity";
import {
  assertSeoInterval,
  resolveWebsiteSchedule,
  soonestPull,
  type ResolvedWebsiteSchedule,
} from "./seoScheduleService";
import * as websiteShapes from "./utils/websiteShapes";
import { pairedOwnedHold, refuseIfPaired } from "./utils/websitePairing";
import { countOpenMoves, purgeHoldMoves } from "./websiteMoves";
import { requestGroupGapRebuilds } from "./siteRankings";
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

const WATCHER_LIMIT = 500;

/**
 * Watchers read per row of the global list.
 *
 * The list says how many companies hold a host and when it is next pulled; it
 * does not need all five hundred to say "a lot". Fifteen rows of a popular
 * host each read every watcher, its company, its schedule and its pair, which
 * is thousands of documents for one page. The host's own record still reads
 * them all.
 */
const LIST_WATCHER_LIMIT = 100;
/** The most competitors counted per website before the list says "100+". */
const COMPETITOR_COUNT_LIMIT = 100;

// ---------------------------------------------------------------------------
// Reading a host
// ---------------------------------------------------------------------------

export function requireHost(raw: string): WebsiteIdentity {
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

/** Enough to say "lots" without reading a whole host's list to say it. */
const INHERITED_CAP = 200;

/**
 * What an add form is told before anything is written.
 *
 * Echoing the key back is not decoration: pasting a shop's URL and getting
 * `example.com` rather than `shop.example.com` is the only moment someone can
 * notice they are about to track the wrong thing. It also says whether the host
 * is one Hakken already holds — and, when it is, what the client inherits by
 * attaching to it, which is the best thing that can happen on this form.
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
    if (!existing) {
      return {
        ok: true as const,
        host: result.host,
        displayHost: result.displayHost,
        alreadyKnown: false,
      };
    }

    /*
      What attaching to a known host gets you, said before you press the button.

      This case used to be a footnote about not fetching twice — true, and the
      least interesting thing about it. Under the host's own lists it is the
      best thing that can happen on this form: the client starts with the
      searches, the questions and the history somebody else already paid for.
    */
    const [keywords, questions, rivals, firstDay] = await Promise.all([
      ctx.db.query("websiteKeywords")
        .withIndex("by_website", (q) => q.eq("websiteId", existing._id)).take(INHERITED_CAP),
      ctx.db.query("websiteQuestions")
        .withIndex("by_website", (q) => q.eq("websiteId", existing._id)).take(INHERITED_CAP),
      ctx.db.query("websiteRivals")
        .withIndex("by_website", (q) => q.eq("websiteId", existing._id)).take(INHERITED_CAP),
      ctx.db.query("seoWebsiteMetrics")
        .withIndex("by_website_day", (q) => q.eq("websiteId", existing._id))
        .order("asc").first(),
    ]);

    return {
      ok: true as const,
      host: result.host,
      displayHost: result.displayHost,
      alreadyKnown: true,
      inherits: {
        keywords: keywords.length,
        questions: questions.length,
        rivals: rivals.length,
        // From the first day anything was collected, not from first-seen: a
        // host added and never pulled has no history to inherit.
        weeksOfHistory: firstDay
          ? Math.max(0, Math.floor(
            (Date.now() - Date.parse(`${firstDay.day}T00:00:00Z`)) / (7 * 24 * 60 * 60 * 1000),
          ))
          : 0,
      },
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
export async function findOrCreateWebsite(
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
  limit: number = WATCHER_LIMIT,
  /** Company schedules already read on this request: one company watches many hosts. */
  schedules: Map<Id<"companies">, Doc<"schedules"> | null> = new Map(),
): Promise<WatcherFacts[]> {
  /*
    Every company attached to this host, owned or tracked, from one table.

    It read two for a while — holders here, and a competition graph for the
    rivals — which is how a rivalry one company asserted came to look like
    another company watching. Whether a company watches this host is written on
    its own attachment and nowhere else.
  */
  const attachments = await ctx.db
    .query("companyWebsites")
    .withIndex("by_website", (q) => q.eq("websiteId", websiteId))
    .take(limit);

  const scheduleOf = async (companyId: Id<"companies">) => {
    if (!schedules.has(companyId)) schedules.set(companyId, await companySchedule(ctx, companyId));
    return schedules.get(companyId) ?? null;
  };

  const watchers = await Promise.all(
    attachments.map(async (companyWebsite) => {
      const company = await ctx.db.get(companyWebsite.companyId);
      const schedule = await scheduleOf(companyWebsite.companyId);
      // Absent reads as owned: every row written before the flag existed was a
      // company's own website.
      const isTracked = companyWebsite.relationship === "TRACKED";
      const pair = await pairedOwnedHold(ctx, companyWebsite);
      const against = pair ? await ctx.db.get(pair.websiteId) : null;

      return {
        key: companyWebsite._id,
        companyWebsite,
        company,
        relationship: isTracked ? ("TRACKED" as const) : ("OWNED" as const),
        againstHost: against?.displayHost ?? null,
        /*
          A paired tracked site is collected on its pair's day — numbers pulled
          in different weeks are not a comparison — so its rate *is* the pair's,
          and that is what resolves here. Unpaired, it follows its own settings
          like any hold.
        */
        resolved: resolveWebsiteSchedule(schedule, pair ?? companyWebsite),
      };
    }),
  );

  return watchers;
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

/**
 * How many sites this company watches against one of its own.
 *
 * The company's own attachments, not the host's competition graph: the graph
 * says who competes with whom, which is everybody's to read, and this column is
 * about what *this* company chose to watch.
 */
async function countCompetitors(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  againstWebsiteId: Id<"websites">,
) {
  // By the pairing index rather than the company's holds filtered afterwards:
  // a take before a filter counts the first hundred holds, not the first
  // hundred rivals, and a company with many sites would read as having none.
  const rows = (await ctx.db
    .query("companyWebsites")
    .withIndex("by_company_against", (q) =>
      q.eq("companyId", companyId).eq("againstWebsiteId", againstWebsiteId))
    .take(COMPETITOR_COUNT_LIMIT + 1))
    .filter((row) => row.relationship === "TRACKED");

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
        const pair = await pairedOwnedHold(ctx, companyWebsite);
        const against = pair ? await ctx.db.get(pair.websiteId) : null;
        // A paired tracked site runs when its pair does, so that is the date
        // its row shows — and says why, rather than implying a schedule of its own.
        const resolved = resolveWebsiteSchedule(schedule, pair ?? companyWebsite);
        const counts = companyWebsite.relationship === "TRACKED"
          ? { competitorCount: 0, competitorCountIsCapped: false }
          : await countCompetitors(ctx, args.companyId, companyWebsite.websiteId);
        const movesWaiting = companyWebsite.relationship === "TRACKED"
          ? 0
          : await countOpenMoves(ctx, companyWebsite._id);

        return {
          ...companyWebsite,
          host: website?.host ?? "",
          displayHost: website?.displayHost ?? "",
          againstHost: against?.displayHost ?? null,
          ...counts,
          movesWaiting,
          collecting: resolved.active,
          scheduleSource: pair ? ("PAIR" as const) : resolved.source,
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

    const [website, company, schedule, pair] = await Promise.all([
      ctx.db.get(companyWebsite.websiteId),
      ctx.db.get(companyWebsite.companyId),
      companySchedule(ctx, companyWebsite.companyId),
      pairedOwnedHold(ctx, companyWebsite),
    ]);
    const pairSite = pair ? await ctx.db.get(pair.websiteId) : null;
    // Paired, the pair's settings are the ones that run, so they are the
    // effective ones — the screen says so instead of offering its own.
    const resolved = resolveWebsiteSchedule(schedule, pair ?? companyWebsite);

    return {
      ...companyWebsite,
      host: website?.host ?? "",
      displayHost: website?.displayHost ?? "",
      companyName: company?.name ?? null,
      pairedWith: pair && pairSite
        ? {
          companyWebsiteId: pair._id,
          websiteId: pair.websiteId,
          displayHost: pairSite.displayHost,
          locationLabel: pair.locationLabel ?? null,
        }
        : null,
      /** The company's own schedule, so the screen can show what is inherited. */
      companyIntervalStr: schedule?.intervalStr ?? null,
      companyScheduleActive: schedule?.isActive ?? false,
      effective: {
        active: resolved.active,
        intervalStr: resolved.intervalStr,
        source: pair ? ("PAIR" as const) : resolved.source,
        nextRunAt: resolved.nextRunAt,
      },
    };
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

    // One schedule per company across the whole page, however many of these
    // hosts it watches.
    const schedules = new Map<Id<"companies">, Doc<"schedules"> | null>();
    const rows = await Promise.all(
      page.page.map(async (website) => {
        const watchers = await loadWatchers(ctx, website._id, LIST_WATCHER_LIMIT, schedules);
        const companies = new Set(watchers.map((watcher) => watcher.companyWebsite.companyId));

        return {
          ...website,
          watcherCount: watchers.length,
          watchersCapped: watchers.length >= LIST_WATCHER_LIMIT,
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
      relationship: "OWNED",
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
    await refuseIfPaired(ctx, companyWebsite, "schedule");

    // Checked here and not only in the screen. This mutation took whatever the
    // old generic builder produced — including an hourly pull and a list of
    // exact times, both of which are money on a per-call service.
    if (args.refreshIntervalStr) assertSeoInterval(args.refreshIntervalStr);

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
 * Remove one of a company's websites.
 *
 * The `websites` row survives, and so does the host's competition graph: who a
 * site competes with is a fact about the market, not about this company's
 * interest in it. What goes is only the hold.
 */
export const removeCompanyWebsite = superAdminMutation({
  args: { id: v.id("companyWebsites") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const companyWebsite = await ctx.db.get(args.id);
    if (!companyWebsite) throw appError("NOT_FOUND", "Website not found");

    const website = await ctx.db.get(companyWebsite.websiteId);
    await purgeHoldMoves(ctx, args.id);
    // The hold's content gap goes with it; a rival that goes changes the gap
    // of the site it was tracked against.
    await ctx.scheduler.runAfter(0, internal.siteContentGap.purgeHoldGaps, { companyWebsiteId: args.id });
    const pairedWith = await pairedOwnedHold(ctx, companyWebsite);
    await ctx.db.delete(args.id);
    if (pairedWith) await requestGroupGapRebuilds(ctx, pairedWith);

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
    // The host's own lists go with it, as well as everyone's hold on it.
    await ctx.scheduler.runAfter(0, internal.websitePurge.purgeWebsiteListsInternal, {
      websiteId: args.id,
    });
    await ctx.scheduler.runAfter(0, internal.websitePurge.purgeWebsiteHoldingsInternal, {
      websiteId: args.id,
    });
    // And everything collected about it: rankings, metrics, summaries, AI
    // mentions and the DataForSEO answers themselves.
    await ctx.scheduler.runAfter(0, internal.websitePurge.purgeWebsiteCollectedDataInternal, {
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
    await ctx.db.patch(args.websiteId, { brandNames: read.names, hasBrandNames: read.names.length > 0 });

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
    await refuseIfPaired(ctx, companyWebsite, "place");

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
  // Through the flag's index: only sites with names are read at all, so the
  // ceiling is on branded sites rather than on every site ever added.
  const rows = await ctx.db
    .query("websites")
    .withIndex("by_has_brand_names", (q) => q.eq("hasBrandNames", true))
    .take(limit);
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


/** Host to website id, for an action that must resolve before it judges. */
export const resolveWebsiteIdsByHostInternal = internalQuery({
  args: { hosts: v.array(v.string()) },
  returns: v.array(v.object({ host: v.string(), websiteId: v.id("websites") })),
  handler: async (ctx, args) => {
    const found = await resolveWebsiteIdsByHost(ctx, args.hosts);
    return [...found.entries()].map(([host, websiteId]) => ({ host, websiteId }));
  },
});

/**
 * Writing down which websites have brand names, for the index the answer
 * parser now reads. Idempotent: a row whose flag already says the truth is
 * left alone.
 *
 * Here rather than beside the other backfills because it reads the `websites`
 * table, and the tenancy guard allows exactly two files to — this one owns the
 * records. It walks every host and names no watcher.
 */
export async function backfillBrandedFlag(
  ctx: MutationCtx,
  cursor: string | null,
  batchSize: number,
): Promise<{ cursor: string | null; isDone: boolean; processed: number; updated: number }> {
  const page = await ctx.db.query("websites").paginate({ numItems: batchSize, cursor });
  let updated = 0;
  for (const website of page.page) {
    const branded = (website.brandNames?.length ?? 0) > 0;
    if (website.hasBrandNames === branded) continue;
    await ctx.db.patch(website._id, { hasBrandNames: branded });
    updated += 1;
  }
  return {
    cursor: page.isDone ? null : page.continueCursor,
    isDone: page.isDone,
    processed: page.page.length,
    updated,
  };
}
