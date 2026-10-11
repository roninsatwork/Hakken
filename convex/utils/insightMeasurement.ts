import { v, type Infer } from "convex/values";
import type { Fact } from "./insightFacts";
import type { EnquiryCheck } from "./insightEnquiryCheck";

/**
 * The Measurement check (docs/plans/active/insights-analyst-plan.md §4.1,
 * phase 13, drawn as the Measurement board): before Hakken advises on
 * conversion, whether the figures can be trusted — each real enquiry counted
 * once (I42), every way to enquire counted, enquiries valued, every visit on a
 * page, Google and Analytics agreeing home country with home country (I33),
 * and Google tying its clicks to pages (S2).
 *
 * Analytics' own checks (google-analytics-plan.md §6) are read as they are,
 * never worked out twice (I38); the rest from the facts the team read. Worked
 * out in the run and saved with the week, so the page and the findings agree.
 */

export const MEASUREMENT_CHECKS = [
  "enquiryCounted", "everyWayCounted", "enquiriesValued", "visitsHavePage", "googleAgrees", "googleTiesPages",
  "analyticsSteady", "referralsReal", "onlyThisWebsite",
] as const;
export type MeasurementCheckId = (typeof MEASUREMENT_CHECKS)[number];

export const MEASUREMENT_STATUSES = ["LOOK", "LIMIT", "UNKNOWN", "PASSING"] as const;
export type MeasurementStatus = (typeof MEASUREMENT_STATUSES)[number];

export const measurementCheckValidator = v.object({
  check: v.union(...MEASUREMENT_CHECKS.map((check) => v.literal(check))),
  status: v.union(...MEASUREMENT_STATUSES.map((status) => v.literal(status))),
  /** What it found, as a code its words name. */
  found: v.string(),
  names: v.array(v.string()),
  a: v.union(v.number(), v.null()),
  b: v.union(v.number(), v.null()),
});
export type MeasurementCheck = Infer<typeof measurementCheckValidator>;

export const measurementDayValidator = v.object({ day: v.string(), clicks: v.number(), visits: v.number() });
export type MeasurementDay = Infer<typeof measurementDayValidator>;

export const measurementValidator = v.object({
  checks: v.array(measurementCheckValidator),
  /** Google's clicks and Analytics' visits from Google, a day each, the main home country. */
  byDay: v.array(measurementDayValidator),
});
export type Measurement = Infer<typeof measurementValidator>;

/** Analytics' own result for one of its checks, as the connection keeps it. */
export type AnalyticsHealth = { check: string; passing: boolean; names?: string[]; count?: number; share?: number };

/** Analytics within a fifth of Google's clicks reads as agreeing. */
const AGREE_WITHIN = 0.2;
/** Google ties at least this share of its clicks to a page before it reads as whole. */
const TIED_WHOLE = 0.9;
/** Fewer enquiries than this in 12 months, and the count says nothing either way. */
const FEW = 20;

const row = (check: MeasurementCheckId, status: MeasurementStatus, found: string, extra: Partial<Pick<MeasurementCheck, "names" | "a" | "b">> = {}): MeasurementCheck => ({
  check, status, found, names: extra.names ?? [], a: extra.a ?? null, b: extra.b ?? null,
});

const percent = (share: number) => Math.round(share * 100);

