"use client";

import { useTranslations } from "next-intl";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { MapCard } from "@/src/ui/components/screens/MapCard";
import { MirrorBars, type MirrorBar, type MirrorZone } from "@/src/ui/components/screens/MirrorBars";
import { formatNumber, toCsv } from "../../sites/_components/siteFormat";
import type { ListSummary } from "./SearchConsoleTables";

/**
 * Search Console's Shown but not clicked, as Anthony chose it on the canvas (20 November 2026: "ok i think we build way 2 and
 * also wire it up to what hakken sees"; docs/plans/active/search-console-shown-but-not-clicked-way-2-plan-2026-11-20.md): the
 * four boxes and the chart of each position on Google. Both read the list's own summary, over every page it lists, never
 * only the rows on screen. The chart is the shared `MirrorBars`, its first screen.
 */

/** The four boxes: how many pages Google showed a lot that people rarely clicked, out of all it showed, and their figures. */
export function LowCtrBoxes({ summary, when }: { summary: ListSummary | null; when: string }) {
  const t = useTranslations("searchConsole.lowCtr.boxes");
  const quiet = (words: string) => <span className="text-secondary">{words}</span>;
  const figure = (value: number | undefined) => (summary && value !== undefined ? formatNumber(value) : "…");
  return (
    <FigureRow>
      <Figure label={t("pages")} value={figure(summary?.rows)} detail={quiet(t("outOf", { count: formatNumber(summary?.of ?? 0) }))} />
      <Figure label={t("shown")} value={figure(summary?.impressions)} detail={quiet(when)} />
      <Figure label={t("clicks")} value={figure(summary?.clicks)} detail={quiet(when)} />
      <Figure label={t("usually")} value={figure(summary?.expected)} detail={quiet(t("more", { count: formatNumber(Math.max(0, (summary?.expected ?? 0) - (summary?.clicks ?? 0))) }))} />
    </FigureRow>
  );
}

/** Google's first three positions, the rest of its first page and its second page, behind the bars. */
const ZONES: MirrorZone[] = [{ upTo: "3", name: "Top 3" }, { upTo: "10", name: "4–10" }, { upTo: "20", name: "11–20" }];

export type LowCtrCount = "clicks" | "pages";

/**
 * Each position on Google, 1 at the top: above the line the clicks these pages got there and below it the clicks they'd usually
 * get, or, with Count on Pages, the pages that got few clicks above every page Google showed there. A position with nothing
 * listed keeps its bar's room, so the positions never shift.
 */
export function LowCtrPositionsCard({ summary, count, onCount, host, exportName, replay, loading }: {
  summary: ListSummary | null;
  count: LowCtrCount;
  onCount: (next: LowCtrCount) => void;
  host: string;
  exportName: string;
  /** What the bars show, so new dates or a new country come in again (`ChartReveal`). */
  replay: string;
  loading: boolean;
}) {
  const t = useTranslations("searchConsole.lowCtr.positions");
  const positions = summary?.lowCtr?.positions ?? [];
  const clicks = count === "clicks";
  const bars: MirrorBar[] = positions.map((one) => ({
    key: String(one.position),
    label: String(one.position),
    heading: t("heading", { position: one.position }),
    top: clicks ? one.clicks : one.pages,
    bottom: clicks ? one.expected : one.all,
    readout: clicks
      ? [
        { value: formatNumber(one.clicks), label: t("clicksGot") },
        { value: formatNumber(one.expected), label: t("clicksUsually") },
        { value: formatNumber(one.pages), label: t("pagesCount", { count: one.pages }) },
      ]
      : [
        { value: formatNumber(one.pages), label: t("fewClicks") },
        { value: formatNumber(one.all), label: t("allThere") },
      ],
  }));
  const anything = positions.some((one) => one.pages > 0);
  return (
    <MapCard
      title={t(clicks ? "titleClicks" : "titlePages")}
      hint={t(clicks ? "hintClicks" : "hintPages")}
      exportName={exportName}
      csv={() => toCsv(
        [t("csv.position"), t("fewClicks"), t("allThere"), t("clicksGot"), t("clicksUsually")],
        positions.map((one) => [one.position, one.pages, one.all, one.clicks, one.expected]),
      )}
      host={host}
      loading={loading}
      message={!loading && !anything ? t("empty") : null}
      controls={[
        { kind: "select", key: "count", label: t("count"), value: count, options: [{ value: "clicks", label: t("countClicks") }, { value: "pages", label: t("countPages") }], onChange: (next) => onCount(next as LowCtrCount) },
      ]}
    >
      <MirrorBars
        bars={bars}
        zones={ZONES}
        replay={replay}
        topLabel={t(clicks ? "clicksGot" : "fewClicks")}
        bottomLabel={t(clicks ? "clicksUsually" : "allThere")}
        format={formatNumber}
      />
    </MapCard>
  );
}
