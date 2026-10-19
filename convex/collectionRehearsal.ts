import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { appError } from "./utils/appError";
import { encryptConnectorToken } from "./connectorTokenCrypto";
import { GOOGLE_ANALYTICS_ROLE } from "./googleAnalyticsAgentRun";
import { fillStepKey } from "./googleAnalyticsFillAfter";
import { COUNTED_WITH, LISTED_WITH } from "./googleAnalyticsSchema";
import { REHEARSAL_HOST, TEN_TIMES_KORDA, rehearsalToken } from "./utils/rehearsalGoogle";

/**
 * The collection's rehearsal (collection-reliability-plan.md, RR5): a website
 * ten times kordatackle.com's size, collected start to finish by both
 * collectors on the real backend, where Convex's own limits apply — memory,
 * time, what one call may read and write — which the test library does not
 * check. Its Google is pretend (`utils/rehearsalGoogle.ts`): nothing is asked
 * of Google.
 *
 * A test tool, run from the command line and seen by no one else:
 * `startRehearsal` sets the website up under a company of its own and starts
 * both first collections, as the nightly runs start them; `rehearsalReport`
 * says how each run, chain and step went; `endRehearsal` removes all of it.
 */

const COMPANY = "Collection rehearsal (10× kordatackle.com)";
const PROPERTY = "properties/rehearsal";
const CONSOLE_PROPERTY = `sc-domain:${REHEARSAL_HOST}`;
/** Its home countries: the main one and two kept ready beside it. */
const COUNTRIES = ["gbr", "irl", "usa"];
/** The sign-in is good for the rehearsal's length: never renewed, so Google is never asked for a token. */
const SIGN_IN_MS = 7 * 24 * 60 * 60 * 1000;

/** The rehearsal's company — by its own name, or by its id for one set up under another — and its hold on the rehearsal's website. */
async function rehearsalHeld(ctx: { db: QueryCtx["db"] }, companyId?: Id<"companies">): Promise<{ site: Doc<"companyWebsites">; company: Doc<"companies"> } | null> {
  const company = companyId ? await ctx.db.get(companyId) : await ctx.db.query("companies").withIndex("by_name", (q) => q.eq("name", COMPANY)).first();
  const site = company ? await ctx.db.query("companyWebsites").withIndex("by_company", (q) => q.eq("companyId", company._id)).first() : null;
  return site && company ? { site, company } : null;
}

const sizeArgs = {
  pages: v.optional(v.number()),
  consoleRowsADay: v.optional(v.number()),
  breadth: v.optional(v.number()),
  days: v.optional(v.number()),
  /** Its home countries, the main one first: three unless a smaller rehearsal says. */
  countries: v.optional(v.array(v.string())),
  /** Search Console's collection alone, Analytics' left unstarted: to rehearse the one collector again. */
  consoleOnly: v.optional(v.boolean()),
};

/** The website, its company, its sign-in and both connections, ready to collect. */
export const seedRehearsal = internalMutation({
  args: { countries: v.array(v.string()) },
  returns: v.object({ companyId: v.id("companies"), siteId: v.id("companyWebsites"), analyticsId: v.id("googleAnalyticsConnections"), consoleId: v.id("searchConsoleConnections") }),
  handler: async (ctx, args) => {
    if (await ctx.db.query("companies").withIndex("by_name", (q) => q.eq("name", COMPANY)).first()) {
      throw appError("CONFLICT", "A rehearsal is set up already: end it first (collectionRehearsal:endRehearsal).");
    }
    const now = Date.now();
    const companyId = await ctx.db.insert("companies", { name: COMPANY, createdAt: now });
    const websiteId = await ctx.db.insert("websites", { host: REHEARSAL_HOST, displayHost: REHEARSAL_HOST, firstSeenAt: now });
    const siteId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", searchConsoleCountries: args.countries, createdAt: now });
    const analyticsId = await ctx.db.insert("googleAnalyticsConnections", {
      companyId, companyWebsiteId: siteId, websiteId, status: "CONNECTED", property: PROPERTY, propertyName: "Rehearsal",
      stream: `https://www.${REHEARSAL_HOST}`, addresses: [`www.${REHEARSAL_HOST}`], otherAddresses: [], timeZone: "Europe/London", currency: "GBP",
      eventsReadAt: now, listedWith: LISTED_WITH, countedWith: COUNTED_WITH,
      events: [
        { eventName: "generate_lead", counted: true, analyticsValue: null, hakkenValue: 250, lastThirtyDays: 0 },
        { eventName: "click_tel", counted: true, analyticsValue: null, hakkenValue: null, lastThirtyDays: 0 },
        { eventName: "form_submit", counted: true, analyticsValue: null, hakkenValue: null, lastThirtyDays: 0 },
      ],
      createdAt: now, updatedAt: now,
    });
    const consoleId = await ctx.db.insert("searchConsoleConnections", {
      companyId, companyWebsiteId: siteId, websiteId, status: "CONNECTED", property: CONSOLE_PROPERTY, permission: "siteOwner",
      connectedAt: now, createdAt: now, updatedAt: now,
    });
    return { companyId, siteId, analyticsId, consoleId };
  },
});

