import { v, type Infer } from "convex/values";

/**
 * The quarter's strategy (docs/plans/active/insights-analyst-plan.md §4.1,
 * drawn as the Strategy board): each of the business's services — its
 * service pages and home page, with its articles together as its guides —
 * judged on what buyers search for, which pages bring enquiries, and how that
 * moved, as one of five calls: grow it, keep it steady, use buyers' words,
 * your call, or for readers. Worked out in the team's run, any business alike
 * (I4), from figures Hakken already holds.
 */

export const VERDICTS = ["GROW", "STEADY", "BUYERS_WORDS", "YOUR_CALL", "READERS"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const serviceValidator = v.object({
  /** The service's page (its path), or "guides" for the articles together. */
  page: v.string(),
  title: v.union(v.string(), v.null()),
  kind: v.union(v.literal("SERVICE"), v.literal("HOME"), v.literal("GUIDES")),
  enquiries: v.number(),
  enquiriesBefore: v.union(v.number(), v.null()),
  visits: v.number(),
  people: v.number(),
  clicks: v.number(),
  clicksBefore: v.union(v.number(), v.null()),
  impressions: v.number(),
  impressionsBefore: v.union(v.number(), v.null()),
  verdict: v.union(...VERDICTS.map((verdict) => v.literal(verdict))),
});
export type Service = Infer<typeof serviceValidator>;

/** A move as a share of where it was; null from nothing. */
const moved = (now: number, before: number | null) => (before && before > 0 ? (now - before) / before : null);

/**
 * The call for a service, as the drawn strategy makes it: guides are for
 * readers; a service whose enquiries grew a fifth or more — or that is new
 * this year and already brings three — is one to grow; one whose enquiries
 * halved needs the words its buyers use now when it used to win work (ten a
 * year or more), and is your call when it was always small; the rest are
 * kept steady. Without last year's figures, five enquiries or more is one to
 * grow.
 */
export function verdictOf(service: Omit<Service, "verdict">): Verdict {
  if (service.kind === "GUIDES") return "READERS";
  if (service.enquiriesBefore === null) return service.enquiries >= 5 ? "GROW" : "STEADY";
  if (service.enquiriesBefore === 0) return service.enquiries >= 3 ? "GROW" : "STEADY";
  const enquiries = moved(service.enquiries, service.enquiriesBefore) ?? 0;
  if (enquiries <= -0.5) return service.enquiriesBefore >= 10 ? "BUYERS_WORDS" : "YOUR_CALL";
  if (enquiries >= 0.2 && service.enquiries >= 3) return "GROW";
  return "STEADY";
}

/** The services worth a row: every one with an enquiry or a click in either year, most enquiries first. */
export function rankedServices(services: Array<Omit<Service, "verdict">>): Service[] {
  return services
    .filter((service) => service.enquiries > 0 || (service.enquiriesBefore ?? 0) > 0 || service.clicks > 0)
    .map((service) => ({ ...service, verdict: verdictOf(service) }))
    .sort((a, b) => b.enquiries - a.enquiries || b.clicks - a.clicks)
    .slice(0, 40);
}
