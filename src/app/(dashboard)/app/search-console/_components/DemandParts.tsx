"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { outOfTotal } from "@/convex/utils/outOfTotal";
import { ChangeLine } from "@/src/ui/components/screens/Change";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { HundredGrid, type HundredGroup } from "@/src/ui/components/screens/HundredGrid";
import { HundredStrips, stripColour, type StripSegment } from "@/src/ui/components/screens/HundredStrips";
import { MapCard } from "@/src/ui/components/screens/MapCard";
import { CHART_COMPARATOR_GREY } from "@/src/ui/components/charts/chartPalette";
import { formatNumber, toCsv } from "../../sites/_components/siteFormat";
import { useSiteParam } from "../../sites/_components/useSiteParam";
import type { LiveProblemKind } from "./SearchConsoleNotices";
import type { SiteFigures } from "./SearchConsoleFigures";
import { GRID_COLOURS, oneDecimal, per100, topAndRest, usePerformanceDates, type Part } from "./PerformanceParts";
import { percentOf } from "./PlacesParts";
import type { DemandPart } from "./demandSees";
import { formatPosition, formatRate } from "./searchConsoleFormat";
import { useLiveAsk } from "./searchConsoleRecords";
import { countryArg, periodArg, useSearchConsoleCountry, useSearchConsoleRange, useSearchConsoleSiteId, useSearchConsoleStatus } from "./useSearchConsole";

/**
 * Demand by Classification, as Anthony chose it on 18 November 2026 (the canvas's Way 2: "I want way 2 for demand by
 * classification"; search-console-demand-by-classification-way-2-plan-2026-11-18.md). Performance's four boxes for the
 * country chosen; what Google shows against what gets clicked (`HundredStrips`); out of every 100 clicks (`HundredGrid`),
 * each in a `MapCard`, as Performance draws them. Every part is a Classification of the country's own pages: they share
 * out only the clicks Google ties to a page, as Keywords' table does the searches it names (`demandParts`).
 */

const capital = (words: string) => words.charAt(0).toUpperCase() + words.slice(1);

/** The country's pages by Classification: kept for the main country's ready-made periods, else asked of Google. */
export type DemandRead = {
  answer: { from: string; to: string; comparable: boolean; rows: Array<{ kind: string; clicks: number; impressions: number; clicksBefore: number | null; impressionsBefore: number | null; pages: number }> } | undefined;
  problem: LiveProblemKind | null;
  /** Asked of Google, the country's pages stopped at Google's most an ask (`GOOGLE_MOST_ROWS`): the table says so. */
  cut: number | null;
  retry: () => void;
};

/** The country chosen's pages for the dates, by Classification, with the dates before: undefined while on their way. */
export function useDemand(held: boolean): DemandRead {
  const siteId = useSearchConsoleSiteId();
  const status = useSearchConsoleStatus();
  const [country] = useSearchConsoleCountry();
  const range = useSearchConsoleRange(status?.connection?.newestDay);
  const ask = held && !range.waiting && range.days > 0 ? { siteId, from: range.from, to: range.to, ...periodArg(range), ...countryArg(country) } : null;
  const kept = useQuery(api.searchConsoleDemand.searchConsoleDemand, ask ?? "skip");
  const live = useLiveAsk(api.searchConsoleDemand.searchConsoleLiveDemand, ask && kept?.live ? ask : null);
  if (!kept) return { answer: undefined, problem: null, cut: null, retry: live.retry };
  if (!kept.live) return { answer: kept, problem: null, cut: null, retry: live.retry };
  if (live.answer === undefined) return { answer: undefined, problem: null, cut: null, retry: live.retry };
  if (!live.answer.ok) return { answer: undefined, problem: live.answer.problem, cut: null, retry: live.retry };
  return { answer: live.answer, problem: null, cut: live.answer.cut ?? null, retry: live.retry };
}

// ── The four boxes ────────────────────────────────────────────────────────────────────────────────────────────────

/** A move as the redone boxes say it: 5% fewer than September, 0.1 points lower, 0.5 places worse, or no change. */
function Against({ by, write, still = 0 }: { by: number; write: (size: number, up: boolean) => string; still?: number }) {
  const t = useTranslations("searchConsole.services.boxes");
  const { inBefore } = usePerformanceDates();
  if (Math.abs(by) <= still) return <ChangeLine by={0}>{t("same", { before: inBefore })}</ChangeLine>;
  return <ChangeLine by={by}>{write(Math.abs(by), by > 0)}</ChangeLine>;
}