/** Both connections read with the rehearsal's sign-in, kept by the shared sign-in's own door (`googleConnection.keepGrant`). */
export const linkRehearsalSignIn = internalMutation({
  args: { analyticsId: v.id("googleAnalyticsConnections"), consoleId: v.id("searchConsoleConnections"), googleConnectionId: v.id("googleConnections") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.analyticsId, { googleConnectionId: args.googleConnectionId });
    await ctx.db.patch(args.consoleId, { googleConnectionId: args.googleConnectionId });
    return null;
  },
});

/** Both first collections started, as a night's runs start them: Analytics' with its two-year fills to follow, unless only Search Console's is rehearsed. */
export const startRehearsalRuns = internalMutation({
  args: { analyticsId: v.id("googleAnalyticsConnections"), consoleId: v.id("searchConsoleConnections"), consoleOnly: v.optional(v.boolean()) },
  returns: v.object({ analytics: v.string(), console: v.string() }),
  handler: async (ctx, args): Promise<{ analytics: string; console: string }> => {
    const connection = (await ctx.db.get(args.analyticsId))!;
    const agent = await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", GOOGLE_ANALYTICS_ROLE)).first();
    let analytics = args.consoleOnly ? "NOT_REHEARSED" : "NO_AGENT";
    if (agent && !args.consoleOnly) {
      const now = Date.now();
      const parentRunId = await ctx.db.insert("agentRuns", {
        agentId: agent._id, triggerType: "MANUAL", objective: "The collection's rehearsal: one website, ten times kordatackle.com.",
        title: "Google Analytics: rehearsal", status: "SUCCESS", companyId: connection.companyId, startedAt: now, updatedAt: now,
      });
      const started = await ctx.runMutation(internal.googleAnalyticsAgentRun.startSiteRun, {
        parentRunId, connectionId: connection._id, companyId: connection.companyId, host: REHEARSAL_HOST, property: PROPERTY, delayMs: 0,
      });
      analytics = started === null ? "NOT_STARTED" : typeof started === "string" ? started : "STARTED";
    }
    const console = await ctx.runMutation(internal.searchConsoleFirstCollection.startFirstCollection, { connectionId: args.consoleId });
    return { analytics, console };
  },
});

/**
 * Set the rehearsal up and start it: `npx convex run collectionRehearsal:startRehearsal`.
 * Smaller with `pages`, `consoleRowsADay`, `breadth` and `days`; ten times kordatackle.com without.
 */
export const startRehearsal = internalAction({
  args: sizeArgs,
  returns: v.object({ siteId: v.id("companyWebsites"), analytics: v.string(), console: v.string() }),
  handler: async (ctx, args): Promise<{ siteId: Id<"companyWebsites">; analytics: string; console: string }> => {
    const { countries, consoleOnly, ...sized } = args;
    const size = { ...TEN_TIMES_KORDA, ...sized };
    const seeded = await ctx.runMutation(internal.collectionRehearsal.seedRehearsal, { countries: countries ?? COUNTRIES });
    // The sign-in: its access token the rehearsal's, good for its length, so it is never renewed with Google.
    const token = await encryptConnectorToken(rehearsalToken(size));
    const googleConnectionId = await ctx.runMutation(internal.googleConnection.keepGrant, {
      companyWebsiteId: seeded.siteId, account: `rehearsal@${REHEARSAL_HOST}`, scopes: [], accessTokenCiphertext: token, refreshTokenCiphertext: token, expiresAt: Date.now() + SIGN_IN_MS,
    });
    await ctx.runMutation(internal.collectionRehearsal.linkRehearsalSignIn, { analyticsId: seeded.analyticsId, consoleId: seeded.consoleId, googleConnectionId });
    const started = await ctx.runMutation(internal.collectionRehearsal.startRehearsalRuns, { analyticsId: seeded.analyticsId, consoleId: seeded.consoleId, consoleOnly });
    return { siteId: seeded.siteId, ...started };
  },
});

/** Most of each kind read for the report: a rehearsal has a few runs and chains. */
const REPORT_MOST = 50;

