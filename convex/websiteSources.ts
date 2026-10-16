import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { superAdminMutation, superAdminQuery } from "./tenantFunctions";
import { appError } from "./utils/appError";
import { isTrackedHold, pairedOwnedHold } from "./utils/websitePairing";
import { companyCollectionSchedule, resolveWebsiteSchedule } from "./seoScheduleService";
import { lastCollectedAt } from "./seoCollectionDue";
import { CLARITY_COLLECTOR } from "./utils/clarityCollectorAgent";

/**
 * Everything Hakken collects for one website, and the switch for each
 * (docs/plans/active/website-schedules-plan.md): what Admin → a website →
 * Schedules shows. Rankings and AI answers are bought on the company's
 * schedule (DataForSEO); Search Console, Google Analytics, Bing Webmaster and
 * Clarity are free and collected every day once connected, each by its own
 * collector.
 *
 * **The company's switch is the master** (WS5). The DataForSEO Planner plans
 * only companies whose switch is on (`seoAgentRuns.listCollectingCompanies`),
 * so a website whose own switch is on still collects nothing while its
 * company's is off. `resolveWebsiteSchedule` says so, and this reads it.
 *
 * **Off keeps everything** (WS4): a free source switched off stays connected,
 * with everything held, and its collector skips it (`switchedOff` on its
 * connection) until it is switched on again.
 */

export const SOURCES = ["SEARCH_CONSOLE", "GOOGLE_ANALYTICS", "BING", "CLARITY"] as const;
export type Source = (typeof SOURCES)[number];
const sourceValidator = v.union(v.literal("SEARCH_CONSOLE"), v.literal("GOOGLE_ANALYTICS"), v.literal("BING"), v.literal("CLARITY"));

const SOURCE_NAMES: Record<Source, string> = {
  SEARCH_CONSOLE: "Search Console",
  GOOGLE_ANALYTICS: "Google Analytics",
  BING: "Bing Webmaster",
  CLARITY: "Clarity",
};

/** The agent that collects each source, by its system key: Clarity's since 2026-10-16 (agents-and-clarity-plan.md, CC1). */
const COLLECTOR_KEYS: Record<Source, string> = {
  SEARCH_CONSOLE: "SEARCH_CONSOLE_COLLECTOR",
  GOOGLE_ANALYTICS: "GOOGLE_ANALYTICS_COLLECTOR",
  BING: "BING_WEBMASTER_COLLECTOR",
  CLARITY: CLARITY_COLLECTOR.systemKey,
};

/** A connection as the page shows it. */
const stateValidator = v.union(v.literal("NOT_CONNECTED"), v.literal("SETTING_UP"), v.literal("CONNECT_AGAIN"), v.literal("CONNECTED"));
type State = "NOT_CONNECTED" | "SETTING_UP" | "CONNECT_AGAIN" | "CONNECTED";

function stateOf(status: string | undefined): State {
  if (!status || status === "DISCONNECTED") return "NOT_CONNECTED";
  if (status === "CONNECTED") return "CONNECTED";
  if (status === "NEEDS_RECONNECT") return "CONNECT_AGAIN";
  // Signing in, choosing a property, choosing what counts: begun, not finished.
  return "SETTING_UP";
}

type Connection =
  | Doc<"searchConsoleConnections">
  | Doc<"googleAnalyticsConnections">
  | Doc<"bingConnections">
  | Doc<"clarityConnections">;

async function connectionOf(ctx: { db: QueryCtx["db"] }, source: Source, holdId: Id<"companyWebsites">): Promise<Connection | null> {
  switch (source) {
    case "SEARCH_CONSOLE":
      return await ctx.db.query("searchConsoleConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", holdId)).first();
    case "GOOGLE_ANALYTICS":
      return await ctx.db.query("googleAnalyticsConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", holdId)).first();
    case "BING":
      return await ctx.db.query("bingConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", holdId)).first();
    case "CLARITY":
      return await ctx.db.query("clarityConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", holdId)).first();
  }
}

/** The collector's running schedule, or null when it has no agent, its agent is off, or no schedule of it is on. */
async function collectorSchedule(
  ctx: { db: QueryCtx["db"] },
  source: Source,
): Promise<{ intervalStr: string; nextRunAt: number | null } | null> {
  const agent = await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", COLLECTOR_KEYS[source])).first();
  if (!agent || agent.isActive === false) return null;
  const schedules = await ctx.db.query("schedules").withIndex("by_agent", (q) => q.eq("agentId", agent._id)).take(5);
  const running = schedules.find((schedule) => schedule.isActive);
  return running ? { intervalStr: running.intervalStr, nextRunAt: running.nextRunAt ?? null } : null;
}

const sourceRowValidator = v.object({
  source: sourceValidator,
  state: stateValidator,
  /** Its own switch: false only when switched off on this page. */
  on: v.boolean(),
  /** Whether its collector has a running schedule; how often and when next, when it has. */
  scheduled: v.boolean(),
  intervalStr: v.union(v.string(), v.null()),
  nextRunAt: v.union(v.number(), v.null()),
  lastCollectedAt: v.union(v.number(), v.null()),
});

