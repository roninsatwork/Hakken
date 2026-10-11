import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { appError } from "./utils/appError";
import { feedUpdates, type FeedIncident } from "./utils/googleUpdatesFeed";

/**
 * Google's update list, filled from Google's own Search Status page
 * (docs/plans/active/search-console-volatility-plan.md, V14; Anthony,
 * 2026-10-10: "add this to the plan"): once a day its incidents are read and
 * each ranking update — a core or spam update — is filed in Admin → Content →
 * Google updates as one entered by hand would be (`fileFeedUpdate`), so the
 * charts' markers, News and Volatility's "is it Google?" never wait on a
 * person. Free: a public page. Nothing else on it is read.
 */

const FEED = "https://status.search.google.com/incidents.json";

export const collectGoogleUpdates = internalAction({
  args: {},
  returns: v.object({ read: v.number(), added: v.number(), changed: v.number() }),
  handler: async (ctx) => {
    const response = await fetch(FEED, { headers: { accept: "application/json" } });
    if (!response.ok) throw appError("UPSTREAM_FAILURE", `Google's Search Status page answered ${response.status}.`);
    const incidents = (await response.json()) as FeedIncident[];
    const updates = feedUpdates(incidents);
    let added = 0;
    let changed = 0;
    for (const update of updates) {
      const filed = await ctx.runMutation(internal.googleUpdates.fileFeedUpdate, update);
      if (filed === "ADDED") added += 1;
      if (filed === "CHANGED") changed += 1;
    }
    return { read: updates.length, added, changed };
  },
});
