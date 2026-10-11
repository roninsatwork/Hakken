import { v, type Infer } from "convex/values";

/**
 * Opportunities and the page plan (docs/plans/active/insights-analyst-plan.md
 * §4.1, phase 9, drawn as the Opportunities and Page plan boards): the
 * searches a website nearly wins, ranked by what winning them is worth — how
 * often each is made, where the website stands and how well the page it lands
 * on turns visitors into enquiries — and which page should win which search,
 * with what to do to each page. What each page should do, never its words
 * (I22: no rewriting).
 *
 * Worked out in the team's run from Search Console, Visibility and Analytics
 * together, and kept with the website, newest only.
 */

export const opportunityValidator = v.object({
  search: v.string(),
  /** Search Console's average place over 90 days, else Google's own results'. */
  place: v.number(),
  /** Searches a month, where Google's results say. */
  volume: v.union(v.number(), v.null()),
  /** Times Google showed the website for it in 90 days. */
  shown: v.union(v.number(), v.null()),
  page: v.union(v.string(), v.null()),
  /** The service page it belongs to, where the page is one. */
  service: v.union(v.string(), v.null()),
  /** The page's share of visits that enquire over 12 months, a percent to one place. */
  rate: v.union(v.number(), v.null()),
  /** Enquiries a month it would bring in Google's top three, where the page's rate is known. */
  worth: v.union(v.number(), v.null()),
});
export type Opportunity = Infer<typeof opportunityValidator>;

/** In the order the plan lists them: enquiries lost first, then what is within reach, then what to keep. */
export const PLAN_ACTIONS = ["REBUILD", "RESTORE", "STRENGTHEN", "CREATE", "REFRESH", "REFRESH_OR_RETIRE", "KEEP_ROUTE", "KEEP"] as const;
export type PlanAction = (typeof PLAN_ACTIONS)[number];

export const planPageValidator = v.object({
  page: v.string(),
  title: v.union(v.string(), v.null()),
  /** The searches the page should win: its biggest within reach. */
  shouldWin: v.array(v.string()),
  action: v.union(...PLAN_ACTIONS.map((action) => v.literal(action))),
  /** Why, as a code its words name, with its figures. */
  why: v.string(),
  a: v.union(v.number(), v.null()),
  b: v.union(v.number(), v.null()),
  enquiries: v.number(),
  enquiriesBefore: v.union(v.number(), v.null()),
  /** Enquiries a year at stake, for the order. */
  stake: v.number(),
});
export type PlanPage = Infer<typeof planPageValidator>;

export const planValidator = v.object({
  opportunities: v.array(opportunityValidator),
  pages: v.array(planPageValidator),
  /** The website's share of visits that enquire over 12 months, a percent to one place. */
  siteRate: v.union(v.number(), v.null()),
});
export type Plan = Infer<typeof planValidator>;

/** A page's 12 months against the 12 before, from Analytics' landing pages. */
export type PageFigures = {
  page: string;
  kind: string | null;
  title: string | null;
  visits: number;
  enquiries: number;
  visitsBefore: number | null;
  enquiriesBefore: number | null;
};
/** A search the website ranks for in Google's results (Visibility). */
export type RankedSearch = { keyword: string; position: number; page: string; volume: number | null };
/** A search from Search Console's 90 days. */
export type ConsoleSearch = { search: string; impressions: number; position: number; brand: boolean };
/** A page change from the change log (I25). */
export type PlanChange = { kind: string; from: string | null; to: string | null; before: number; after: number; result: string };

/** The places a search is nearly won from. */
export const NEAR = { from: 4, to: 30 } as const;
/** Opportunities kept at most. */
const MOST_OPPORTUNITIES = 100;
/** Pages in the plan at most. */
const MOST_PAGES = 30;
/** Search Console searches below this many showings are too few to list without Google's own count. */
const SHOWN_FLOOR = 50;
/** A page needs this many visits in 12 months before its rate says anything. */
const RATE_FLOOR = 30;
/** Pages to strengthen at most: the few nearest wins, not every page within reach. */
const MOST_TO_STRENGTHEN = 3;
/** A page to strengthen has at least this many visits a year behind its rate. */
const STRENGTHEN_FLOOR = 50;

