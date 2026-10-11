import { v, type Infer } from "convex/values";
import type { Fact } from "./insightFacts";
import { leaguesFrom, type LeagueId } from "./insightLeagues";
import { enquiryCheckValidator } from "./insightEnquiryCheck";

/**
 * The executive summary's scorecard (docs/plans/active/insights-analyst-plan.md
 * §4.1, drawn as the Main board): each measure a board reads, the last 90
 * days against the same weeks last year (I12, I43) and against the rivals
 * where there is a league for it, with a plain status. Worked out in the
 * team's run from the facts it read and saved with the week, so the summary
 * opens without reading the sources again (§8).
 */

export const SCORE_MEASURES = [
  "enquiries", "visitors", "visitorsPerEnquiry", "googleVisits", "googleClicksPerEnquiry", "googleEnquiries",
  "aiVisits", "marketShare", "aiMentions", "strength", "reviews",
] as const;
export type ScoreMeasure = (typeof SCORE_MEASURES)[number];

export const scoreValidator = v.object({
  measure: v.union(...SCORE_MEASURES.map((measure) => v.literal(measure))),
  now: v.union(v.number(), v.null()),
  before: v.union(v.number(), v.null()),
  /** "percent" for a share; the rest are counts. */
  unit: v.union(v.literal("count"), v.literal("percent")),
  lowerIsBetter: v.boolean(),
  place: v.union(v.number(), v.null()),
  places: v.union(v.number(), v.null()),
  status: v.union(v.literal("ON_TRACK"), v.literal("WATCH"), v.literal("BEHIND")),
});
export type Score = Infer<typeof scoreValidator>;

export const monthValidator = v.object({ month: v.string(), visits: v.number(), conversions: v.number() });
export const shareMonthValidator = v.object({ month: v.string(), you: v.number(), total: v.number() });

export const weekSummaryValidator = v.object({
  scorecard: v.array(scoreValidator),
  /** Whether each real enquiry counts once (I42); absent on weeks before the check. */
  enquiryCheck: v.optional(enquiryCheckValidator),
  enquiriesByMonth: v.array(monthValidator),
  shareByMonth: v.array(shareMonthValidator),
  /** How many facts the team read, and explanations its specialists ruled out. */
  checked: v.number(),
  ruledOut: v.number(),
});
export type WeekSummary = Infer<typeof weekSummaryValidator>;

const LEAGUE_OF: Partial<Record<ScoreMeasure, LeagueId>> = { googleVisits: "traffic", marketShare: "traffic", aiMentions: "mindshare", strength: "strength", reviews: "reviews", aiVisits: "recommended" };

/** On track when it moved the right way by a tenth, behind when the wrong way by a tenth, or last of its rivals; otherwise watch. */
function statusOf(now: number | null, before: number | null, lowerIsBetter: boolean, place: number | null, places: number | null): Score["status"] {
  if (now !== null && before !== null && before > 0) {
    const moved = (now - before) / before * (lowerIsBetter ? -1 : 1);
    if (moved <= -0.1) return "BEHIND";
    if (moved >= 0.1) return "ON_TRACK";
  }
  if (place !== null && places !== null) {
    if (place === places && places > 1) return "BEHIND";
    if (place <= 2) return "ON_TRACK";
  }
  return "WATCH";
}

