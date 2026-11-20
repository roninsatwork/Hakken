"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { KeywordPagesAnswer } from "@/convex/searchConsoleCannibalisation";
import type { Summary } from "@/convex/utils/searchConsoleViews";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { DaysChart, type DaysLine } from "@/src/ui/components/screens/DaysChart";
import { PLOTTED_COLOURS } from "../../analytics/_components/AllPagesParts";
import { formatNumber } from "../../sites/_components/siteFormat";
import { shiftDay } from "../../sites/_components/siteRange";
import { shortPageName, useLiveAsks } from "./searchConsoleRecords";
import { countryArg, useResultKind, useSearchConsoleCountry, useSearchConsoleRange, useSearchConsoleSiteId, useSearchConsoleStatus } from "./useSearchConsole";

/**
 * Keyword cannibalisation's parts (Pages competing until 20 November 2026; Way 3 on the canvas, built on Anthony's "lets
 * build it as i dont understand and need to see it working"): the four boxes over the list on Insights' rule
 * (`cannibalisationRule.ts`), and the chart of the ticked keyword's pages each day, with a menu of the pages it competed
 * with. Each is given what to show; the page does the reading.
 */

const quiet = (words: string) => <span className="text-secondary">{words}</span>;

/** The four boxes: the keywords two pages share, the pages competing, and the times Google showed them and their clicks. */
export function CannibalisationBoxes({ summary }: { summary: Summary | null }) {
  const t = useTranslations("searchConsole.competing.boxes");
  const figure = (value: number | null | undefined) => (summary && value !== null && value !== undefined ? formatNumber(value) : "…");
  return (
    <FigureRow>
      <Figure label={t("keywords")} value={figure(summary?.rows)} detail={quiet(t("rule"))} />
      <Figure label={t("pages")} value={figure(summary?.pagesInvolved)} detail={quiet(t("ofShown", { count: formatNumber(summary?.pagesShown ?? 0) }))} />
      <Figure label={t("shown")} value={figure(summary?.impressions)} detail={quiet(t("leftOut"))} />
      <Figure label={t("clicks")} value={figure(summary?.clicks)} />
    </FigureRow>
  );
}

/** The ticked keyword's pages each day, asked of Google once while the page is open, in the country and dates chosen. */
export function useKeywordPages(keyword: string | null): { answer: KeywordPagesAnswer | undefined; retry: () => void } {
  const siteId = useSearchConsoleSiteId();
  const status = useSearchConsoleStatus();
  const [kind] = useResultKind();
  const [country] = useSearchConsoleCountry();
  const range = useSearchConsoleRange(status?.connection?.newestDay);
  const held = Boolean(status?.connection?.newestDay) && !range.waiting && range.days > 0;
  const asks = held && keyword ? [{ siteId, searchType: kind, key: keyword, from: range.from, to: range.to, ...countryArg(country) }] : [];
  const { answers, retry } = useLiveAsks(api.searchConsoleCannibalisation.searchConsoleKeywordPagesByDay, asks);
  return { answer: keyword ? answers[0] : undefined, retry };
}

type Show = "impressions" | "position";

/**
 * Which of the website's pages Google showed for the ticked keyword each day: a line a page, its impressions or its
 * position. Its Pages menu lists every page Google showed for it, the home page left out, and opens on those that count
 * by the rule. Give it a `key` of the keyword, so the menu opens afresh for each one.
 */
export function CannibalisationDaysCard({ keyword, answer, host, when, exportName }: {
  keyword: string | null;
  answer: KeywordPagesAnswer | undefined;
  host: string;
  /** The dates, as the page says them: "October", "Last 3 months". */
  when: string;
  exportName: string;
}) {
  const t = useTranslations("searchConsole.competing.chart");
  const tc = useTranslations("searchConsole");
  const status = useSearchConsoleStatus();
  const range = useSearchConsoleRange(status?.connection?.newestDay);
  const [show, setShow] = useState<Show>("impressions");
  const pages = useMemo(() => (answer?.ok ? answer.pages : []), [answer]);
  const [ticked, setTicked] = useState<string[] | null>(null);
  const chosen = ticked ?? pages.filter((page) => page.counted).map((page) => page.page);
  const homePage = tc("pages.chart.homePage");
  const nameOf = useMemo(() => {
    const titles = new Map(pages.map((page) => [page.page, page.title]));
    return (page: string) => shortPageName(titles.get(page), page, host, homePage);
  }, [pages, host, homePage]);
  const lines: DaysLine[] = pages.flatMap((page, at) => {
    if (!chosen.includes(page.page)) return [];
    const byDay = new Map(page.days.map((day) => [day.day, day]));
    const days: Array<{ day: string; impressions: number; position: number }> = [];
    for (let day = range.from; day <= range.to && days.length < 400; day = shiftDay(day, 1)) {
      const held = byDay.get(day);
      days.push({ day, impressions: held?.impressions ?? 0, position: held?.position ?? 0 });
    }
    const impressions = days.map((day) => ({ day: day.day, value: day.impressions }));
    return [{
      key: page.page,
      name: nameOf(page.page),
      colour: PLOTTED_COLOURS[at % PLOTTED_COLOURS.length],
      ...(show === "impressions" ? { points: impressions } : { points: days.map((day) => ({ day: day.day, value: day.position * day.impressions })), per: impressions, perScale: 1 }),
    }];
  });
  const waiting = keyword === null ? t("noneTicked") : answer === undefined ? undefined : !answer.ok ? t("failed") : null;
  const hint = [t("hint"), ...(answer?.ok ? [t("swaps", { count: answer.swaps, when })] : []), ...(show === "position" ? [t("positionHint")] : [])].join(" ");
  return (
    <DaysChart
      title={keyword ? t("title", { keyword }) : t("titleNone")}
      hint={hint}
      exportName={exportName}
      csvDay={t("day")}
      host={host}
      step={range.step}
      waiting={waiting}
      controls={[
        { kind: "ticks", key: "pages", label: t("pages"), everyWord: t("everyPage"), choices: pages.map((page) => ({ key: page.page, label: nameOf(page.page) })), ticked: chosen, onChange: setTicked },
        { kind: "select", key: "show", label: t("show"), value: show, options: [{ value: "impressions", label: t("impressions") }, { value: "position", label: t("position") }], onChange: (next) => setShow(next as Show) },
      ]}
      nothingTicked={pages.length > 0 && chosen.length === 0 ? t("nothingTicked") : null}
      lines={lines}
      figure={show === "impressions" ? t("impressions") : t("position")}
      plain={show === "impressions"}
      format={show === "impressions" ? formatNumber : (value) => value.toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
      anything={() => pages.length > 0}
      empty={t("empty")}
      height={300}
    />
  );
}