/** Roughly the share of searchers who click a result at each place (industry click curves, rounded). */
function clickShare(place: number): number {
  const curve = [0.28, 0.15, 0.1, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02, 0.018];
  if (place <= 10) return curve[Math.max(0, Math.round(place) - 1)];
  return place <= 20 ? 0.01 : 0.005;
}
/** The top three's average share: what winning a search means here. */
const TOP_THREE = (0.28 + 0.15 + 0.1) / 3;

const oneDecimal = (value: number) => Math.round(value * 10) / 10;
const rateOf = (enquiries: number, visits: number) => (visits > 0 ? oneDecimal((enquiries / visits) * 100) : null);
/** A page's rate, only where its visits are enough to say. */
const pageRate = (page: PageFigures | undefined) => (page && page.visits >= RATE_FLOOR ? rateOf(page.enquiries, page.visits) : null);

export function opportunitiesFrom(ranked: readonly RankedSearch[], consoleSearches: readonly ConsoleSearch[], pages: readonly PageFigures[]): Opportunity[] {
  const byPage = new Map(pages.map((page) => [page.page, page]));
  const fromConsole = new Map(consoleSearches.filter((search) => !search.brand).map((search) => [search.search.toLowerCase(), search]));
  const brand = new Set(consoleSearches.filter((search) => search.brand).map((search) => search.search.toLowerCase()));
  const seen = new Set<string>();
  const out: Opportunity[] = [];
  const add = (search: string, place: number, volume: number | null, shown: number | null, page: string | null) => {
    const key = search.toLowerCase();
    if (seen.has(key) || brand.has(key) || place < NEAR.from || place > NEAR.to) return;
    seen.add(key);
    const figures = page ? byPage.get(page) : undefined;
    const rate = pageRate(figures);
    const monthly = volume ?? (shown !== null ? shown / 3 : null);
    const worth = rate !== null && monthly !== null ? oneDecimal(monthly * Math.max(0, TOP_THREE - clickShare(place)) * (rate / 100)) : null;
    out.push({ search, place, volume, shown, page, service: figures && (figures.kind === "SERVICE" || figures.kind === "HOME") ? page : null, rate, worth });
  };
  for (const row of ranked) {
    const console = fromConsole.get(row.keyword.toLowerCase());
    add(row.keyword, console ? oneDecimal(console.position) : row.position, row.volume, console?.impressions ?? null, row.page || null);
  }
  for (const search of fromConsole.values()) {
    if (search.impressions >= SHOWN_FLOOR) add(search.search, oneDecimal(search.position), null, search.impressions, null);
  }
  // Worth most first; those without a page's rate after, by how often they're searched.
  const reach = (row: Opportunity) => (row.volume ?? (row.shown ?? 0) / 3) * Math.max(0, TOP_THREE - clickShare(row.place));
  return out
    .sort((a, b) => (b.worth ?? -1) - (a.worth ?? -1) || reach(b) - reach(a) || a.search.localeCompare(b.search))
    .slice(0, MOST_OPPORTUNITIES);
}

/**
 * Each page's one thing to do, enquiries lost first and the most at stake
 * first within each: rebuild a money page whose enquiries fell away, restore
 * the page that took over a lost one, strengthen the few pages with a good
 * rate where they nearly win, refresh a page that converts less than it did,
 * refresh or retire a guide that stopped bringing work, give a well-read guide
 * a route to enquire, and keep what a merge kept. Creating a page waits for
 * the buyer questions (phase 12).
 */
