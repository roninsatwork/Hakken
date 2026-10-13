import { v, type Infer } from "convex/values";
import { decidedFields, readingOf, stillDecided, whyText } from "./insightDecided";

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
  // Who called it and why (utils/insightDecided.ts): the rule, or the Head of Strategy (insights-one-voice-plan.md phase 3).
  ...decidedFields,
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

/** The reading a service's call is made on: the rule's call for the same kind of service, the same reading. */
export function serviceReading(service: Pick<Service, "verdict" | "kind">): string {
  return readingOf([service.verdict, service.kind]);
}

/** Last week's Head of Strategy's calls kept where the rule calls a service the same; returns how many. */
export function carryServices(services: Service[], before: readonly Service[]): number {
  const last = new Map(before.map((service) => [service.page, service]));
  let kept = 0;
  for (const service of services) {
    const held = last.get(service.page);
    if (!held || !stillDecided(service, held)) continue;
    Object.assign(service, { verdict: held.verdict, why: held.why, decidedBy: "AGENT", decidedWeek: held.decidedWeek });
    kept += 1;
  }
  return kept;
}

/**
 * The services the Head of Strategy is asked to call: those that brought an
 * enquiry this year — not guides, which are for readers, and not called
 * already. The rest keep the rule's call, labelled as the rule's, so its
 * time goes on the services that bring work (Anthony, 13 October 2026: 32
 * services took it 3m41s of its 4½ minutes).
 */
export function servicesToCall(services: readonly Service[]): Service[] {
  return services.filter((service) => service.kind !== "GUIDES" && service.enquiries > 0 && service.decidedBy !== "AGENT");
}

/**
 * The Head of Strategy's calls put on the services it was asked about, each
 * with its sentence: one of the calls a service can have — never "for
 * readers", which is the guides' — and nothing it wasn't asked about.
 */
export function applyServiceCalls(asked: readonly Service[], raw: unknown, week: string) {
  const byPage = new Map(asked.map((service) => [service.page, service]));
  let changed = 0, kept = 0, refused = 0;
  for (const entry of Array.isArray(raw) ? raw : []) {
    const { page, call, why } = (entry ?? {}) as { page?: unknown; call?: unknown; why?: unknown };
    const service = typeof page === "string" ? byPage.get(page) : undefined;
    const verdict = typeof call === "string" && (VERDICTS as readonly string[]).includes(call) && call !== "READERS" ? (call as Verdict) : undefined;
    const reason = whyText(why);
    if (!service || !verdict || !reason) {
      refused += 1;
      continue;
    }
    if (verdict === service.verdict) kept += 1;
    else changed += 1;
    Object.assign(service, { verdict, why: reason, decidedBy: "AGENT", decidedWeek: week });
  }
  return { changed, kept, refused };
}

/** Each call as Ask Hakken reads it (the screens word them from `insights.strategy.verdicts`). */
const CALL_WORDS: Record<Verdict, string> = {
  GROW: "grow it", STEADY: "keep it steady", BUYERS_WORDS: "use the words its buyers use now", YOUR_CALL: "your call: it was always small", READERS: "for readers",
};

/** Strategy's calls for Ask Hakken, as kept, with why and who called each. */
export function servicesForAssistant(services: readonly Service[]) {
  return {
    rule: "Strategy's call for each of the business's services, as kept. Give them as written; never your own call.",
    link: "/app/insights/strategy",
    services: services.map((service) => ({
      service: service.title ?? service.page,
      page: service.page,
      call: CALL_WORDS[service.verdict],
      ...(service.why ? { why: service.why } : {}),
      called_by: service.decidedBy === "AGENT" ? `the Head of Strategy${service.decidedWeek ? `, on ${service.decidedWeek}` : ""}` : "the rule",
    })),
  };
}

