import type { Id } from "@/convex/_generated/dataModel";
import type { SeesAsk } from "@/src/ui/components/screens/HakkenSees";

/**
 * What the Conversions screens hand the Insights team when the eye is pressed
 * (docs/plans/active/sees-conversion-specialist-plan-2026-10-30.md S4, S5):
 * the figures the page shows, each named by a key the specialist writes in
 * double brackets and the Editor fills in, with what it counts in plain
 * words — and the places a step may link to. Nothing is worked out here that
 * the page does not show; money is sent in pounds, a rate in percent. Every
 * word comes from the catalogue (`googleAnalytics.seesAsk`, the menu's page
 * names), handed in by the screen.
 */

type Fact = SeesAsk["facts"][number];
type Where = { siteId: Id<"companyWebsites">; path: string; period: string; from: string | null; to: string | null; country: string; device: string; periodName: string; beforeName: string };
/** The screen's translator for `googleAnalytics.seesAsk`. */
type Words = (key: string, values?: Record<string, string | number>) => string;
/** The menu's page names, for the links a step may use. */
type Links = { funnel: string; trackingHealth: string; channels: string; conversions: string };

const count = (key: string, value: number, label: string): Fact => ({ key, value, unit: "count", label });
const money = (key: string, hundredths: number, label: string, currency: string | null): Fact => ({ key, value: Math.round(hundredths) / 100, unit: "money", label, ...(currency ? { currency } : {}) });
const percent = (key: string, share: number, label: string): Fact => ({ key, value: Math.round(share * 1000) / 10, unit: "percent", label });

const where = (at: Where) => ({ siteId: at.siteId, path: at.path, period: at.period, ...(at.from ? { from: at.from } : {}), ...(at.to ? { to: at.to } : {}), country: at.country, device: at.device });

/** The Conversions page (board "Main"): every conversion counted, the visits, the second box's rate, each kind's worth. */
export function conversionsAsk(at: Where, words: Words, menu: Links, page: {
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
  const now = { period: at.periodName };
  const before = { period: at.beforeName };
  const facts: Fact[] = [
    count("conv.visits.now", page.visits, words("visits", now)),
    count("conv.total.now", page.total, words("conversions", now)),
  ];
  if (page.visitsBefore !== null) facts.push(count("conv.visits.before", page.visitsBefore, words("visits", before)));
  if (page.totalBefore !== null) facts.push(count("conv.total.before", page.totalBefore, words("conversions", before)));
  for (const kind of page.kinds) {
    const name = page.nameOf(kind.eventName);
    facts.push(count(`conv.${kind.eventName}.now`, kind.count, words("kind", { name, ...now })));
    if (kind.countBefore !== null) facts.push(count(`conv.${kind.eventName}.before`, kind.countBefore, words("kind", { name, ...before })));
    if (kind.value) facts.push(money(`conv.${kind.eventName}.worth.now`, kind.value, words("worth", { name, ...now }), page.currency));
    if (kind.valueBefore) facts.push(money(`conv.${kind.eventName}.worth.before`, kind.valueBefore, words("worth", { name, ...before }), page.currency));
  }
  if (page.rateOf && page.rate !== null) facts.push(percent("conv.rate.now", page.rate, words("rate", { name: page.nameOf(page.rateOf), ...now })));
  if (page.rateOf && page.rateBefore !== null) facts.push(percent("conv.rate.before", page.rateBefore, words("rate", { name: page.nameOf(page.rateOf), ...before })));
  const links: SeesAsk["links"] = [
    { label: menu.funnel, href: page.hrefFor("funnel") },
    { label: menu.trackingHealth, href: page.hrefFor("tracking-health") },
    { label: menu.channels, href: page.hrefFor("channels") },
    ...page.kinds.slice(0, 6).map((kind) => ({ label: page.nameOf(kind.eventName), href: page.hrefFor("events/event", { key: kind.eventName }) })),
  ];
  return {
    ...where(at),
    screen: "googleAnalytics.conversions",
    about: words(page.sells ? "aboutConversionsShop" : "aboutConversions", now),
    facts,
    links,
    shop: page.sells,
  };
}

/** A conversion's own screen (board "Conversion"): how many, the visits that did it, its rate, its worth, the website's visits. */
export function conversionAsk(at: Where, words: Words, menu: Links, page: {
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
  const now = { name: page.name, period: at.periodName };
  const before = { name: page.name, period: at.beforeName };
  const facts: Fact[] = [
    count("ev.times.now", page.times, words("kind", now)),
    count("ev.visits.now", page.visits, words("didIt", now)),
    count("ev.siteVisits.now", page.siteVisits, words("siteVisits", now)),
  ];
  if (page.timesBefore !== null) facts.push(count("ev.times.before", page.timesBefore, words("kind", before)));
  if (page.visitsBefore !== null) facts.push(count("ev.visits.before", page.visitsBefore, words("didIt", before)));
  if (page.siteVisitsBefore !== null) facts.push(count("ev.siteVisits.before", page.siteVisitsBefore, words("siteVisits", before)));
  if (page.rate !== null) facts.push(percent("ev.rate.now", page.rate, words("rate", now)));
  if (page.rateBefore !== null) facts.push(percent("ev.rate.before", page.rateBefore, words("rate", before)));
  if (page.worth) facts.push(money("ev.worth.now", page.worth, words("worth", now), page.currency));
  if (page.worthBefore) facts.push(money("ev.worth.before", page.worthBefore, words("worth", before), page.currency));
  return {
    ...where(at),
    screen: `googleAnalytics.event:${page.eventName}`,
    about: words(page.sells ? "aboutConversionShop" : "aboutConversion", now),
    facts,
    links: [
      { label: menu.conversions, href: page.hrefFor("conversions") },
      { label: menu.funnel, href: page.hrefFor("funnel") },
      { label: menu.trackingHealth, href: page.hrefFor("tracking-health") },
    ],
    shop: page.sells,
  };
}
