import type { Id } from "@/convex/_generated/dataModel";
import type { SeesAsk } from "@/src/ui/components/screens/HakkenSees";

/**
 * What the Conversions screens hand the Insights team when the eye is pressed
 * (docs/plans/active/sees-conversion-specialist-plan-2026-10-30.md S4, S5):
 * the figures the page shows, each named by a key the specialist writes in
 * double brackets and the Editor fills in, with what it counts in plain
 * words — and the places a step may link to. Nothing is worked out here that
 * the page does not show; money is sent in pounds, a rate in percent.
 */

type Fact = SeesAsk["facts"][number];
type Where = { siteId: Id<"companyWebsites">; path: string; period: string; from: string | null; to: string | null; country: string; device: string; periodName: string; beforeName: string };

const count = (key: string, value: number, label: string): Fact => ({ key, value, unit: "count", label });
const money = (key: string, hundredths: number, label: string, currency: string | null): Fact => ({ key, value: Math.round(hundredths) / 100, unit: "money", label, ...(currency ? { currency } : {}) });
const percent = (key: string, share: number, label: string): Fact => ({ key, value: Math.round(share * 1000) / 10, unit: "percent", label });

const where = (at: Where) => ({ siteId: at.siteId, path: at.path, period: at.period, ...(at.from ? { from: at.from } : {}), ...(at.to ? { to: at.to } : {}), country: at.country, device: at.device });

/** The Conversions page (board "Main"): every conversion counted, the visits, the second box's rate, each kind's worth. */
export function conversionsAsk(at: Where, page: {
  visits: number;
  visitsBefore: number | null;
  total: number;
  totalBefore: number | null;
  kinds: ReadonlyArray<{ eventName: string; count: number; countBefore: number | null; value: number | null; valueBefore: number | null }>;
  rateOf: string | null;
  rate: number | null;
  rateBefore: number | null;
  currency: string | null;
  sells: boolean;
  nameOf: (eventName: string) => string;
  hrefFor: (segment: string, filters?: Record<string, string>) => string;
}): SeesAsk {
  const facts: Fact[] = [
    count("conv.visits.now", page.visits, `visits ${at.periodName}`),
    count("conv.total.now", page.total, `conversions ${at.periodName}`),
  ];
  if (page.visitsBefore !== null) facts.push(count("conv.visits.before", page.visitsBefore, `visits ${at.beforeName}`));
  if (page.totalBefore !== null) facts.push(count("conv.total.before", page.totalBefore, `conversions ${at.beforeName}`));
  for (const kind of page.kinds) {
    const name = page.nameOf(kind.eventName);
    facts.push(count(`conv.${kind.eventName}.now`, kind.count, `${name} ${at.periodName}`));
    if (kind.countBefore !== null) facts.push(count(`conv.${kind.eventName}.before`, kind.countBefore, `${name} ${at.beforeName}`));
    if (kind.value) facts.push(money(`conv.${kind.eventName}.worth.now`, kind.value, `worth of ${name} ${at.periodName}`, page.currency));
    if (kind.valueBefore) facts.push(money(`conv.${kind.eventName}.worth.before`, kind.valueBefore, `worth of ${name} ${at.beforeName}`, page.currency));
  }
  if (page.rateOf && page.rate !== null) facts.push(percent("conv.rate.now", page.rate, `${page.nameOf(page.rateOf)} in every hundred visits ${at.periodName}`));
  if (page.rateOf && page.rateBefore !== null) facts.push(percent("conv.rate.before", page.rateBefore, `${page.nameOf(page.rateOf)} in every hundred visits ${at.beforeName}`));
  const links: SeesAsk["links"] = [
    { label: "Funnel", href: page.hrefFor("funnel") },
    { label: "Tracking health", href: page.hrefFor("tracking-health") },
    { label: "Channels", href: page.hrefFor("channels") },
    ...page.kinds.slice(0, 6).map((kind) => ({ label: page.nameOf(kind.eventName), href: page.hrefFor("events/event", { key: kind.eventName }) })),
  ];
  return {
    ...where(at),
    screen: "googleAnalytics.conversions",
    about: `Conversions: what this website counts as a conversion, ${at.periodName}${page.sells ? ", a shop" : ""}`,
    facts,
    links,
    shop: page.sells,
  };
}

/** A conversion's own screen (board "Conversion"): how many, the visits that did it, its rate, its worth, the website's visits. */
export function conversionAsk(at: Where, page: {
  eventName: string;
  name: string;
  times: number;
  timesBefore: number | null;
  visits: number;
  visitsBefore: number | null;
  siteVisits: number;
  siteVisitsBefore: number | null;
  rate: number | null;
  rateBefore: number | null;
  worth: number | null;
  worthBefore: number | null;
  currency: string | null;
  sells: boolean;
  hrefFor: (segment: string, filters?: Record<string, string>) => string;
}): SeesAsk {
  const facts: Fact[] = [
    count("ev.times.now", page.times, `${page.name} ${at.periodName}`),
    count("ev.visits.now", page.visits, `visits that did ${page.name} ${at.periodName}`),
    count("ev.siteVisits.now", page.siteVisits, `visits to the website ${at.periodName}`),
  ];
  if (page.timesBefore !== null) facts.push(count("ev.times.before", page.timesBefore, `${page.name} ${at.beforeName}`));
  if (page.visitsBefore !== null) facts.push(count("ev.visits.before", page.visitsBefore, `visits that did ${page.name} ${at.beforeName}`));
  if (page.siteVisitsBefore !== null) facts.push(count("ev.siteVisits.before", page.siteVisitsBefore, `visits to the website ${at.beforeName}`));
  if (page.rate !== null) facts.push(percent("ev.rate.now", page.rate, `${page.name} in every hundred visits ${at.periodName}`));
  if (page.rateBefore !== null) facts.push(percent("ev.rate.before", page.rateBefore, `${page.name} in every hundred visits ${at.beforeName}`));
  if (page.worth) facts.push(money("ev.worth.now", page.worth, `worth of ${page.name} ${at.periodName}`, page.currency));
  if (page.worthBefore) facts.push(money("ev.worth.before", page.worthBefore, `worth of ${page.name} ${at.beforeName}`, page.currency));
  return {
    ...where(at),
    screen: `googleAnalytics.event:${page.eventName}`,
    about: `${page.name}: one conversion on its own, ${at.periodName}${page.sells ? ", on a shop" : ""}`,
    facts,
    links: [
      { label: "Conversions", href: page.hrefFor("conversions") },
      { label: "Funnel", href: page.hrefFor("funnel") },
      { label: "Tracking health", href: page.hrefFor("tracking-health") },
    ],
    shop: page.sells,
  };
}
