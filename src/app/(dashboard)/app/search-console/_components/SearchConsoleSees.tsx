"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { HakkenSees, type HakkenSeesStep } from "@/src/ui/components/screens/HakkenSees";
import { seenAdvice, type Seen, type SeenPhrase, type SeenTarget } from "@/convex/utils/hakkenSees";
import { searchConsoleSeesWords, spanNameOf, withSeesWords, wordsReader } from "@/convex/utils/sees/eyeData/searchConsoleWords";
import { formatNumber, formatShortDay } from "../../sites/_components/siteFormat";
import { useSearchConsoleHref, useSearchConsolePeriodWords, useSearchConsoleRange, useSearchConsoleSiteId, useSearchConsoleStatus } from "./useSearchConsole";
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
 *
 * The page's figures go to the eye with the names its own rules say them by, in the reader's words (`words`: "The
 * month before", "Times shown", "Brand"; ask-hakken-every-chart-page-plan-2026-11-03.md, section 6): a rule never
 * writes a name in English for an Italian reader. `eye` is the eye's key where it is not the box's words' (a search's
 * and a page's own screens share their words, `record`, and each has its own eye, `keyword` and `page`).
 */
export function SearchConsoleSees({ screen, eye, seen, data, links }: {
  screen: string;
  /** The eye's key, `searchConsole.<eye>`: the box's own screen unless named. */
  eye?: string;
  seen: Seen | null | undefined;
  /** The page's own figures, for the eye's findings, writer and chat (sees-every-page-plan-2026-10-31.md). */
  data?: unknown;
  /** Better places for "Do first" than the section's menu: a record's own screen. */
  links?: ReadonlyArray<{ label: string; href: string }>;
}) {
  const t = useTranslations("searchConsole.seen");
  const tw = useTranslations("searchConsole.sees");
  const siteId = useSearchConsoleSiteId();
  const hrefOf = useSearchConsoleHref(siteId);
  const status = useSearchConsoleStatus();
  const range = useSearchConsoleRange(status?.connection?.newestDay);
  const periodWords = useSearchConsolePeriodWords(range.period);
  useNoteAdvice(siteId, `searchConsole.seen.${screen}`, seen);
  // The dates and the span before by their names where they have one ("October", "September"), as the redone boxes say
  // them (writing-guide.md, "Name the dates"). With only "The month before" and "The 28 days before" to go on, the eye's
  // first press on Demand by Classification sent the reader to "the 28 days before" for Last month (18 November 2026).
  const locale = useLocale();
  const nowName = spanNameOf({ from: range.from, to: range.to }, locale);
  const beforeName = spanNameOf(range.before, locale);
  // Built by the same function a chat app's question builds them with (chatAppEyes/searchConsole.ts), so the two can't disagree.
  const words = useMemo(
    () => searchConsoleSeesWords({ sees: wordsReader(tw), before: periodWords.before, nowName, beforeName }),
    [beforeName, nowName, periodWords.before, tw],
  );
  // The same figures keep the same object, so the eye works them out again only when they change.
  const worded = useMemo(() => withSeesWords(data, words), [data, words]);
  const page = worded !== undefined && worded !== null
    ? {
      screen: `searchConsole.${eye ?? screen}`,
      ...(siteId ? { siteId } : {}),
      data: worded,
      ...(links && links.length > 0 ? { links } : {}),
    }
    : undefined;
  if (!page && (!seen || seen.says.length === 0)) return null;
  const coded = t as unknown as (key: string, values: Record<string, string | number>) => string;
  const sentence = (phrase: SeenPhrase) => coded(`${screen}.${phrase.code}`, valuesOf(phrase));
  const target = (to: SeenTarget): { href: string; external?: boolean } =>
    to.url ? (to.url.startsWith("/") ? { href: to.url } : { href: to.url, external: true }) : { href: hrefOf(to.segment ?? "", to.filters) };
  const steps: HakkenSeesStep[] = (seen?.steps ?? []).map((step) => ({ words: sentence(step), link: coded(`links.${step.link}`, {}), ...target(step.to) }));
  return <HakkenSees says={(seen?.says ?? []).map(sentence)} steps={steps} advice={seen ? seenAdvice(seen) : screen} {...(page ? { page } : {})} />;
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
    period: phrase.period ?? "other",
    day1: phrase.days?.[0] ? formatShortDay(phrase.days[0]) : "",
    day2: phrase.days?.[1] ? formatShortDay(phrase.days[1]) : "",
  };
}
