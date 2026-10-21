import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { tenantAction } from "./tenantFunctions";
import { getActiveCompanyId } from "./authz";
import { appError } from "./utils/appError";
import { askRealtime, openSession } from "./googleAnalyticsCollect";
import type { RealtimeAsk } from "./googleAnalyticsApi";
import { seenValidator } from "./utils/hakkenSees";
import { liveSees } from "./utils/sees/analyticsLive";
import { OPENING_PERIOD } from "./utils/calendarPeriods";

/**
 * Live (docs/plans/active/google-analytics-plan.md GA34, §18.2 board 14,
 * §18.6.7): who is on the website right now and what they did in the last 30
 * minutes, from Google's live figures. The Live page asks once a minute, and
 * only while it is open and in front (`useLiveFigures`); this answers each ask
 * and **stores nothing** — no table, no log, no held list. Every country
 * counts, as in Google's own Realtime (Anthony, 2026-10-13: it said nobody
 * while Google's said 4, all abroad), split by country among the rest; one
 * device when chosen. Google keeps no website address live, so the figures are
 * the whole property's. Only the caller's own website.
 */

/** The lists the table switches between. */
export const LIVE_LISTS = ["pages", "places", "devices", "events"] as const;

/** Minutes Google's live figures reach back. */
const MINUTES = 30;

const rowValidator = v.object({ name: v.string(), people: v.number(), views: v.number(), times: v.number() });
type LiveRow = typeof rowValidator.type;

const problemValidator = v.union(v.literal("NOT_CONNECTED"), v.literal("GOOGLE_BUSY"), v.literal("GOOGLE_REFUSED"));

const answerValidator = v.union(
  v.object({ ok: v.literal(false), problem: problemValidator }),
  v.object({
    ok: v.literal(true),
    askedAt: v.number(),
    /** People in the last 5 minutes: on the website now. */
    now: v.number(),
    /** People and page views in the last 30 minutes. */
    people: v.number(),
    views: v.number(),
    /** Conversions in the last 30 minutes, the newest by Google's name and how many minutes ago. */
    conversions: v.object({ count: v.number(), eventName: v.union(v.string(), v.null()), minutesAgo: v.union(v.number(), v.null()) }),
    /** People each minute, the oldest first and now last. */
    minutes: v.array(v.number()),
    places: v.array(rowValidator),
    /** People in the last 30 minutes by country, by Google's two-letter `countryId`. */
    countries: v.array(rowValidator),
    /** The list chosen; pages by title, as Google's live figures name them. */
    rows: v.array(rowValidator),
    seen: seenValidator,
  }),
);
/** Named, not worked out: an action that calls `internal` must say what it returns, or its type refers to itself. */
type LiveAnswer = typeof answerValidator.type;

export const askGoogleAnalyticsRealtime = tenantAction({
  args: {
    siteId: v.id("companyWebsites"),
    device: v.string(),
    list: v.union(...LIVE_LISTS.map((list) => v.literal(list))),
  },
  returns: answerValidator,
  handler: async (ctx, args): Promise<LiveAnswer> => {
    const companyId = getActiveCompanyId(ctx.user);
    if (!companyId) throw appError("NOT_FOUND", "That website is not one your company holds.");
    return await askLiveFigures(ctx, companyId as Id<"companies">, args);
  },
});

/**
 * One minute's live figures for a company's own website: the Live page's ask,
 * and Ask Hakken's (google-analytics-plan.md §18.6.8). Nothing is kept.
 */