/**
 * Performance's four boxes for the country chosen — clicks, impressions, click-through rate and Google's average place —
 * each against the dates before, by their name ("5% fewer than September"). Without them, why: Google keeps 16 months.
 * Tracked keywords and Tracked pages hand it their tracked rows' figures together (search-console-tracked-way-1-plan-2026-11-18.md).
 */
export function DemandBoxes({ figures }: { figures: Pick<SiteFigures, "totals" | "previous"> | undefined }) {
  const t = useTranslations("searchConsole.services.boxes");
  const tf = useTranslations("searchConsole.figures");
  const status = useSearchConsoleStatus();
  const { range, inBefore } = usePerformanceDates();
  if (!figures) return <div className="h-[104px] animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />;
  const { totals, previous } = figures;
  const tooOld = Boolean(status && range.before.from < status.historyFrom);
  const none = <ChangeLine by={null}>{tooOld ? t("tooOld") : t("nothingBefore", { before: inBefore })}</ChangeLine>;
  const counted = (now: number, before: number) => (
    <Against by={now - before} write={(size, up) => t(up ? "more" : "fewer", { change: before > 0 ? percentOf(size / before) : formatNumber(size), before: inBefore })} />
  );
  const ctr = (value: { ctr: number }) => value.ctr * 100;
  return (
    <FigureRow>
      <Figure label={tf("clicks")} value={formatNumber(totals?.clicks ?? 0)} detail={totals && previous ? counted(totals.clicks, previous.clicks) : none} />
      <Figure label={tf("impressions")} value={formatNumber(totals?.impressions ?? 0)} detail={totals && previous ? counted(totals.impressions, previous.impressions) : none} />
      <Figure
        label={tf("ctr")}
        value={formatRate(totals?.ctr ?? null)}
        detail={totals && previous ? <Against by={ctr(totals) - ctr(previous)} still={0.05} write={(size, up) => t(up ? "higher" : "lower", { change: formatPosition(size), before: inBefore })} /> : none}
      />
      <Figure
        label={tf("position")}
        value={formatPosition(totals?.position ?? null)}
        // Lower is better: the move is how many places it rose.
        detail={totals && previous ? <Against by={previous.position - totals.position} still={0.05} write={(size, up) => t(up ? "better" : "worse", { change: formatPosition(size), before: inBefore })} /> : none}
      />
    </FigureRow>
  );
}

// ── What Google shows, and what gets clicked ──────────────────────────────────────────────────────────────────────

/** Two rows of 100: where impressions went, and where clicks went (or the pages are), a band for each Classification. */
export function DemandBandsCard({ parts, host }: { parts: readonly DemandPart[] | undefined; host: string }) {
  const t = useTranslations("searchConsole.performance.bands");
  const ts = useTranslations("searchConsole.performance.squares");
  const [bottomKey, setBottom] = useSiteParam<"clicks" | "pages">("bands", "clicks", ["clicks", "pages"]);
  const [lit, setLit] = useState<string | null>(null);
  const shown = parts ? topAndRest(parts, (part) => part.impressions, 6, (count) => ts("others", { count })) : [];
  const bottomOf = (part: Part) => (bottomKey === "clicks" ? part.clicks : part.pages ?? 0);
  const impressions = shown.map((part) => part.impressions);
  const bottoms = shown.map(bottomOf);
  const [impressionsAll, bottomAll] = [impressions, bottoms].map((list) => list.reduce((sum, value) => sum + value, 0));
  const top = outOfTotal(impressions);
  const bottom = outOfTotal(bottoms);
  const noun = t(`noun.${bottomKey}`);
  const segments: StripSegment[] = shown.map((part, at) => ({
    key: part.key,
    name: part.name,
    top: top[at] ?? 0,
    bottom: bottom[at] ?? 0,
    colour: stripColour(part.key === "rest" ? 99 : at),
    readout: [
      { value: formatNumber(impressions[at] ?? 0), label: t("readout.impressions") },
      { value: ts("readout.inEvery", { share: oneDecimal(per100(impressions[at] ?? 0, impressionsAll)) }), label: t("readout.ofImpressions") },
      { value: formatNumber(bottoms[at] ?? 0), label: t(`against.${bottomKey}`) },
      { value: ts("readout.inEvery", { share: oneDecimal(per100(bottoms[at] ?? 0, bottomAll)) }), label: t("readout.ofThose", { noun }) },
    ],
  }));
  return (
    <MapCard
      title={t(`title.${bottomKey}`)}
      hint={[t("hint", { noun }), t("press")].join(" ")}
      exportName={`${host}-search-console-classifications-bands`}
      csv={() => toCsv([t("csvName"), t("readout.impressions"), t(`against.${bottomKey}`)], shown.map((part, at) => [part.name, impressions[at] ?? 0, bottoms[at] ?? 0]))}
      host={host}
      loading={parts === undefined}
      message={parts !== undefined && impressionsAll === 0 ? ts("empty") : null}
      controls={[{
        kind: "select", key: "against", label: ts("showLabel"), value: bottomKey,
        options: (["clicks", "pages"] as const).map((value) => ({ value, label: t(`against.${value}`) })),
        onChange: (next) => setBottom(next as "clicks" | "pages"),
      }]}
    >
      <HundredStrips segments={segments} topLabel={t("topLabel")} bottomLabel={t("bottomLabel", { noun })} lit={lit} onLit={setLit} />
    </MapCard>
  );
}