export function pagePlanFrom(pages: readonly PageFigures[], changes: readonly PlanChange[], opportunities: readonly Opportunity[], siteRate: number | null): Omit<PlanPage, "shouldWin">[] {
  const byPage = new Map(pages.map((page) => [page.page, page]));
  const totalVisits = pages.reduce((sum, page) => sum + page.visits, 0);
  const planned = new Map<string, Omit<PlanPage, "shouldWin">>();
  const plan = (page: string, action: PlanAction, why: string, a: number | null, b: number | null, stake: number) => {
    if (planned.has(page)) return;
    const figures = byPage.get(page);
    planned.set(page, { page, title: figures?.title ?? null, action, why, a, b, enquiries: figures?.enquiries ?? 0, enquiriesBefore: figures?.enquiriesBefore ?? null, stake: oneDecimal(stake) });
  };
  const money = (page: PageFigures) => page.kind === "SERVICE" || page.kind === "HOME" || page.page === "/";
  // A money page whose enquiries fell by half or more.
  for (const page of pages) {
    if (money(page) && page.enquiriesBefore !== null && page.enquiriesBefore >= 10 && page.enquiries <= page.enquiriesBefore * 0.5) {
      plan(page.page, "REBUILD", "fell", page.enquiriesBefore, page.enquiries, page.enquiriesBefore - page.enquiries);
    }
  }
  // A page that took over another's work: restore what was lost, keep what held.
  for (const change of changes) {
    if (!change.to || (change.kind !== "MERGED" && change.kind !== "REPLACED")) continue;
    if (change.result === "LOST") plan(change.to, "RESTORE", "heirLost", change.before, change.after, change.before - change.after);
  }
  // A money page that turns fewer of its visitors into enquiries than it did.
  for (const page of pages) {
    const now = rateOf(page.enquiries, page.visits), before = page.visitsBefore && page.enquiriesBefore !== null ? rateOf(page.enquiriesBefore, page.visitsBefore) : null;
    if (money(page) && page.visits >= 300 && now !== null && before !== null && before >= 1 && now <= before * 0.7) {
      plan(page.page, "REFRESH", "rateFell", before, now, (page.visits * (before - now)) / 100);
    }
  }
  // The pages with a good rate where they nearly win: worth strengthening, the nearest few.
  let strengthened = 0;
  for (const opportunity of opportunities) {
    if (strengthened >= MOST_TO_STRENGTHEN) break;
    if (!opportunity.page || planned.has(opportunity.page) || opportunity.rate === null || (siteRate !== null && opportunity.rate < siteRate)) continue;
    if ((byPage.get(opportunity.page)?.visits ?? 0) < STRENGTHEN_FLOOR) continue;
    plan(opportunity.page, "STRENGTHEN", "bestRate", opportunity.rate, Math.round(opportunity.place), (opportunity.worth ?? 0) * 12);
    strengthened += 1;
  }
  // A guide that stopped bringing work; a guide many read that brings none.
  for (const page of pages) {
    if (page.kind !== "ARTICLE") continue;
    if (page.enquiriesBefore !== null && page.enquiriesBefore >= 5 && page.enquiries <= page.enquiriesBefore * 0.3) {
      plan(page.page, "REFRESH_OR_RETIRE", "guideFell", page.enquiriesBefore, page.enquiries, page.enquiriesBefore - page.enquiries);
    } else if (totalVisits > 0 && page.visits >= totalVisits * 0.05 && page.enquiries <= 1) {
      plan(page.page, "KEEP_ROUTE", "readNotEnquire", Math.round((page.visits / totalVisits) * 100), page.enquiries, (page.visits * (siteRate ?? 0)) / 100);
    }
  }
  for (const change of changes) {
    if (change.to && (change.kind === "MERGED" || change.kind === "REPLACED") && (change.result === "HELD" || change.result === "GREW")) {
      plan(change.to, "KEEP", "mergeKept", change.before, change.after, 0);
    }
  }
  const order = (action: PlanAction) => PLAN_ACTIONS.indexOf(action);
  return [...planned.values()].sort((a, b) => order(a.action) - order(b.action) || b.stake - a.stake).slice(0, MOST_PAGES);
}

/** The website's rate over 12 months, from its landing pages. */
export function siteRateOf(pages: readonly PageFigures[]): number | null {
  return rateOf(pages.reduce((sum, page) => sum + page.enquiries, 0), pages.reduce((sum, page) => sum + page.visits, 0));
}

/** The plan in words for the Search and content specialist's brief: English, as findings are written; what to do, never the words (I22). */
export function planBrief(plan: Plan): string | null {
  if (plan.opportunities.length === 0 && plan.pages.length === 0) return null;
  const searches = plan.opportunities.slice(0, 5).map((row) => `"${row.search}" (place ${row.place}${row.page ? `, lands on ${row.page}` : ""})`);
  const pages = plan.pages.slice(0, 5).map((row) => `${row.page}: ${row.action.toLowerCase().replaceAll("_", " ")}`);
  return [
    searches.length > 0 ? `The searches the website nearly wins, worth most first: ${searches.join("; ")}.` : null,
    pages.length > 0 ? `The page plan: ${pages.join("; ")}.` : null,
    "Advise what each page should do and which search it should win, never its words (I22).",
  ].filter(Boolean).join(" ");
}