export const getWebsiteSources = superAdminQuery({
  args: { companyWebsiteId: v.id("companyWebsites") },
  returns: v.union(
    v.null(),
    v.object({
      companyId: v.id("companies"),
      websiteId: v.id("websites"),
      companyName: v.string(),
      host: v.string(),
      owned: v.boolean(),
      /** The company's own switch, "Collect data for this company": the master. */
      companyOn: v.boolean(),
      companyIntervalStr: v.union(v.string(), v.null()),
      rankings: v.object({
        /** This website's own switch. */
        on: v.boolean(),
        /** Collected on the Planner's next run: the company on, this website on, and its pair on when it has one. */
        collecting: v.boolean(),
        /** Its own schedule, when it has one; absent, it follows the company's. */
        ownIntervalStr: v.union(v.string(), v.null()),
        /** The schedule in force: its pair's, its own, or the company's. */
        intervalStr: v.union(v.string(), v.null()),
        nextRunAt: v.union(v.number(), v.null()),
        lastCollectedAt: v.union(v.number(), v.null()),
        pairedWith: v.union(v.null(), v.object({ companyWebsiteId: v.id("companyWebsites"), displayHost: v.string() })),
      }),
      /** The free sources, in the page's order; none for a competitor, whose Google and Bing accounts are not the company's. */
      sources: v.array(sourceRowValidator),
    }),
  ),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.companyWebsiteId);
    if (!hold) return null;
    const [website, company, schedule, pair] = await Promise.all([
      ctx.db.get(hold.websiteId),
      ctx.db.get(hold.companyId),
      companyCollectionSchedule(ctx, hold.companyId),
      pairedOwnedHold(ctx, hold),
    ]);
    const pairSite = pair ? await ctx.db.get(pair.websiteId) : null;
    const companyOn = schedule?.isActive === true;
    const on = hold.collectionEnabled !== false;
    // Paired, the pair's settings are the ones that run (`websites.getCompanyWebsiteById`);
    // a competitor switched off is still not collected, so its own switch counts too.
    const resolved = resolveWebsiteSchedule(schedule, pair ?? hold);
    const collecting = on && resolved.active;
    const owned = !isTrackedHold(hold);

    const sources = [];
    if (owned) {
      for (const source of SOURCES) {
        const connection = await connectionOf(ctx, source, hold._id);
        const state = stateOf(connection?.status);
        const running = await collectorSchedule(ctx, source);
        const sourceOn = connection?.switchedOff !== true;
        sources.push({
          source,
          state,
          on: sourceOn,
          scheduled: running !== null,
          intervalStr: running?.intervalStr ?? null,
          nextRunAt: state === "CONNECTED" && sourceOn ? (running?.nextRunAt ?? null) : null,
          lastCollectedAt: connection?.lastCollectedAt ?? null,
        });
      }
    }

    return {
      companyId: hold.companyId,
      websiteId: hold.websiteId,
      companyName: company?.name ?? "",
      host: website?.displayHost ?? website?.host ?? "",
      owned,
      companyOn,
      companyIntervalStr: schedule?.intervalStr ?? null,
      rankings: {
        on,
        collecting,
        ownIntervalStr: hold.refreshIntervalStr ?? null,
        intervalStr: resolved.intervalStr,
        nextRunAt: collecting ? resolved.nextRunAt : null,
        lastCollectedAt: (await lastCollectedAt(ctx, hold.companyId, hold.websiteId)) ?? null,
        pairedWith: pair && pairSite ? { companyWebsiteId: pair._id, displayHost: pairSite.displayHost } : null,
      },
      sources,
    };
  },
});

async function audit(ctx: MutationCtx & { userId: Id<"users"> }, hold: Doc<"companyWebsites">, actionType: string, metadata: Record<string, unknown>) {
  await ctx.db.insert("auditLogs", {
    actorId: ctx.userId,
    actionType,
    entityId: hold._id,
    entityType: "companyWebsites",
    companyId: hold.companyId,
    metadata: JSON.stringify(metadata),
    timestamp: Date.now(),
  });
}

/** One free source switched on or off for one website (WS3, WS4): its connection and everything held are kept. */
export const setSourceOn = superAdminMutation({
  args: { companyWebsiteId: v.id("companyWebsites"), source: sourceValidator, on: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.companyWebsiteId);
    if (!hold) throw appError("NOT_FOUND", "Website not found");
    const connection = await connectionOf(ctx, args.source, hold._id);
    if (!connection || stateOf(connection.status) === "NOT_CONNECTED") {
      throw appError("NOT_FOUND", `${SOURCE_NAMES[args.source]} is not connected for this website.`);
    }
    const patch = { switchedOff: args.on ? undefined : true, updatedAt: Date.now() };
    switch (args.source) {
      case "SEARCH_CONSOLE":
        await ctx.db.patch(connection._id as Id<"searchConsoleConnections">, patch);
        break;
      case "GOOGLE_ANALYTICS":
        await ctx.db.patch(connection._id as Id<"googleAnalyticsConnections">, patch);
        break;
      case "BING":
        await ctx.db.patch(connection._id as Id<"bingConnections">, patch);
        break;
      case "CLARITY":
        await ctx.db.patch(connection._id as Id<"clarityConnections">, patch);
        break;
    }
    await audit(ctx, hold, "SET_WEBSITE_SOURCE_ON", { source: args.source, on: args.on });
    return null;
  },
});

/**
 * Rankings and AI answers switched on or off for one website: its own switch,
 * `collectionEnabled`. Off is `false`; on is absent, so the website follows
 * its company's switch — the one the Planner obeys (WS5). The schedule is left
 * alone.
 */
export const setRankingsOn = superAdminMutation({
  args: { companyWebsiteId: v.id("companyWebsites"), on: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hold = await ctx.db.get(args.companyWebsiteId);
    if (!hold) throw appError("NOT_FOUND", "Website not found");
    await ctx.db.patch(hold._id, { collectionEnabled: args.on ? undefined : false, updatedAt: Date.now() });
    await audit(ctx, hold, "SET_WEBSITE_RANKINGS_ON", { on: args.on });
    return null;
  },
});
