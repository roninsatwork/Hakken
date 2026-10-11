"use client";

import { useTranslations } from "next-intl";
import { HakkenSees, type HakkenSeesStep } from "@/src/ui/components/screens/HakkenSees";
import { seenAdvice, type Seen, type SeenPhrase, type SeenTarget } from "@/convex/utils/hakkenSees";
import { formatNumber, formatShortDay } from "../../sites/_components/siteFormat";
import { useSearchConsoleHref, useSearchConsoleSiteId } from "./useSearchConsole";
import { useNoteAdvice } from "../../_components/useNoteAdvice";

/**
 * What Hakken sees on Search Console's screens
 * (docs/plans/active/search-console-volatility-plan.md §4): the same box as
 * Discovery's (`HakkenSees`), written by fixed rules over the figures each
 * screen's query already reads (`convex/utils/sees/searchConsole.ts`), in the
 * reader's words (`searchConsole.seen.<screen>`).
 *
 * A phrase's `a`, `b` and `c` are numbers — a score keeps its one decimal —
 * with `count`, `countB` and `countC` for plurals; its `days` are the
 * reader's dates (`{day1}`, `{day2}`); `text` a name it quotes (an update).
 * A step's link leads to a page of this website's section, with the dates
 * and kind of result chosen.
 */
export function SearchConsoleSees({ screen, seen }: { screen: string; seen: Seen | null | undefined }) {
  const t = useTranslations("searchConsole.seen");
  const siteId = useSearchConsoleSiteId();
  const hrefOf = useSearchConsoleHref(siteId);
  useNoteAdvice(siteId, `searchConsole.seen.${screen}`, seen);
  if (!seen || seen.says.length === 0) return null;
  const coded = t as unknown as (key: string, values: Record<string, string | number>) => string;
  const words = (phrase: SeenPhrase) => coded(`${screen}.${phrase.code}`, valuesOf(phrase));
  const target = (to: SeenTarget): { href: string; external?: boolean } =>
    to.url ? (to.url.startsWith("/") ? { href: to.url } : { href: to.url, external: true }) : { href: hrefOf(to.segment ?? "", to.filters) };
  const steps: HakkenSeesStep[] = seen.steps.map((step) => ({ words: words(step), link: coded(`links.${step.link}`, {}), ...target(step.to) }));
  return <HakkenSees says={seen.says.map(words)} steps={steps} advice={seenAdvice(seen)} />;
}

/** A count is whole; any other figure keeps its one decimal — a score of 2.1, a position of 18.2 — as the screen's figures write it. */
const number = (value = 0) => (Number.isInteger(value) ? formatNumber(value) : value.toFixed(1));

function valuesOf(phrase: SeenPhrase): Record<string, string | number> {
  return {
    a: number(phrase.a),
    b: number(phrase.b),
    c: number(phrase.c),
    count: phrase.a ?? 0,
    countB: phrase.b ?? 0,
    countC: phrase.c ?? 0,
    text: phrase.text ?? "",
    more: phrase.more ?? "",
    day1: phrase.days?.[0] ? formatShortDay(phrase.days[0]) : "",
    day2: phrase.days?.[1] ? formatShortDay(phrase.days[1]) : "",
  };
}
