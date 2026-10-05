import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

import { internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { superAdminMutation, superAdminQuery } from "./tenantFunctions";
import { appError } from "./utils/appError";
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
import { anyCompanyOwns, isTrackedHold, pairedOwnedHold, refuseIfPaired } from "./utils/websitePairing";
import { countOpenMoves, purgeHoldMoves } from "./websiteMoves";
import { noteGroupGapsChanged, requestGroupGapRebuilds } from "./siteRankings";
import { noteHoldPagesChanged } from "./holdPages";
import { requestListRecount } from "./siteListAi";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { purgeHoldDataLimits, readCompanyDataLimits, resolveSiteDataLimits } from "./companyDataLimits";
import { purgeHoldFanOutLimits } from "./fanOutLimits";
import { purgeHoldClassifications } from "./pageClassifications";
import { purgeHoldProfile } from "./holdProfiles";
import { forgetWebsiteIcon, iconAnswered, requestWebsiteIcon, websiteIconUrl } from "./websiteIcons";

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
      What attaching to a known host gets you, said before you press the button:
      the history somebody else already paid for. Not the searches and
      questions — they are each company's own, and how many another company
      has is not this one's to know (docs/plans/active/private-tracking-lists-plan.md).
    */
    const firstDay = await ctx.db.query("seoWebsiteMetrics")
      .withIndex("by_website_day", (q) => q.eq("websiteId", existing._id))
      .order("asc").first();

    return {
      ok: true as const,
      host: result.host,
      displayHost: result.displayHost,
      alreadyKnown: true,
      inherits: {
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
  // Its icon, for the Sites lists — looked for once, here, for everyone.
  await requestWebsiteIcon(ctx, websiteId);
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

/** One row of a company's websites list, with its schedule and limits resolved against the company's. */
async function companyWebsiteRow(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  schedule: Doc<"schedules"> | null,
  companyLimits: Awaited<ReturnType<typeof readCompanyDataLimits>>,
  companyWebsite: Doc<"companyWebsites">,
) {
  const website = await ctx.db.get(companyWebsite.websiteId);
  const pair = await pairedOwnedHold(ctx, companyWebsite);
  const against = pair ? await ctx.db.get(pair.websiteId) : null;
  // A paired tracked site runs when its pair does, so that is the date
  // its row shows — and says why, rather than implying a schedule of its own.
  const resolved = resolveWebsiteSchedule(schedule, pair ?? companyWebsite);
  const counts = companyWebsite.relationship === "TRACKED"
    ? { competitorCount: 0, competitorCountIsCapped: false }
    : await countCompetitors(ctx, companyId, companyWebsite.websiteId);
  const movesWaiting = companyWebsite.relationship === "TRACKED"
    ? 0
    : await countOpenMoves(ctx, companyWebsite._id);

  return {
    ...companyWebsite,
    host: website?.host ?? "",
    displayHost: website?.displayHost ?? "",
    iconUrl: await websiteIconUrl(ctx, website?._id),
    againstHost: against?.displayHost ?? null,
    ...counts,
    movesWaiting,
    collecting: resolved.active,
    scheduleSource: pair ? ("PAIR" as const) : resolved.source,
    nextRunAt: resolved.nextRunAt,
    limits: await resolveSiteDataLimits(ctx, companyLimits, companyWebsite._id),
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
    const companyLimits = await readCompanyDataLimits(ctx, args.companyId);
    const page = await ctx.db
      .query("companyWebsites")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .order("desc")
      .paginate(args.paginationOpts);

    const rows = await Promise.all(
      page.page.map((companyWebsite) => companyWebsiteRow(ctx, args.companyId, schedule, companyLimits, companyWebsite)),
    );

    return { ...page, page: rows };
  },
});

/** Websites one company holds, read whole for its list: more than any company holds. */
const MAX_LISTED_HOLDS = 200;

/**
 * Every website a company holds, whole, in the order the Websites section
 * lists them (docs/plans/active/websites-section-menu-plan.md): its own sites
 * in the order it added them, each followed by the competitors watched against
 * it, then the competitors watched on their own. Read whole so the list can be
 * grouped; the screen pages it, fifteen rows at a time.
 */
export const listCompanyWebsiteRows = superAdminQuery({
  args: { companyId: v.id("companies") },
  returns: v.object({ rows: v.array(websiteShapes.companyWebsiteRow), cut: v.boolean() }),
  handler: async (ctx, args) => {
    const schedule = await companySchedule(ctx, args.companyId);
    const companyLimits = await readCompanyDataLimits(ctx, args.companyId);
    const holds = await ctx.db
      .query("companyWebsites")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .take(MAX_LISTED_HOLDS + 1);
    const rows = await Promise.all(
      holds.slice(0, MAX_LISTED_HOLDS).map((hold) => companyWebsiteRow(ctx, args.companyId, schedule, companyLimits, hold)),
    );
    return { rows: inSectionOrder(rows), cut: holds.length > MAX_LISTED_HOLDS };
  },
});

/**
 * The websites a company holds, as the Websites section's chooser offers them
 * (docs/plans/active/websites-section-menu-plan.md): each own site followed by
 * the competitors watched against it, then those watched on their own. Light
 * — a host and a pairing each — because every page in the section asks.
 */
export const listWebsiteChoices = superAdminQuery({
  args: { companyId: v.id("companies") },
  returns: v.array(v.object({
    companyWebsiteId: v.id("companyWebsites"),
    host: v.string(),
    relationship: v.union(v.literal("OWNED"), v.literal("TRACKED")),
    /** For a competitor watched against one of the company's own sites: that site. */
    againstCompanyWebsiteId: v.union(v.id("companyWebsites"), v.null()),
    againstHost: v.union(v.string(), v.null()),
    /** The website's icon (`websiteIcons.ts`), or null to draw its letter. */
    iconUrl: v.union(v.string(), v.null()),
  })),
  handler: async (ctx, args) => {
    const holds = await ctx.db
      .query("companyWebsites")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .take(MAX_LISTED_HOLDS);
    const rows = await Promise.all(holds.map(async (hold) => {
      const website = await ctx.db.get(hold.websiteId);
      return { ...hold, displayHost: website?.displayHost ?? "", iconUrl: await websiteIconUrl(ctx, hold.websiteId) };
    }));
    const ownedByWebsite = new Map(rows.filter((row) => !isTrackedHold(row)).map((row) => [row.websiteId, row]));
    return inSectionOrder(rows).map((row) => {
      const against = isTrackedHold(row) && row.againstWebsiteId ? ownedByWebsite.get(row.againstWebsiteId) ?? null : null;
      return {
        companyWebsiteId: row._id,
        host: row.displayHost,
        relationship: isTrackedHold(row) ? ("TRACKED" as const) : ("OWNED" as const),
        againstCompanyWebsiteId: against?._id ?? null,
        againstHost: against?.displayHost ?? null,
        iconUrl: row.iconUrl,
      };
    });
  },
});

type SectionRow = {
  _creationTime: number;
  websiteId: Id<"websites">;
  relationship?: "OWNED" | "TRACKED";
  againstWebsiteId?: Id<"websites">;
  displayHost: string;
};

/**
 * A company's websites in the order the section lists them: each own site
 * (oldest first) followed by the competitors watched against it, by name,
 * then the competitors watched on their own.
 */
export function inSectionOrder<Row extends SectionRow>(rows: readonly Row[]): Row[] {
  const owned = rows
    .filter((row) => row.relationship !== "TRACKED")
    .sort((left, right) => left._creationTime - right._creationTime);
  const tracked = rows
    .filter((row) => row.relationship === "TRACKED")
    .sort((left, right) => left.displayHost.localeCompare(right.displayHost));
  const ownedWebsites = new Set(owned.map((row) => row.websiteId));
  return [
    ...owned.flatMap((own) => [own, ...tracked.filter((row) => row.againstWebsiteId === own.websiteId)]),
    ...tracked.filter((row) => !row.againstWebsiteId || !ownedWebsites.has(row.againstWebsiteId)),
  ];
}

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
          iconUrl: await websiteIconUrl(ctx, website._id),
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
      iconUrl: await websiteIconUrl(ctx, website._id),
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
    await purgeHoldDataLimits(ctx, args.id);
    await purgeHoldFanOutLimits(ctx, args.id);
    await purgeHoldClassifications(ctx, args.id);
    await purgeHoldProfile(ctx, args.id);
    // The company's own searches, questions and AI lines for it go too; what
    // was collected stays with the website (docs/plans/active/
    // private-tracking-lists-plan.md, V9).
    await ctx.scheduler.runAfter(0, internal.websitePurge.purgeHoldListsInternal, { companyWebsiteId: args.id });
    // Its Search Console connection and figures are the company's alone, and go too, as do its fan-out angles.
    await ctx.scheduler.runAfter(0, internal.searchConsoleConnect.forgetHold, { companyWebsiteId: args.id });
    await ctx.scheduler.runAfter(0, internal.fanOutAngles.purgeHoldAngles, { holdId: args.id });
    // Its every page once (Your pages) goes with it.
    await ctx.scheduler.runAfter(0, internal.holdPages.purgeHoldPages, { holdId: args.id });
    // The hold's content gap goes with it; a rival that goes changes the gap
    // of the site it was tracked against.
    await ctx.scheduler.runAfter(0, internal.siteContentGap.purgeHoldGaps, { companyWebsiteId: args.id });
    const pairedWith = await pairedOwnedHold(ctx, companyWebsite);
    await ctx.db.delete(args.id);
    if (pairedWith) {
      await requestGroupGapRebuilds(ctx, pairedWith);
      // Nor is it counted in the answers to that site's questions any more.
      await requestListRecount(ctx, pairedWith._id);
    }

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
    await forgetWebsiteIcon(ctx, args.id);
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

/** Gap between the websites one icon backfill batch asks about, so the requests are spread out. */
const ICON_BACKFILL_SPACING_MS = 200;

/**
 * Asks for the icon of every website never asked about: those added before
 * icons were looked for (`websiteIcons.ts`, migration
 * `2026-10-01-website-icons`). Here because only this file reads the whole
 * table (`websiteTenancyGuard.test.ts`). Safe to run again — a website
 * already answered is skipped here, and again by the request itself.
 */
export async function requestMissingIcons(
  ctx: MutationCtx,
  cursor: string | null,
  batchSize: number,
): Promise<{ cursor: string | null; isDone: boolean; processed: number; updated: number }> {
  const page = await ctx.db.query("websites").paginate({ cursor, numItems: batchSize });
  const unasked: Doc<"websites">[] = [];
  for (const website of page.page) {
    if (!(await iconAnswered(ctx, website._id))) unasked.push(website);
  }
  for (const [index, website] of unasked.entries()) {
    await requestWebsiteIcon(ctx, website._id, index * ICON_BACKFILL_SPACING_MS);
  }
  return { cursor: page.isDone ? null : page.continueCursor, isDone: page.isDone, processed: page.page.length, updated: unasked.length };
}

/**
 * A page of the websites no company holds as its own, for the clean-out of
 * what competitors no longer have collected (`seoCleanOut.ts`, finish-off
 * plan item 12). Here because only this file reads the whole table
 * (`websiteTenancyGuard.test.ts`).
 */
export async function competitorOnlyWebsites(
  ctx: QueryCtx,
  cursor: string | null,
  batchSize: number,
): Promise<{ websites: Array<{ websiteId: Id<"websites">; host: string }>; continueCursor: string; isDone: boolean }> {
  const page = await ctx.db.query("websites").paginate({ cursor, numItems: batchSize });
  const websites: Array<{ websiteId: Id<"websites">; host: string }> = [];
  for (const website of page.page) {
    if (!(await anyCompanyOwns(ctx, website._id))) websites.push({ websiteId: website._id, host: website.displayHost ?? website.host });
  }
  return { websites, continueCursor: page.continueCursor, isDone: page.isDone };
}

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
    // Its questions are answered from the new place: its AI figures are those answers'.
    if (!isTrackedHold(companyWebsite)) {
      await requestListRecount(ctx, args.companyWebsiteId);
      // Its group's gaps and its Your pages read rankings from the place: rebuilt that night (dataforseo-cost-plan.md, A1).
      await noteGroupGapsChanged(ctx, companyWebsite);
      await noteHoldPagesChanged(ctx, args.companyWebsiteId);
    }

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


/** Host to website id, for an action that must resolve before it judges. */
export const resolveWebsiteIdsByHostInternal = internalQuery({
  args: { hosts: v.array(v.string()) },
  returns: v.array(v.object({ host: v.string(), websiteId: v.id("websites") })),
  handler: async (ctx, args) => {
    const found = await resolveWebsiteIdsByHost(ctx, args.hosts);
    return [...found.entries()].map(([host, websiteId]) => ({ host, websiteId }));
  },
});
