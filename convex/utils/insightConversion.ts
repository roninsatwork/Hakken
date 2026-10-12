import { v, type Infer } from "convex/values";
import type { Fact } from "./insightFacts";
import { missingStructuredData, type PageFacts } from "./moneyPageChecks";

/**
 * The Conversion specialist's pages (docs/plans/active/insights-analyst-plan.md
 * §4.1, phase 14, drawn as the Funnel, Page reviews, PageDetail and
 * Experiments boards): from being shown on Google to enquiring, against a year
 * before; each source's enquiry rate; each money page's review — how many
 * visitors it takes to win one enquiry, and Hakken's verdict — and the
 * changes worth making, each measured before and after.
 */

export const FUNNEL_STEPS = ["SHOWN", "CLICKED", "VISITED", "ENQUIRED"] as const;
export const funnelStepValidator = v.object({
  step: v.union(...FUNNEL_STEPS.map((step) => v.literal(step))),
  now: v.union(v.number(), v.null()),
  year: v.union(v.number(), v.null()),
  source: v.union(v.literal("searchConsole"), v.literal("analytics")),
});
export type FunnelStep = Infer<typeof funnelStepValidator>;

export const sourceRowValidator = v.object({ channel: v.string(), visits: v.number(), enquiries: v.number(), visitsBefore: v.union(v.number(), v.null()), enquiriesBefore: v.union(v.number(), v.null()) });
export type SourceRow = Infer<typeof sourceRowValidator>;

export const VERDICTS = ["REWRITE_TOP", "ADD_PROOF", "MOVE_BUTTON", "ADD_PRICE", "ADD_COMPANY_FACTS", "KEEP"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const pageReviewValidator = v.object({
  page: v.string(),
  title: v.union(v.string(), v.null()),
  kind: v.union(v.string(), v.null()),
  visits: v.number(),
  enquiries: v.number(),
  visitsBefore: v.union(v.number(), v.null()),
  enquiriesBefore: v.union(v.number(), v.null()),
  /** Its last 90 days, for the review's chart beside the two years. */
  visits90: v.optional(v.union(v.number(), v.null())),
  enquiries90: v.optional(v.union(v.number(), v.null())),
  verdict: v.union(...VERDICTS.map((verdict) => v.literal(verdict))),
  /** Why, in a sentence; and the first steps, each a sentence. Hakken's words, never the page's (I22). */
  reason: v.string(),
  steps: v.array(v.string()),
});
export type PageReview = Infer<typeof pageReviewValidator>;

export const conversionValidator = v.object({
  funnel: v.array(funnelStepValidator),
  sources: v.array(sourceRowValidator),
  pages: v.array(pageReviewValidator),
});
export type Conversion = Infer<typeof conversionValidator>;

/** Visitors for one enquiry, whole; null with no enquiries. */
export function perEnquiry(visits: number, enquiries: number | null): number | null {
  return enquiries && enquiries > 0 ? Math.round(visits / enquiries) : null;
}

/** Google's funnel over 90 days against the same days a year before: shown, clicked, visited, enquired. */
export function funnelFrom(facts: readonly Fact[]): FunnelStep[] {
  const at = new Map(facts.map((fact) => [fact.key, fact.value]));
  const pair = (now: string, year: string) => ({ now: at.get(now) ?? null, year: at.get(year) ?? null });
  return [
    { step: "SHOWN", ...pair("sc.impressions.90.now", "sc.impressions.90.year"), source: "searchConsole" },
    { step: "CLICKED", ...pair("sc.clicks.90.now", "sc.clicks.90.year"), source: "searchConsole" },
    { step: "VISITED", ...pair("ga.channel.Organic Search.visits.90.now", "ga.channel.Organic Search.visits.90.year"), source: "analytics" },
    { step: "ENQUIRED", ...pair("ga.channel.Organic Search.conversions.90.now", "ga.channel.Organic Search.conversions.90.year"), source: "analytics" },
  ];
}

/** Each source's visits and enquiries over 12 months against the 12 before, the most visits first. */
export function sourcesFrom(facts: readonly Fact[]): SourceRow[] {
  const at = new Map(facts.map((fact) => [fact.key, fact.value]));
  const channels = [...new Set(facts.map((fact) => /^ga\.channel\.(.+)\.visits\.365\.now$/.exec(fact.key)?.[1]).filter((name): name is string => Boolean(name)))];
  return channels
    .map((channel) => ({
      channel,
      visits: at.get(`ga.channel.${channel}.visits.365.now`) ?? 0,
      enquiries: at.get(`ga.channel.${channel}.conversions.365.now`) ?? 0,
      visitsBefore: at.get(`ga.channel.${channel}.visits.365.before`) ?? null,
      enquiriesBefore: at.get(`ga.channel.${channel}.conversions.365.before`) ?? null,
    }))
    .filter((row) => row.visits > 0)
    .sort((a, b) => b.visits - a.visits);
}

/** A page's verdict by rule, for when the Conversion specialist can't be asked: the first that applies. */
export function verdictByRule(page: { kind: string | null; visits: number; enquiries: number; visitsBefore: number | null; enquiriesBefore: number | null }, facts: PageFacts | null, structured: readonly string[] | null): Verdict {
  const now = perEnquiry(page.visits, page.enquiries), before = page.visitsBefore !== null ? perEnquiry(page.visitsBefore, page.enquiriesBefore) : null;
  if (now !== null && before !== null && now >= before * 1.5) return "REWRITE_TOP";
  if (structured && missingStructuredData(page.kind, structured).includes("ORGANISATION")) return "ADD_COMPANY_FACTS";
  if (facts && facts.firstAsk !== null && facts.firstAsk > 0.3) return "MOVE_BUTTON";
  if (facts && !facts.price && page.kind === "SERVICE") return "ADD_PRICE";
  if (facts && !facts.proof) return "ADD_PROOF";
  return "KEEP";
}

/** How the Conversion specialist reviews the pages. */
export const REVIEW_RULES = [
  "You are the Conversion specialist. For each money page you are given its figures — visits and enquiries over 12 months against the 12 before — and what its words show: headline, price, proof, form, how far down it first asks, and its opening; and, where Microsoft Clarity is connected, how visitors behave on it — how far they scroll, dead and rage clicks, quick backs.",
  `Give each page one verdict: ${VERDICTS.join(", ")}. REWRITE_TOP when its opening no longer matches what its visitors came for; ADD_PROOF when it asks without showing results; MOVE_BUTTON when the first way to enquire comes late; ADD_PRICE when buyers can't tell what it costs; ADD_COMPANY_FACTS only for the home or about page whose structured data lacks Organization, LocalBusiness or ProfessionalService; KEEP when it works.`,
  "Say why in one plain sentence, and give two first steps, each a sentence saying what the page should do — never rewrite its words (I22). Never invent a figure: use only those given, and none in your sentences.",
  "Never write the word \"push\". Answer only with JSON: {\"pages\": [{\"page\": the path given, \"verdict\": one of the verdicts, \"reason\": a sentence, \"steps\": [two sentences]}]}.",
].join("\n");