export function measurementFrom(facts: readonly Fact[], enquiries: EnquiryCheck, health: readonly AnalyticsHealth[] | null): MeasurementCheck[] {
  const at = new Map(facts.map((fact) => [fact.key, fact.value]));
  const counted = facts
    .map((fact) => /^ga\.counted\.(.+)\.times\.365\.now$/.exec(fact.key)?.[1])
    .filter((event): event is string => Boolean(event))
    .map((event) => ({ event, times: at.get(`ga.counted.${event}.times.365.now`) ?? 0 }));
  const analytics = health !== null;
  const result = (check: string) => health?.find((entry) => entry.check === check) ?? null;
  const checks: MeasurementCheck[] = [];

  // Each real enquiry counted once (I42): first, because every enquiry figure rests on it.
  const times = counted.reduce((sum, event) => sum + event.times, 0);
  const problem = enquiries.problems[0];
  if (!analytics) checks.push(row("enquiryCounted", "UNKNOWN", "noAnalytics"));
  else if (problem) checks.push(row("enquiryCounted", "LOOK", problem.code, { names: [problem.event, problem.other ?? ""].filter(Boolean), a: problem.a, b: problem.b }));
  else if (times < FEW) checks.push(row("enquiryCounted", "UNKNOWN", "tooFew", { a: times }));
  else checks.push(row("enquiryCounted", "PASSING", "countsOnce", { a: times }));

  // Every way to enquire counted: a counted event that never fired in 12 months.
  const never = counted.filter((event) => event.times === 0).map((event) => event.event);
  if (!analytics) checks.push(row("everyWayCounted", "UNKNOWN", "noAnalytics"));
  else if (counted.length === 0) checks.push(row("everyWayCounted", "LOOK", "nothingCounted"));
  else if (never.length > 0) checks.push(row("everyWayCounted", "LOOK", "neverFired", { names: never, a: never.length, b: counted.length }));
  else checks.push(row("everyWayCounted", "PASSING", "allFired", { a: counted.length }));

  // Enquiries valued, every visit on a page: Analytics' own checks, as they are.
  const value = result("NO_VALUE");
  if (!value) checks.push(row("enquiriesValued", "UNKNOWN", "noAnalytics"));
  else checks.push(value.passing ? row("enquiriesValued", "PASSING", "valued") : row("enquiriesValued", "LOOK", "noValue", { names: value.names ?? [] }));
  const unknown = result("TOO_MUCH_UNKNOWN");
  if (!unknown) checks.push(row("visitsHavePage", "UNKNOWN", "noAnalytics"));
  else checks.push(row("visitsHavePage", unknown.passing ? "PASSING" : "LOOK", unknown.passing ? "havePage" : "noPage", { a: unknown.count ?? 0, b: percent(unknown.share ?? 0) }));

  // Google's clicks against Analytics' visits from Google, home country with home country (I33).
  const clicks = at.get("sc.clicks.90.now"), visits = at.get("ga.channel.Organic Search.visits.90.now");
  if (clicks === undefined || visits === undefined || clicks === 0) checks.push(row("googleAgrees", "UNKNOWN", "needsBoth"));
  else {
    const share = visits / clicks;
    const found = Math.abs(share - 1) <= AGREE_WITHIN ? "agree" : share < 1 ? "fewer" : "more";
    checks.push(row("googleAgrees", found === "agree" ? "PASSING" : "LOOK", found, { a: visits, b: clicks }));
  }

  // The clicks Google ties to a page (S2): Google's own limit, said so, never a fault.
  const tied = at.get("sc.tiedClicks.90.now");
  if (clicks === undefined || tied === undefined || clicks === 0) checks.push(row("googleTiesPages", "UNKNOWN", "needsSearchConsole"));
  else {
    const share = Math.min(1, tied / clicks);
    checks.push(row("googleTiesPages", share >= TIED_WHOLE ? "PASSING" : "LIMIT", share >= TIED_WHOLE ? "tied" : "partTied", { a: percent(share), b: clicks }));
  }

  // Analytics still counting, referrals that are people, and only this website counted.
  const stopped = result("TRACKING_STOPPED"), fell = result("SUDDEN_FALL");
  if (!stopped || !fell) checks.push(row("analyticsSteady", "UNKNOWN", "noAnalytics"));
  else if (!stopped.passing) checks.push(row("analyticsSteady", "LOOK", "stopped", { names: stopped.names ?? [] }));
  else if (!fell.passing) checks.push(row("analyticsSteady", "LOOK", "fell", { names: fell.names ?? [], a: percent(fell.share ?? 0) }));
  else checks.push(row("analyticsSteady", "PASSING", "steady"));
  const self = result("SELF_REFERRAL"), payments = result("PAYMENT_REFERRALS");
  if (!self || !payments) checks.push(row("referralsReal", "UNKNOWN", "noAnalytics"));
  else if (!self.passing) checks.push(row("referralsReal", "LOOK", "selfReferral", { names: self.names ?? [], a: self.count ?? 0 }));
  else if (!payments.passing) checks.push(row("referralsReal", "LOOK", "paymentReferrals", { names: payments.names ?? [], a: payments.count ?? 0 }));
  else checks.push(row("referralsReal", "PASSING", "real"));
  const strangers = result("STRANGERS");
  if (!strangers) checks.push(row("onlyThisWebsite", "UNKNOWN", "noAnalytics"));
  else checks.push(strangers.passing ? row("onlyThisWebsite", "PASSING", "only") : row("onlyThisWebsite", "LOOK", "strangers", { names: strangers.names ?? [], a: strangers.count ?? 0 }));

  return checks;
}

/** The checks in words for the Measurement specialist's brief: English, as findings are written. */
export function measurementBrief(checks: readonly MeasurementCheck[]): string | null {
  const look = checks.filter((check) => check.status === "LOOK");
  if (look.length === 0) return null;
  return `The Measurement check found ${look.length} thing${look.length === 1 ? "" : "s"} to look at: ${look.map((check) => `${check.check} (${check.found}${check.names.length > 0 ? `: ${check.names.join(", ")}` : ""})`).join("; ")}. Say what each means for the figures, and what to fix first.`;
}