export function scorecardFrom(facts: readonly Fact[], own: string): Score[] {
  const at = new Map(facts.map((fact) => [fact.key, fact.value]));
  const get = (key: string) => at.get(key) ?? null;
  const per = (top: number | null, bottom: number | null) => (top !== null && bottom !== null && bottom > 0 ? Math.round(top / bottom) : null);
  const leagues = leaguesFrom(facts, own);
  const placeOf = (measure: ScoreMeasure) => {
    const league = leagues.find((entry) => entry.id === LEAGUE_OF[measure]);
    return { place: league?.place ?? null, places: league ? league.rows.length : null };
  };
  const hosts = [...new Set(facts.map((fact) => /^seo\.(.+)\.traffic\.now$/.exec(fact.key)?.[1]).filter((host): host is string => Boolean(host)))];
  const share = (which: "now" | "year") => {
    const values = hosts.map((host) => get(`seo.${host}.traffic.${which}`));
    if (values.some((value) => value === null)) return null;
    const total = (values as number[]).reduce((a, b) => a + b, 0);
    const mine = get(`seo.${own}.traffic.${which}`);
    return total > 0 && mine !== null ? Math.round((mine / total) * 1000) / 10 : null;
  };
  const ownReviews = facts.filter((fact) => /^local\.own\..+\.reviews$/.test(fact.key)).reduce<number | null>((most, fact) => Math.max(most ?? 0, fact.value), null);
  const rows: Array<Omit<Score, "status" | "place" | "places">> = [
    { measure: "enquiries", now: get("ga.conversions.90.now"), before: get("ga.conversions.90.year"), unit: "count", lowerIsBetter: false },
    { measure: "visitors", now: get("ga.people.90.now"), before: get("ga.people.90.year"), unit: "count", lowerIsBetter: false },
    { measure: "visitorsPerEnquiry", now: get("ga.peoplePerConversion.90.now"), before: get("ga.peoplePerConversion.90.year"), unit: "count", lowerIsBetter: true },
    { measure: "googleVisits", now: get("ga.channel.Organic Search.visits.90.now"), before: get("ga.channel.Organic Search.visits.90.year"), unit: "count", lowerIsBetter: false },
    { measure: "googleClicksPerEnquiry", now: per(get("sc.clicks.90.now"), get("ga.channel.Organic Search.conversions.90.now")), before: per(get("sc.clicks.90.year"), get("ga.channel.Organic Search.conversions.90.year")), unit: "count", lowerIsBetter: true },
    { measure: "googleEnquiries", now: get("ga.channel.Organic Search.conversions.90.now"), before: get("ga.channel.Organic Search.conversions.90.year"), unit: "count", lowerIsBetter: false },
    { measure: "aiVisits", now: get("ga.channel.AI assistants.visits.90.now"), before: get("ga.channel.AI assistants.visits.90.year"), unit: "count", lowerIsBetter: false },
    { measure: "marketShare", now: share("now"), before: share("year"), unit: "percent", lowerIsBetter: false },
    { measure: "aiMentions", now: get(`ai.${own}.mentions.now`), before: get(`ai.${own}.mentions.year`), unit: "count", lowerIsBetter: false },
    { measure: "strength", now: get(`seo.${own}.strength.now`), before: get(`seo.${own}.strength.year`), unit: "count", lowerIsBetter: false },
    { measure: "reviews", now: ownReviews, before: null, unit: "count", lowerIsBetter: false },
  ];
  return rows
    .filter((row) => row.now !== null)
    .map((row) => {
      const { place, places } = placeOf(row.measure);
      return { ...row, place, places, status: statusOf(row.now, row.before, row.lowerIsBetter, place, places) };
    });
}

/**
 * A report, frozen as written (§4.1, §4.2, I6, I7): its words with the figures
 * filled in, the scorecard and the charts' figures as they were that day,
 * the findings it names, what Hakken did, and — for the board — the risks,
 * the opportunities and the decision it recommends. Never rewritten.
 */
export const reportBodyValidator = v.object({
  headline: v.string(),
  summary: v.string(),
  /** "In one minute" for the board; what happened for a month; the findings for a week. */
  points: v.array(v.string()),
  next: v.array(v.string()),
  risks: v.array(v.string()),
  opportunities: v.array(v.string()),
  decision: v.union(v.string(), v.null()),
  scorecard: v.array(scoreValidator),
  findings: v.array(v.object({ findingId: v.union(v.id("insightFindings"), v.null()), headline: v.string(), action: v.string() })),
  did: v.array(v.object({ work: v.string(), count: v.number() })),
  enquiriesByMonth: v.array(monthValidator),
  shareByMonth: v.array(shareMonthValidator),
  /** The figures the words were filled from, as read that day. */
  facts: v.array(v.object({ key: v.string(), label: v.string(), value: v.number(), unit: v.string() })),
});
export type ReportBody = Infer<typeof reportBodyValidator>;

export const REPORT_KINDS = ["WEEKLY", "MONTHLY", "BOARD"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
