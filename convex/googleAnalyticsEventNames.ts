import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { readerFields, requestTranslation } from "./contentTranslation";
import { connectionOf } from "./googleAnalyticsRows";
import { requireMySite } from "./siteAccess";
import { tenantQuery } from "./tenantFunctions";
import { isTrackedHold } from "./utils/websitePairing";

/**
 * An everyday name for each event a website counts (overview-new-page-plan-2026-11-06.md, step 4): "Asked for a prospectus", where
 * Google's says form_submit_prospectus_form. Auto Setup writes them in English when it's pressed, and at no other time. The Translator
 * does the other languages. A person's page shows the name in their language, then the English, then the words today's event name makes.
 */

const LONGEST_NAME = 60;

/** One own website with counted events still to name, and the events. Null when there's none, or `runId` has already asked each. */
export async function eventsToNameOf(ctx: Pick<QueryCtx, "db">, companyId: Id<"companies">, runId?: Id<"agentRuns">) {
  const holds = await ctx.db.query("companyWebsites").withIndex("by_company", (q) => q.eq("companyId", companyId)).take(300);
  for (const hold of holds) {
    if (isTrackedHold(hold)) continue;
    const connection = await connectionOf(ctx, hold._id);
    if (!connection || (runId && connection.eventNamesRun === runId)) continue;
    const events = (connection.events ?? []).filter((event) => event.counted && !event.plainName).map((event) => event.eventName);
    if (events.length === 0) continue;
    const website = await ctx.db.get(hold.websiteId);
    return { connectionId: connection._id, host: website?.displayHost ?? website?.host ?? "", events };
  }
  return null;
}

export const writeEventNames = internalMutation({
  args: {
    connectionId: v.id("googleAnalyticsConnections"),
    runId: v.id("agentRuns"),
    events: v.array(v.object({ eventName: v.string(), plainName: v.string(), firstStep: v.boolean() })),
  },
  returns: v.number(),
  handler: async (ctx: MutationCtx, args) => {
    const connection: Doc<"googleAnalyticsConnections"> | null = await ctx.db.get(args.connectionId);
    if (!connection) return 0;
    const said = new Map(args.events.map((event) => [event.eventName, event]));
    let named = 0;
    const events = (connection.events ?? []).map((event) => {
      const one = said.get(event.eventName);
      const plain = one?.plainName.trim().slice(0, LONGEST_NAME);
      // Only what's still empty, and only what was asked about.
      if (!one || !plain || !event.counted || event.plainName) return event;
      named += 1;
      return { ...event, plainName: plain, firstStep: one.firstStep };
    });
    await ctx.db.patch(connection._id, { events, eventNamesRun: args.runId });
    if (named > 0) await requestTranslation(ctx, "googleAnalyticsConnections", connection._id);
    return named;
  },
});

/** Each named event's everyday name, in the reader's language where it's been translated. */
export const analyticsEventNames = tenantQuery({
  args: { siteId: v.id("companyWebsites"), language: v.string() },
  returns: v.record(v.string(), v.string()),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const connection = await connectionOf(ctx, site.hold._id);
    const english = Object.fromEntries((connection?.events ?? []).flatMap((event) => (event.plainName ? [[event.eventName, event.plainName]] : [])));
    if (!connection || Object.keys(english).length === 0) return {};
    return await readerFields(ctx, "googleAnalyticsConnections", connection._id, english, args.language);
  },
});
