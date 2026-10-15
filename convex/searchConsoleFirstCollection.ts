import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { beginSiteRun } from "./searchConsoleAgentRun";
import { prepareMainCountryOf } from "./searchConsoleMainCountry";
import { siteRunGoing } from "./searchConsoleConnect";
import { collectionOf } from "./searchConsoleSync";

/**
 * A website's first collection, started the moment its Search Console is
 * connected (docs/plans/active/search-console-first-collection-plan.md, SF1;
 * Anthony, 2026-10-15: "Yes, plan Search Console starting on connecting …").
 * It used to wait for the Collector's 04:00 run, so a website connected in the
 * morning showed nothing until the next day.
 *
 * It is still the Collector's work: a run of the Collector Agent for that
 * website alone, titled as its nightly runs are, with its own lines. The
 * nightly run leaves a website whose own run is going to it, and doesn't stop
 * for it (`takeCollectorTurn`). Every way of connecting comes here: on its
 * own, choosing another property (once the old figures are cleared), and
 * through a Google Analytics sign-in.
 */

/** Why no first collection started, or that it did. */
const startedValidator = v.union(
  v.literal("STARTED"),
  v.literal("NOT_NEEDED"),
  v.literal("ALREADY_GOING"),
  v.literal("SWITCHING"),
  v.literal("NO_AGENT"),
  v.literal("AGENT_OFF"),
);

export const startFirstCollection = internalMutation({
  args: { connectionId: v.id("searchConsoleConnections") },
  returns: startedValidator,
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    // Not connected, still clearing another property's figures, switched off, or collected already: nothing to start.
    if (!connection || connection.status !== "CONNECTED" || !connection.property || connection.clearing || connection.switchedOff || connection.newestDay) return "NOT_NEEDED";
    if (await siteRunGoing(ctx, connection)) return "ALREADY_GOING";
    const agent = await ctx.db.query("agents").withIndex("by_system_key", (q) => q.eq("systemKey", "SEARCH_CONSOLE_COLLECTOR")).first();
    // Without the agent, or with it switched off, the website waits for the agent's next run, and its page says so.
    if (!agent) return "NO_AGENT";
    if (agent.isActive === false) return "AGENT_OFF";
    // Its figures are its main home country's (search-console-home-countries-plan.md): noted before its first step.
    if ((await prepareMainCountryOf(ctx, connection)) === "SWITCHING") return "SWITCHING";
    const site = await collectionOf(ctx, (await ctx.db.get(connection._id))!, Date.now());
    if (!site) return "NOT_NEEDED";
    await beginSiteRun(ctx, agent._id, site, 0);
    return "STARTED";
  },
});