export async function askLiveFigures(
  ctx: ActionCtx,
  companyId: Id<"companies">,
  args: { siteId: Id<"companyWebsites">; device: string; list: (typeof LIVE_LISTS)[number] },
): Promise<LiveAnswer> {
  const found = await ctx.runQuery(internal.googleAnalyticsLive.liveTarget, { companyId, siteId: args.siteId, period: OPENING_PERIOD });
  if (!found) return { ok: false as const, problem: "NOT_CONNECTED" as const };
  const opened = await openSession(ctx, found.connectionId);
  if (!opened.ok) return { ok: false as const, problem: opened.problem === "GOOGLE_BUSY" ? "GOOGLE_BUSY" as const : "NOT_CONNECTED" as const };
  // Every country: no home country here, unlike every other screen.
  const base = args.device ? { device: args.device } : {};
  const chosen: RealtimeAsk | null = args.list === "devices" ? { ...base, dimensions: ["deviceCategory"], metrics: ["activeUsers"] }
    : args.list === "events" ? { ...base, dimensions: ["eventName"], metrics: ["activeUsers", "eventCount"] } : null;
  const asks: Record<string, RealtimeAsk> = {
    now: { ...base, dimensions: [], metrics: ["activeUsers"], minutes: { from: 4, to: 0 } },
    last: { ...base, dimensions: [], metrics: ["activeUsers", "screenPageViews"] },
    minutes: { ...base, dimensions: ["minutesAgo"], metrics: ["activeUsers"] },
    places: { ...base, dimensions: ["city"], metrics: ["activeUsers"] },
    countries: { ...base, dimensions: ["countryId"], metrics: ["activeUsers"] },
    pages: { ...base, dimensions: ["unifiedScreenName"], metrics: ["activeUsers", "screenPageViews"] },
    ...(chosen ? { chosen } : {}),
    ...(found.counted.length > 0 ? { conversions: { ...base, dimensions: ["eventName", "minutesAgo"], metrics: ["eventCount"], eventNames: found.counted } } : {}),
  };
  // Asked side by side: one minute's figures together.
  const answered = await Promise.all(Object.entries(asks).map(async ([key, live]) => [key, await askRealtime(opened.session, found.target.property!, live)] as const));
  const rowsOf: Record<string, Array<{ keys: string[]; values: number[] }>> = {};
  for (const [key, answer] of answered) {
    if (!answer.ok) return { ok: false as const, problem: answer.reason === "BUSY" || answer.reason === "UNREACHABLE" ? "GOOGLE_BUSY" as const : "GOOGLE_REFUSED" as const };
    rowsOf[key] = answer.rows;
  }
  const total = (key: string, at = 0) => rowsOf[key]?.[0]?.values[at] ?? 0;
  const listed = (key: string, people: number, views: number | null, times: number | null): LiveRow[] => (rowsOf[key] ?? [])
    .map((row) => ({ name: row.keys[0] ?? "", people: row.values[people] ?? 0, views: views === null ? 0 : row.values[views] ?? 0, times: times === null ? 0 : row.values[times] ?? 0 }))
    .sort((left, right) => right.people - left.people || right.views - left.views || right.times - left.times);
  const minutes = Array.from({ length: MINUTES }, () => 0);
  for (const row of rowsOf.minutes ?? []) {
    const ago = Number(row.keys[0]);
    if (Number.isInteger(ago) && ago >= 0 && ago < MINUTES) minutes[MINUTES - 1 - ago] += row.values[0] ?? 0;
  }
  // The newest conversion: the fewest minutes ago.
  let count = 0;
  let newest: { eventName: string; minutesAgo: number } | null = null;
  for (const row of rowsOf.conversions ?? []) {
    const happened = row.values[0] ?? 0;
    if (happened <= 0) continue;
    count += happened;
    const ago = Number(row.keys[1]);
    if (!newest || ago < newest.minutesAgo) newest = { eventName: row.keys[0] ?? "", minutesAgo: ago };
  }
  const pages = listed("pages", 0, 1, null);
  const places = listed("places", 0, null, null);
  const countries = listed("countries", 0, null, null);
  const rows = args.list === "pages" ? pages : args.list === "places" ? places : listed("chosen", 0, null, args.list === "events" ? 1 : null);
  const now = total("now");
  const people = total("last");
  return {
    ok: true as const,
    askedAt: Date.now(),
    now,
    people,
    views: total("last", 1),
    conversions: { count, eventName: newest?.eventName ?? null, minutesAgo: newest?.minutesAgo ?? null },
    minutes,
    places,
    countries,
    rows,
    seen: liveSees({ now, people, topPage: pages[0] ? { title: pages[0].name, people: pages[0].people } : null, conversion: newest }),
  };
}
