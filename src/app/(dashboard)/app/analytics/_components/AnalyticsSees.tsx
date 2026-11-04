"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { HakkenSees, type HakkenSeesStep, type SeesAsk } from "@/src/ui/components/screens/HakkenSees";
import { seenAdvice, type Seen, type SeenPhrase, type SeenTarget } from "@/convex/utils/hakkenSees";
import { formatNumber } from "../../sites/_components/siteFormat";
import { useAnalyticsHref, useAnalyticsSiteId, useFromHere } from "./useAnalytics";
import { useNoteAdvice } from "../../_components/useNoteAdvice";
import { useEventName } from "./useEventName";
import { withoutMoney } from "./useEyeFigures";

/**
 * What Hakken sees on the Google Analytics screens
 * (docs/plans/active/google-analytics-plan.md §14): the same box as
 * Visibility's (`HakkenSees`), written by fixed rules over the figures each
 * screen's query already reads (`convex/utils/sees/analytics.ts`), in the
 * reader's words (`googleAnalytics.seen.<screen>`).
 *
 * A phrase's `a`, `b` and `c` are numbers; each is offered to its words as
 * written (`{a}`), as a share (`{aRate}`, the rules sending a fraction:
 * 0.0014 is "0.14%"), and for plurals (`count`, `countB`, `countC`) — never
 * as money, which no Google Analytics box speaks of (Anthony, 2026-11-03:
 * "Take money off"). `currency` is only kept with the saved advice. A conversion is named by its own
 * name (`{event}`, GA19): the rules send its event in `text`, several joined
 * by commas, named here in the reader's words and listed as their language
 * lists ("“Form sent” and “Live chat started”"). A step's link leads to a
 * page of this website's section, with the dates and device chosen
 * (`segment`, `filters`), or to an address of its own (`url`).
 */
export function AnalyticsSees({ screen, seen, currency, keep = true, names, ask, data, links }: {
  screen: string;
  /**
   * The page's own figures — the answer of the query that draws it — for the eye's findings, its writer and its chat
   * (sees-every-page-plan-2026-10-31.md). With them the eye shows even when the rule has nothing to say.
   */
  data?: unknown;
  /** Screens the team's "Do first" steps may link to, beside the rule's own (page-screen-redo-plan-2026-11-03.md, step 2). */
  links?: ReadonlyArray<{ label: string; href: string }>;
  /** The page's figures and links for the Insights team, asked when the eye is pressed (sees-conversion-specialist-plan-2026-10-30.md). */
  ask?: SeesAsk;
  /**
   * Words for the codes a rule sends in `text` or `more`, where the reader
   * wants a name: a page group's id read as its classification's name
   * (ga-channel-pages-plan.md CH12). Null leaves a value as sent.
   */
  names?: (value: string) => string | null;
  seen: Seen | null | undefined;
  currency: string | null | undefined;
  /** Saved as the company's advice (`useNoteAdvice`): not for Live, worked out each minute and never kept (GA34). */
  keep?: boolean;
}) {
  const t = useTranslations("googleAnalytics.seen");
  const siteId = useAnalyticsSiteId();
  const hrefOf = useAnalyticsHref(siteId);
  const from = useFromHere();
  const nameOf = useEventName();
  const locale = useLocale();
  const named = <Phrase extends SeenPhrase>(phrase: Phrase): Phrase => (names ? {
    ...phrase,
    ...(phrase.text !== undefined ? { text: names(phrase.text) ?? phrase.text } : {}),
    ...(phrase.more !== undefined ? { more: names(phrase.more) ?? phrase.more } : {}),
  } : phrase);
  // Saved as the reader reads it: a page group by its name, never its id, so Ask Hakken says the same.
  const box = seen && names ? { says: seen.says.map(named), steps: seen.steps.map(named) } : seen;
  useNoteAdvice(keep ? siteId : null, `googleAnalytics.seen.${screen}`, box, currency);
  // Never money, whatever a read still carries for others (Anthony, 2026-11-03: "Take money off").
  const figures = useMemo(() => (data !== undefined && data !== null ? withoutMoney(data) : null), [data]);
  const page = figures !== null ? { screen: `googleAnalytics.${screen}`, siteId, data: figures, ...(links ? { links } : {}) } : undefined;
  if (!page && (!box || box.says.length === 0)) return null;
  const coded = t as unknown as (key: string, values: Record<string, string | number>) => string;
  const events = (text: string) => eventList(text, nameOf, locale);
  const words = (phrase: SeenPhrase) => coded(`${screen}.${phrase.code}`, valuesOf(phrase, events));
  const target = (to: SeenTarget): { href: string; external?: boolean } => {
    if (to.url) return to.url.startsWith("/") ? { href: to.url } : { href: to.url, external: true };
    // A page's own screen knows the screen its link was clicked on, to go back to (landing-pages-flow-plan.md LF9).
    return { href: hrefOf(to.segment ?? "", to.segment === "all-pages/page" ? { ...to.filters, from } : to.filters) };
  };
  const steps: HakkenSeesStep[] = (box?.steps ?? []).map((step) => ({ words: words(step), link: coded(`links.${step.link}`, {}), ...target(step.to) }));
  return <HakkenSees says={(box?.says ?? []).map(words)} steps={steps} advice={box ? seenAdvice(box) : screen} ask={ask} name={nameOf} {...(page ? { page } : {})} />;
}

/** Conversions' events, sent joined by commas, by their own names in the reader's language, as it lists them. */
export function eventList(text: string, nameOf: (eventName: string) => string, locale: string): string {
  const named = text.split(",").filter(Boolean).map((eventName) => `“${nameOf(eventName)}”`);
  return new Intl.ListFormat(locale === "en" ? "en-GB" : locale, { type: "conjunction" }).format(named);
}

/** A phrase's numbers as its words take them: as written, as a share and for plurals, never as money; its conversions by name. */
export function valuesOf(
  phrase: SeenPhrase,
  events: (text: string) => string = (text) => text,
): Record<string, string | number> {
  const number = (value = 0) => (Number.isInteger(value) || Math.abs(value) >= 10 ? formatNumber(Math.round(value)) : value.toFixed(1));
  return {
    a: number(phrase.a),
    b: number(phrase.b),
    c: number(phrase.c),
    aRate: rateOf(phrase.a),
    bRate: rateOf(phrase.b),
    cRate: rateOf(phrase.c),
    count: phrase.a ?? 0,
    countB: phrase.b ?? 0,
    countC: phrase.c ?? 0,
    text: phrase.text ?? "",
    more: phrase.more ?? "",
    period: phrase.period ?? "other",
    event: events(phrase.text ?? ""),
    // A second event, in `more`: what a conversion really is (ga-channel-pages-plan.md R3).
    moreEvent: events(phrase.more ?? ""),
  };
}

/** A share as a percentage: two decimals under 1%, where one would round a real rate to nothing; one above. */
function rateOf(share = 0): string {
  const percent = share * 100;
  return `${percent.toFixed(percent > 0 && percent < 1 ? 2 : 1)}%`;
}
