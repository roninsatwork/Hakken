import { v } from "convex/values";
import { tenantQuery } from "./tenantFunctions";
import { requireMySite } from "./siteAccess";
import { daysOf } from "./searchConsoleReads";
import { addUp, shiftDay } from "./searchConsoleDays";
import { countryScope } from "./searchConsoleCountries";
import { consoleLimitsOf } from "./searchConsoleLimits";
import { updatesIn } from "./searchConsoleChanges";
import { DAYS_READ, average, dayRowsOf, scoresBetween, updateInPlay, updateVolatility } from "./searchConsoleVolatilityDays";
import { seenValidator } from "./utils/hakkenSees";
import { volatilitySees, type UpdateSeen } from "./utils/sees/searchConsole";
import { USUAL_DAYS, completeDays, levelOf } from "./utils/searchConsoleVolatility";

/**
 * Search Console → Volatility (docs/plans/active/search-console-volatility-
 * plan.md §2.1): the four figures and What Hakken sees. The score is worked
 * out once per day after each collection and kept on the day's chart row
 * (`chartFigures`, `searchConsoleWeeks`); this reads those rows — at most the
 * 60 days kept as days — Google's updates in them, and the clicks of the last
 * fourteen days. The chart reads `searchConsoleChartFigures`, the table its
 * own ready-made day (`VOLATILITY_PERIOD`).
 */

const scoreValidator = v.union(v.number(), v.null());

export const searchConsoleVolatility = tenantQuery({
  args: { siteId: v.id("companyWebsites"), language: v.string(), country: v.optional(v.string()) },
  returns: v.object({
    /** A country not kept ready: Volatility is worked out for the home countries only (V5). */
    live: v.boolean(),
    newestDay: v.union(v.string(), v.null()),
    /** The newest complete day (§3), its level against the website's usual. */
    latest: v.union(v.null(), v.object({
      day: v.string(),
      volatility: scoreValidator,
      level: v.union(v.literal("NORMAL"), v.literal("HIGH"), v.literal("VERY_HIGH"), v.null()),
      keywords: v.number(),
      movedUp5: v.number(),
      movedDown5: v.number(),
    })),
    /** The website's usual: its average over the complete days of the four weeks before the newest complete day. */
    usual: scoreValidator,
    update: v.union(v.null(), v.object({ title: v.string(), url: v.string(), startedOn: v.string(), finishedOn: v.union(v.string(), v.null()), before: scoreValidator, during: scoreValidator })),
    /** The last 7 days' average score, and the 7 before's. */
    week: v.object({ now: scoreValidator, before: scoreValidator }),
    clicks: v.object({ now: v.number(), before: v.union(v.number(), v.null()) }),
    seen: seenValidator,
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const holdId = site.hold._id;
    const connection = await ctx.db.query("searchConsoleConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", holdId)).first();
    const scope = await countryScope(ctx, site.hold, connection, args.country);
    const nothing = { newestDay: null, latest: null, usual: null, update: null, week: { now: null, before: null }, clicks: { now: 0, before: null } };
    const unseen = volatilitySees({ latest: null, usual: null, update: null, clicks: { now: 0, before: null }, impressions: { now: 0, before: null } });
    if (scope.read === "LIVE") return { ...nothing, live: true, seen: unseen };
    const country = scope.read === "KEPT" ? scope.country : undefined;
    const newest = scope.read === "KEPT" ? scope.newestDay : connection?.newestDay;
    const oldest = scope.read === "KEPT" ? scope.oldestDay : connection?.oldestDay;
    if (!newest || !oldest) return { ...nothing, live: false, seen: unseen };

    const days = await dayRowsOf(ctx, holdId, country, shiftDay(newest, 1 - DAYS_READ));
    const complete = completeDays(days);
    const { updatesListed } = await consoleLimitsOf(ctx, site.hold);
    const updates = await updatesIn(ctx, shiftDay(newest, 1 - DAYS_READ - USUAL_DAYS), newest, args.language, updatesListed);
    // The usual leaves out the days Google's updates rolled out, so an update cannot raise the line it is read against.
    const usualDays = new Set([...complete].filter((day) => !updates.some((update) => day >= update.startedOn && day <= (update.finishedOn ?? newest))));
    const last = [...days].reverse().find((day) => complete.has(day.week)) ?? null;
    const usual = last ? average(scoresBetween(days, shiftDay(last.week, -USUAL_DAYS), shiftDay(last.week, -1), usualDays)) : null;
    const latest = last && last.volatilityKeywords !== undefined
      ? {
        day: last.week,
        volatility: last.volatility ?? null,
        level: last.volatility === undefined ? null : levelOf(last.volatility, usual),
        keywords: last.volatilityKeywords,
        movedUp5: last.movedUp5 ?? 0,
        movedDown5: last.movedDown5 ?? 0,
      }
      : null;
    const playing = updateInPlay(updates, newest);
    const update: (UpdateSeen & { url: string }) | null = playing
      ? { title: playing.title, url: playing.url, startedOn: playing.startedOn, finishedOn: playing.finishedOn, ...updateVolatility(days, playing, newest, complete) }
      : null;
    const week = {
      now: average(scoresBetween(days, shiftDay(newest, -6), newest, complete)),
      before: average(scoresBetween(days, shiftDay(newest, -13), shiftDay(newest, -7), complete)),
    };
    const totals = async (from: string, to: string) => (from < oldest ? null : addUp(await daysOf(ctx, holdId, "web", from, to, country)));
    const now = await totals(shiftDay(newest, -6), newest);
    const before = await totals(shiftDay(newest, -13), shiftDay(newest, -7));
    const clicks = { now: now?.clicks ?? 0, before: before ? before.clicks : null };
    const seen = volatilitySees({ latest, usual, update, clicks, impressions: { now: now?.impressions ?? 0, before: before ? before.impressions : null } });
    return { live: false, newestDay: newest, latest, usual, update, week, clicks, seen };
  },
});
