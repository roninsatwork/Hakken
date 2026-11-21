import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { moduleMutation, moduleQuery } from "./tenantFunctions";
import { MENU_FEATURES } from "./utils/coreModules";
import { requireMySite } from "./siteAccess";
import { periodOf } from "./searchConsoleLists";
import { firstPartOf } from "./searchConsolePeriodReads";
import { slotsOf } from "./searchConsolePeriods";
import { calendarPeriodValidator, ukDay, type CalendarPeriod } from "./utils/calendarPeriods";
import { settlingNow } from "./searchConsoleSettling";

/**
 * A website's lists caught up when someone opens them behind
 * (docs/plans/active/finish-off-plan.md, cost review — Anthony, 2026-10-05:
 * "we rebuild weekly and after each website collection … and we rebuild when
 * someone opens if it's stale"). Search Console is fetched every night but
 * added up only weekly and after the company's own collection, so a screen's
 * lists may end days before the newest day collected; the screen then shows
 * what is held at once, asks for them to be added up — the periods inside the
 * days kept with the charts, or those asked of Google — and shows how far
 * along that is until the new lists are swapped in.
 */

/** A catch-up asked for is not asked for again within this, however many screens open; nor while one is being added up. */
const ASKED_WITHIN_MS = 2 * 60 * 1000;

const datesArgs = { siteId: v.id("companyWebsites"), from: v.string(), to: v.string(), period: v.optional(calendarPeriodValidator) };

type Behind = { connection: Doc<"searchConsoleConnections">; heldTo: string; newest: string; long: boolean } | null;

/** Whether the dates on screen read a ready-made list ending before the newest day collected. */
async function behindOf(ctx: { db: QueryCtx["db"] }, holdId: Doc<"companyWebsites">["_id"], from: string, to: string, chosen?: CalendarPeriod): Promise<Behind> {
  const connection = await ctx.db
    .query("searchConsoleConnections")
    .withIndex("by_hold", (q) => q.eq("companyWebsiteId", holdId))
    .first();
  const newest = connection?.newestDay;
  if (!connection || !newest) return null;
  const period = periodOf(from, to, newest, ukDay(), chosen);
  if (!period) return null;
  const slot = slotsOf(newest, connection.oldestDay ?? newest).find((one) => one.period === period && one.which === "NOW");
  // Asked of Google when its days reach past the 60 kept day by day (calendar-periods-plan.md, phase 4).
  const long = slot?.long ?? false;
  // The period's own page list says what it holds to — one kept on another's days holds the empty part saying them. It
  // is behind only when it stops before the period's own last day: a finished month holds to its last day, however much
  // newer Google's days are. Until 17 November 2026 it was set against the newest day, so Last month said "Bringing them
  // up to 15 November" on every open, and asked for the lists to be added up again each time.
  const list = await firstPartOf(ctx, holdId, undefined, "web", "page", period, "NOW");
  const lastDay = slot?.span?.to ?? newest;
  if (!list || list.to >= lastDay) return null;
  return { connection, heldTo: list.to, newest: lastDay, long };
}

/** What the screen says: whether its figures are behind, to which day, and how far along adding them up is. */
export const searchConsoleCatchUp = moduleQuery({
  module: [MENU_FEATURES.visibility, MENU_FEATURES.searchConsole],
  args: datesArgs,
  returns: v.object({
    behind: v.boolean(),
    heldTo: v.union(v.string(), v.null()),
    newest: v.union(v.string(), v.null()),
    progress: v.union(v.null(), v.object({ done: v.number(), parts: v.number() })),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const behind = await behindOf(ctx, site.hold._id, args.from, args.to, args.period);
    if (!behind) return { behind: false, heldTo: null, newest: null, progress: null };
    const settling = settlingNow(behind.connection) ? behind.connection.settling : undefined;
    return {
      behind: true,
      heldTo: behind.heldTo,
      newest: behind.newest,
      progress: settling ? { done: settling.done, parts: settling.parts } : null,
    };
  },
});

/** Ask for the lists on screen to be caught up, once: nothing when they are not behind or already being added up. */
export const requestSearchConsoleCatchUp = moduleMutation({
  module: [MENU_FEATURES.visibility, MENU_FEATURES.searchConsole],
  args: datesArgs,
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const behind = await behindOf(ctx, site.hold._id, args.from, args.to, args.period);
    if (!behind) return false;
    const { connection } = behind;
    if (settlingNow(connection) || (connection.catchUpAt !== undefined && Date.now() - connection.catchUpAt < ASKED_WITHIN_MS)) return false;
    await ctx.db.patch(connection._id, { catchUpAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.searchConsoleSettle.catchUpSite, { connectionId: connection._id, long: behind.long });
    return true;
  },
});
