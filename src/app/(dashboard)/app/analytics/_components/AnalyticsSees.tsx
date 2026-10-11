"use client";

import { useLocale, useTranslations } from "next-intl";
import { HakkenSees, type HakkenSeesStep } from "@/src/ui/components/screens/HakkenSees";
import { seenAdvice, type Seen, type SeenPhrase, type SeenTarget } from "@/convex/utils/hakkenSees";
import { formatNumber } from "../../sites/_components/siteFormat";
import { formatMoney } from "./analyticsFormat";
import { useAnalyticsHref, useAnalyticsSiteId } from "./useAnalytics";
import { useNoteAdvice } from "../../_components/useNoteAdvice";
import { useEventName } from "./useEventName";

/**
 * What Hakken sees on the Google Analytics screens
 * (docs/plans/active/google-analytics-plan.md §14): the same box as
 * Visibility's (`HakkenSees`), written by fixed rules over the figures each
 * screen's query already reads (`convex/utils/sees/analytics.ts`), in the
 * reader's words (`googleAnalytics.seen.<screen>`).
 *
 * A phrase's `a`, `b` and `c` are numbers; each is offered to its words as
 * written (`{a}`), as money in the property's currency (`{aMoney}`, the rules
 * sending money in hundredths, as every Analytics figure is kept), as a share
 * (`{aRate}`, the rules sending a fraction: 0.0014 is "0.14%"), and for
 * plurals (`count`, `countB`, `countC`). A conversion is named by its own
 * name (`{event}`, GA19): the rules send its event in `text`, several joined
 * by commas, named here in the reader's words and listed as their language
 * lists ("“Form sent” and “Live chat started”"). A step's link leads to a
 * page of this website's section, with the dates and device chosen
 * (`segment`, `filters`), or to an address of its own (`url`).
 */
export function AnalyticsSees({ screen, seen, currency }: { screen: string; seen: Seen | null | undefined; currency: string | null | undefined }) {
  const t = useTranslations("googleAnalytics.seen");
  const siteId = useAnalyticsSiteId();
  const hrefOf = useAnalyticsHref(siteId);
  const nameOf = useEventName();
  const locale = useLocale();
  useNoteAdvice(siteId, `googleAnalytics.seen.${screen}`, seen, currency);
  if (!seen || seen.says.length === 0) return null;
  const coded = t as unknown as (key: string, values: Record<string, string | number>) => string;
  const events = (text: string) => eventList(text, nameOf, locale);
  const words = (phrase: SeenPhrase) => coded(`${screen}.${phrase.code}`, valuesOf(phrase, currency, events));
  const target = (to: SeenTarget): { href: string; external?: boolean } => {
    if (to.url) return to.url.startsWith("/") ? { href: to.url } : { href: to.url, external: true };
    return { href: hrefOf(to.segment ?? "", to.filters) };
  };
  const steps: HakkenSeesStep[] = seen.steps.map((step) => ({ words: words(step), link: coded(`links.${step.link}`, {}), ...target(step.to) }));
  return <HakkenSees says={seen.says.map(words)} steps={steps} advice={seenAdvice(seen)} />;
}

/** Conversions' events, sent joined by commas, by their own names in the reader's language, as it lists them. */
export function eventList(text: string, nameOf: (eventName: string) => string, locale: string): string {
  const named = text.split(",").filter(Boolean).map((eventName) => `“${nameOf(eventName)}”`);
  return new Intl.ListFormat(locale === "en" ? "en-GB" : locale, { type: "conjunction" }).format(named);
}

/** A phrase's numbers as its words take them: as written, as money, as a share and for plurals; its conversions by name. */
export function valuesOf(
  phrase: SeenPhrase,
  currency: string | null | undefined,
  events: (text: string) => string = (text) => text,
): Record<string, string | number> {
  const number = (value = 0) => (Number.isInteger(value) || Math.abs(value) >= 10 ? formatNumber(Math.round(value)) : value.toFixed(1));
  return {
    a: number(phrase.a),
    b: number(phrase.b),
    c: number(phrase.c),
    aMoney: formatMoney(phrase.a ?? 0, currency),
    bMoney: formatMoney(phrase.b ?? 0, currency),
    cMoney: formatMoney(phrase.c ?? 0, currency),
    aRate: rateOf(phrase.a),
    bRate: rateOf(phrase.b),
    cRate: rateOf(phrase.c),
    count: phrase.a ?? 0,
    countB: phrase.b ?? 0,
    countC: phrase.c ?? 0,
    text: phrase.text ?? "",
    more: phrase.more ?? "",
    event: events(phrase.text ?? ""),
  };
}

/** A share as a percentage: two decimals under 1%, where one would round a real rate to nothing; one above. */
function rateOf(share = 0): string {
  const percent = share * 100;
  return `${percent.toFixed(percent > 0 && percent < 1 ? 2 : 1)}%`;
}
