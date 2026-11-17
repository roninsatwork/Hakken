"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { outOfTotal } from "@/convex/utils/outOfTotal";
import { HundredStrips, stripColour, type StripSegment } from "@/src/ui/components/screens/HundredStrips";
import { MapCard } from "@/src/ui/components/screens/MapCard";
import { formatNumber, toCsv } from "../../sites/_components/siteFormat";
import { oneDecimal, per100 } from "./PerformanceParts";
import type { KeywordBands } from "./keywordSees";

/**
 * Overview's and Performance's bands: the top row is where 100 impressions went, the bottom row where 100 clicks went. A
 * keyword's own screen bands its pages; a page's own screen its keywords (`of`, search-console-pages-way-1-plan-2026-11-17.md:
 * Anthony, "just build it", the keyword screen's Way 2 for a page).
 */
export function KeywordPagesBands({ bands, host, of = "pages" }: { bands: KeywordBands | null | undefined; host: string; of?: "pages" | "keywords" }) {
  const t = useTranslations(of === "pages" ? "searchConsole.record.bands" : "searchConsole.record.pageBands");
  const tb = useTranslations("searchConsole.performance.bands");
  const ts = useTranslations("searchConsole.performance.squares");
  const [lit, setLit] = useState<string | null>(null);
  const parts = bands?.parts ?? [];
  const top = outOfTotal(parts.map((part) => part.impressions));
  const bottom = outOfTotal(parts.map((part) => part.clicks));
  const clicksWord = tb("noun.clicks");
  const segments: StripSegment[] = parts.map((part, at) => ({
    key: part.key,
    name: part.name,
    top: top[at] ?? 0,
    bottom: bottom[at] ?? 0,
    colour: stripColour(part.key === "rest" ? 99 : at),
    readout: [
      { value: formatNumber(part.impressions), label: tb("readout.impressions") },
      { value: ts("readout.inEvery", { share: oneDecimal(per100(part.impressions, bands?.impressions ?? 0)) }), label: tb("readout.ofImpressions") },
      { value: formatNumber(part.clicks), label: tb("against.clicks") },
      { value: ts("readout.inEvery", { share: oneDecimal(per100(part.clicks, bands?.clicks ?? 0)) }), label: tb("readout.ofThose", { noun: clicksWord }) },
    ],
  }));
  return (
    <MapCard
      title={t("title")}
      hint={bands ? [t("hint", { shown: bands.shown, clicked: bands.clicked }), tb("press")].join(" ") : ""}
      exportName={`${host}-search-console-${of === "pages" ? "keyword-pages" : "page-keywords"}`}
      csv={() => toCsv([t("csvName"), tb("readout.impressions"), tb("against.clicks")], parts.map((part) => [part.name, part.impressions, part.clicks]))}
      host={host}
      loading={bands === undefined}
      message={bands !== undefined && (bands === null || bands.impressions === 0) ? ts("empty") : null}
    >
      <HundredStrips segments={segments} topLabel={tb("topLabel")} bottomLabel={tb("bottomLabel", { noun: clicksWord })} lit={lit} onLit={setLit} />
    </MapCard>
  );
}