// ── Out of every 100 clicks ───────────────────────────────────────────────────────────────────────────────────────

/** Out of every 100 clicks or impressions, the four biggest Classifications and the rest, with the dates before beside them. */
export function DemandSquaresCard({ parts, host }: { parts: readonly DemandPart[] | undefined; host: string }) {
  const t = useTranslations("searchConsole.performance.squares");
  const td = useTranslations("searchConsole.services");
  const dates = usePerformanceDates();
  const [show, setShow] = useSiteParam<"clicks" | "impressions">("squares", "clicks", ["clicks", "impressions"]);
  const [compare, setCompare] = useSiteParam<"before" | "none">("squaresAgainst", "before", ["before", "none"]);
  const read = (part: Part) => (show === "clicks" ? part.clicks : part.impressions);
  const readBefore = (part: Part) => (show === "clicks" ? part.clicksBefore : part.impressionsBefore);
  const shown = parts ? topAndRest(parts, read, 4, (count) => t("others", { count })) : [];
  const values = shown.map(read);
  const total = values.reduce((sum, value) => sum + value, 0);
  const counts = outOfTotal(values);
  const hasBefore = shown.length > 0 && shown.every((part) => readBefore(part) !== null);
  const compared = compare === "before" && hasBefore;
  const valuesBefore = shown.map((part) => readBefore(part) ?? 0);
  const totalBefore = valuesBefore.reduce((sum, value) => sum + value, 0);
  const countsBefore = compared ? outOfTotal(valuesBefore) : [];
  const noun = t(`noun.${show}`);
  const groups: HundredGroup[] = shown.map((part, at) => ({
    key: part.key,
    name: part.name,
    count: counts[at] ?? 0,
    colour: GRID_COLOURS[at] ?? CHART_COMPARATOR_GREY,
    ...(compared ? { was: <span className="font-mono">{countsBefore[at] ?? 0}</span> } : {}),
    readout: [
      { value: formatNumber(values[at] ?? 0), label: t("readout.figure", { noun: capital(noun), when: dates.inNow }) },
      { value: t("readout.inEvery", { share: oneDecimal(per100(values[at] ?? 0, total)) }), label: dates.now },
      ...(compared ? [{ value: t("readout.inEvery", { share: oneDecimal(per100(valuesBefore[at] ?? 0, totalBefore)) }), label: dates.before }] : []),
    ],
  }));
  return (
    <MapCard
      title={t("title", { noun })}
      // The pages' clicks, fewer than the boxes' (Google ties no page to the searches it keeps private): never "All your clicks".
      hint={td("squaresHint", { noun, when: dates.inNow, count: formatNumber(total) })}
      exportName={`${host}-search-console-classifications-out-of-100`}
      csv={() => toCsv([t("csvRow"), capital(noun), t("csvSquares"), ...(compared ? [dates.before] : [])], groups.map((group, at) => [group.name, values[at] ?? 0, group.count, ...(compared ? [countsBefore[at] ?? 0] : [])]))}
      host={host}
      loading={parts === undefined}
      message={parts !== undefined && total === 0 ? t("empty") : null}
      controls={[
        { kind: "select", key: "show", label: t("showLabel"), value: show, options: (["clicks", "impressions"] as const).map((value) => ({ value, label: capital(t(`noun.${value}`)) })), onChange: (next) => setShow(next as "clicks" | "impressions") },
        { kind: "select", key: "compare", label: t("compareWith"), value: hasBefore ? compare : "none", options: [...(hasBefore ? [{ value: "before", label: dates.before }] : []), { value: "none", label: t("nothing") }], onChange: (next) => setCompare(next as "before" | "none") },
      ]}
    >
      <HundredGrid groups={groups} cells={100} nowLabel={dates.now} wasLabel={compared ? dates.before : ""} label={t("title", { noun })} />
    </MapCard>
  );
}