/** How the rehearsal went: each run, each chain of steps and its peak memory, the lines that failed, and the connections' state. */
export const rehearsalReport = internalQuery({
  args: { companyId: v.optional(v.id("companies")) },
  handler: async (ctx, args) => {
    const held = await rehearsalHeld(ctx, args.companyId);
    if (!held) return null;
    const { site, company } = held;
    const analytics = await ctx.db.query("googleAnalyticsConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", site._id)).first();
    const console = await ctx.db.query("searchConsoleConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", site._id)).first();
    const runs = (await ctx.db.query("agentRuns").withIndex("by_company_started", (q) => q.eq("companyId", company._id)).order("desc").take(REPORT_MOST))
      .filter((run) => run.title !== "Google Analytics: rehearsal");
    const chains = [];
    for (const run of runs) {
      for (const chain of await ctx.db.query("collectionSteps").withIndex("by_run", (q) => q.eq("runId", run._id)).take(REPORT_MOST)) {
        chains.push({ run: run.title, chain: chain.chain, place: chain.place, tries: chain.tries, resumes: chain.resumes, peakMb: chain.peakMb ?? null, closed: chain.closedAt !== undefined, gaveUp: chain.gaveUp ?? null });
      }
    }
    // The fills have no run of their own: read by their keys, for the main home country and each other.
    if (analytics) {
      for (const country of ["", ...(analytics.countryHistory ?? []).map((one) => one.country)]) {
        for (const chain of ["GA_FILL_DAYS", "GA_FILL_PAGES"] as const) {
          const held = await ctx.db.query("collectionSteps").withIndex("by_key", (q) => q.eq("key", fillStepKey(chain, analytics._id, country))).unique();
          if (held) chains.push({ run: `fill ${country || "main"}`, chain: held.chain, place: held.place, tries: held.tries, resumes: held.resumes, peakMb: held.peakMb ?? null, closed: held.closedAt !== undefined, gaveUp: held.gaveUp ?? null });
        }
      }
    }
    const failed = [];
    for (const run of runs) {
      const steps = await ctx.db.query("agentRunSteps").withIndex("by_run_step", (q) => q.eq("runId", run._id)).take(500);
      for (const step of steps) if (step.status === "FAILED") failed.push({ run: run.title, heading: step.input ?? "", detail: (step.output ?? "").slice(0, 300) });
    }
    return {
      runs: runs.map((run) => ({ title: run.title, status: run.status, minutes: Math.round(((run.completedAt ?? Date.now()) - run.startedAt) / 60_000), summary: (run.finalOutput ?? "").slice(0, 300) })),
      chains,
      failed,
      analytics: analytics ? {
        newestDay: analytics.newestDay ?? null, collecting: analytics.collecting !== undefined, lastCollectedAt: analytics.lastCollectedAt ?? null,
        historyFilled: analytics.historyFilled ?? [], pageHistoryFrom: analytics.pageHistoryFrom ?? null, problem: analytics.problem ?? null,
      } : null,
      console: console ? {
        newestDay: console.newestDay ?? null, daysFrom: console.daysFrom ?? null, settling: console.settling !== undefined, problem: console.problem ?? null,
      } : null,
    };
  },
});

/** The rehearsal's website, company and sign-in, to remove. */
export const rehearsalToEnd = internalQuery({
  args: { companyId: v.optional(v.id("companies")) },
  returns: v.union(v.null(), v.object({ siteId: v.id("companyWebsites"), websiteId: v.id("websites"), companyId: v.id("companies"), googleConnectionId: v.union(v.id("googleConnections"), v.null()) })),
  handler: async (ctx, args) => {
    const held = await rehearsalHeld(ctx, args.companyId);
    if (!held) return null;
    const analytics = await ctx.db.query("googleAnalyticsConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", held.site._id)).first();
    return { siteId: held.site._id, websiteId: held.site.websiteId, companyId: held.company._id, googleConnectionId: analytics?.googleConnectionId ?? null };
  },
});

/**
 * Everything the rehearsal made, removed: `npx convex run collectionRehearsal:endRehearsal`.
 * Its figures go as a website's do when it is deleted, a batch at a time; its
 * runs stay, as every run does, under a company that is gone.
 */
export const endRehearsal = internalAction({
  args: { companyId: v.optional(v.id("companies")) },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const held = await ctx.runQuery(internal.collectionRehearsal.rehearsalToEnd, args);
    if (!held) return "No rehearsal is set up.";
    // The sign-in forgotten first, by its own door, so clearing the website never asks Google to revoke a token it never gave.
    if (held.googleConnectionId) {
      await ctx.runMutation(internal.googleConnection.dropConnection, { googleConnectionId: held.googleConnectionId, companyWebsiteId: held.siteId, all: true });
    }
    await ctx.runAction(internal.googleConnection.forgetHold, { companyWebsiteId: held.siteId });
    await ctx.runMutation(internal.websitePurge.purgeWebsiteHoldingsInternal, { websiteId: held.websiteId });
    await ctx.runMutation(internal.websitePurge.purgeWebsiteCollectedDataInternal, { websiteId: held.websiteId });
    await ctx.scheduler.runAfter(60_000, internal.collectionRehearsal.finishEnding, { companyId: held.companyId, websiteId: held.websiteId, tries: 0 });
    return "The rehearsal's sign-in is gone and its figures are being cleared; its company goes once its website has.";
  },
});

/** The company removed once the purge has taken its website: looked at again each minute, for an hour at most. */
export const finishEnding = internalMutation({
  args: { companyId: v.id("companies"), websiteId: v.id("websites"), tries: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const left = await ctx.db.query("companyWebsites").withIndex("by_company", (q) => q.eq("companyId", args.companyId)).first();
    if (left && args.tries < 60) {
      await ctx.scheduler.runAfter(60_000, internal.collectionRehearsal.finishEnding, { ...args, tries: args.tries + 1 });
      return null;
    }
    if (!left) {
      const website = await ctx.db.get(args.websiteId);
      if (website) await ctx.db.delete(website._id);
      await ctx.db.delete(args.companyId);
    }
    return null;
  },
});
