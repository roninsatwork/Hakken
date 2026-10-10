"use client";

import { useTranslations } from "next-intl";
import { HakkenSees, type HakkenSeesStep } from "@/src/ui/components/screens/HakkenSees";
import type { Seen, SeenPhrase, SeenTarget } from "@/convex/utils/hakkenSees";
import { formatNumber } from "../../sites/_components/siteFormat";
import { formatMoney } from "./analyticsFormat";
import { useAnalyticsHref, useAnalyticsSiteId } from "./useAnalytics";

/**
 * What Hakken sees on the Google Analytics screens
 * (docs/plans/active/google-analytics-plan.md §14): the same box as
 * Discovery's (`HakkenSees`), written by fixed rules over the figures each
 * screen's query already reads (`convex/utils/sees/analytics.ts`), in the
 * reader's words (`googleAnalytics.seen.<screen>`).
 *
 * A phrase's `a`, `b` and `c` are numbers; each is offered to its words as
 * written (`{a}`), as money in the property's currency (`{aMoney}`, the rules
 * sending money in hundredths, as every Analytics figure is kept), and for
 * plurals (`count`, `countB`, `countC`). A step's link leads to a page of this
 * website's section, with the dates and device chosen (`segment`, `filters`),
 * or to an address of its own (`url`).
 */
export function AnalyticsSees({ screen, seen, currency }: { screen: string; seen: Seen | null | undefined; currency: string | null | undefined }) {
  const t = useTranslations("googleAnalytics.seen");
  const siteId = useAnalyticsSiteId();
  const hrefOf = useAnalyticsHref(siteId);
  if (!seen || seen.says.length === 0) return null;
  const coded = t as unknown as (key: string, values: Record<string, string | number>) => string;
  const words = (phrase: SeenPhrase) => coded(`${screen}.${phrase.code}`, valuesOf(phrase, currency));
  const target = (to: SeenTarget): { href: string; external?: boolean } => {
    if (to.url) return to.url.startsWith("/") ? { href: to.url } : { href: to.url, external: true };
    return { href: hrefOf(to.segment ?? "", to.filters) };
  };
  const steps: HakkenSeesStep[] = seen.steps.map((step) => ({ words: words(step), link: coded(`links.${step.link}`, {}), ...target(step.to) }));
  return <HakkenSees says={seen.says.map(words)} steps={steps} />;
}

/** A phrase's numbers as its words take them: as written, as money, and for plurals. */
export function valuesOf(phrase: SeenPhrase, currency: string | null | undefined): Record<string, string | number> {
  const number = (value = 0) => (Number.isInteger(value) || Math.abs(value) >= 10 ? formatNumber(Math.round(value)) : value.toFixed(1));
  return {
    a: number(phrase.a),
    b: number(phrase.b),
    c: number(phrase.c),
    aMoney: formatMoney(phrase.a ?? 0, currency),
    bMoney: formatMoney(phrase.b ?? 0, currency),
    cMoney: formatMoney(phrase.c ?? 0, currency),
    count: phrase.a ?? 0,
    countB: phrase.b ?? 0,
    countC: phrase.c ?? 0,
    text: phrase.text ?? "",
    more: phrase.more ?? "",
  };
}
