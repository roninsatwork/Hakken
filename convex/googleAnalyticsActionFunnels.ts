import { v } from "convex/values";
import { internalQuery, type ActionCtx, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { askFunnel, failed, slotKey, type CollectTarget, type Session, type StepResult } from "./googleAnalyticsCollect";
import { readSlot } from "./googleAnalyticsRows";
import { merged, readDayPoints } from "./googleAnalyticsHistory";
import { shiftDay } from "./searchConsoleDays";
import { EVERY_DEVICE, emptyRow, packList, type ListRow } from "./googleAnalyticsLists";
import { funnelAsk } from "./googleAnalyticsLive";

/**
 * What people did before converting (docs/plans/active/ga-conversions-visitors-plan.md
 * CV4): for each of the website's busiest actions — every event that is not
 * itself a conversion, less Page viewed and Visit started, which every visit
 * has — the people who did it over the last 12 months and, of them, the people
 * who converted after it. Google's funnel report, the one an event's own
 * screen reads (ga-stored-figures-plan.md SF8), asked by the night's run
 * rather than by a screen (SF1): every device, the main home country, kept
 * under the name that screen reads for 12 months and every device, so the two
 * show one figure (SF16).
 */

/** The night's funnel step: once a run, after the lists. */
export type FunnelsJob = { funnels: true };

/** How many actions a night, the busiest by people over the last 12 months (CV11). */
export const FUNNEL_ACTIONS = 10;

/** Events every visit has: a funnel from them says nothing about an action (CV4). */
export const EVERY_VISIT_EVENTS: readonly string[] = ["page_view", "session_start"];

/**
 * The website's own rate, asked the same way as each action's: everyone who started a visit, and of them who went on
 * to convert — people, as each bar is, never conversions over visits (CV4).
 */
export const WEBSITE_FUNNEL = "session_start";

/**
 * The actions to ask, from the events over the last 12 months: the busiest by people a day added up — a busyness, not
 * a count of people — conversions and every visit's events left out.
 */
export function actionsFrom(rows: ReadonlyArray<{ key: string; people: number }>, counted: readonly string[]): string[] {
  return rows
    .filter((row) => row.people > 0 && !counted.includes(row.key) && !EVERY_VISIT_EVENTS.includes(row.key))
    .sort((left, right) => right.people - left.people || left.key.localeCompare(right.key))
    .slice(0, FUNNEL_ACTIONS)
    .map((row) => row.key);
}

/**
 * The events the actions are chosen from: the last 12 months added up from the days, weeks and months held, with no
 * download (calendar-periods-plan.md, rule 10); until the two-year fill holds the events' months — a new website's
 * first night — Google's own answer for this year, which the run has just fetched, so its first collection asks the
 * actions' funnels as it always did. Shared with the screen, so it lists the actions that were asked.
 */
export async function actionEvents(ctx: { db: QueryCtx["db"] }, connection: Doc<"googleAnalyticsConnections">): Promise<ListRow[]> {
  const newest = connection.newestDay;
  const points = newest ? await readDayPoints(ctx, connection, "event", EVERY_DEVICE, shiftDay(newest, -364), newest) : null;
  if (points) return merged(points.flatMap((point) => point.rows));
  return (await readSlot(ctx, connection.companyWebsiteId, slotKey("event", "last12Months", "NOW", EVERY_DEVICE)))?.rows ?? [];
}

export const actionsOf = internalQuery({
  args: { companyWebsiteId: v.id("companyWebsites"), counted: v.array(v.string()) },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const connection = await ctx.db.query("googleAnalyticsConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", args.companyWebsiteId)).first();
    return connection ? actionsFrom(await actionEvents(ctx, connection), args.counted) : [];
  },
});

/**
 * Each action's funnel over the last 12 months, inside the run's budget: a spent
 * budget, Google busy or access lost stops the step as any list's ask does, so
 * the run waits for the hour or stops; Google refusing the funnel report itself
 * (it is still in its alpha) is kept as refused, as an event's screen keeps it,
 * and the next action asked.
 */
export async function collectActionFunnels(ctx: ActionCtx, session: Session, target: CollectTarget, top: string): Promise<StepResult> {
  if (target.counted.length === 0) return { ok: true, rows: 0, requests: session.requests };
  const actions: string[] = await ctx.runQuery(internal.googleAnalyticsActionFunnels.actionsOf, { companyWebsiteId: target.companyWebsiteId, counted: target.counted });
  // The last 12 months to the newest day (rule 10): the before-converting steps are still asked of Google, whole.
  const range = { from: shiftDay(top, -364), to: top };
  let narrowed = false;
  for (const action of [WEBSITE_FUNNEL, ...actions]) {
    const funnel = await askFunnel(session, target.property!, {
      startDate: range.from, endDate: range.to, first: action, then: target.counted.filter((name) => name !== action),
      hostNames: target.addresses, countries: [target.country],
      // The conversion on the shop too (conversion-addresses-plan.md), the action itself on the website's own address.
      ...(target.alsoConverting.length > 0 ? { thenHostNames: [...target.addresses, ...target.alsoConverting] } : {}),
    }, true);
    if (!funnel.ok && funnel.reason !== "REFUSED") return failed(session, funnel);
    if (funnel.ok && funnel.narrowed) narrowed = true;
    const rows = funnel.ok ? [{ ...emptyRow("did"), people: funnel.did }, { ...emptyRow("then"), people: funnel.then }] : [emptyRow("refused")];
    await ctx.runMutation(internal.googleAnalyticsLive.putLive, {
      companyWebsiteId: target.companyWebsiteId,
      ask: funnelAsk(action, "365", EVERY_DEVICE),
      parts: packList("event", rows, target.events),
      folded: false,
      thresholded: false,
      cut: false,
    });
  }
  return { ok: true, rows: actions.length + 1, requests: session.requests, ...(narrowed ? { narrowed: target.alsoConverting } : {}) };
}
