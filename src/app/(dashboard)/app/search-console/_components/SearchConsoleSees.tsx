"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { HakkenSees, type HakkenSeesStep } from "@/src/ui/components/screens/HakkenSees";
import { seenAdvice, type Seen, type SeenPhrase, type SeenTarget } from "@/convex/utils/hakkenSees";
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
  const capital = (words: string) => words.charAt(0).toUpperCase() + words.slice(1);
  const words = useMemo(() => ({
    before: capital(periodWords.before),
    website: tw("website"),
    clicks: tw("clicks"),
    shown: tw("shown"),
    weekends: tw("weekends"),
    weekdays: tw("weekdays"),
    recent: tw("recent"),
    earlier: tw("earlier"),
    before7: tw("week7Before"),
    // The newest days, weeks or months of a chart against those before them, by the chart's step.
    "recent.7": tw("recentSteps.day"),
    "recent.4": tw("recentSteps.week"),
    "recent.3": tw("recentSteps.month"),
    "earlier.7": tw("earlierSteps.day"),
    "earlier.4": tw("earlierSteps.week"),
    "earlier.3": tw("earlierSteps.month"),
    "average.7": tw("averageSteps.day"),
    "average.4": tw("averageSteps.week"),
    "average.3": tw("averageSteps.month"),
  }), [periodWords.before, tw]);
  // The same figures keep the same object, so the eye works them out again only when they change.
  const worded = useMemo(() => (data && typeof data === "object" && !Array.isArray(data) ? { ...(data as Record<string, unknown>), words } : data), [data, words]);
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
