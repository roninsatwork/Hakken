"use client";

import { useTranslations } from "next-intl";
import { ChangeLine } from "@/src/ui/components/screens/Change";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { formatNumber } from "../../sites/_components/siteFormat";
import type { PlacesFigures } from "./placesSees";
import { formatRate } from "./searchConsoleFormat";

/**
 * Countries and devices' four boxes, as Anthony chose them on 18 November 2026 (the canvas's Way 1, once the boxes
 * followed the country menu: "can we align this to the country scope"; search-console-countries-and-devices-way-1-plan-
 * 2026-11-18.md). Every box is about the country chosen in the menu, each against the dates before. The chart is the
 * part Keywords and Pages share (`TickedDays.tsx`); the two tables are the page's own (`PlacesTable`), as the screen kit
 * wants a table in the file whose header is above it.
 */

/** A move as a whole per cent, as the redone boxes write it ("5%"); one under 1% keeps its one decimal ("0.4%"). Demand by Classification's boxes too. */
export function percentOf(share: number): string {
  return share < 0.005 ? formatRate(share) : formatRate(Math.round(share * 100) / 100).replace(/[.,]0(?=\s?%)/, "");
}

/**
 * A move fewer or more than the dates before, as the redone boxes say it: 5% fewer than September; a count's move as a
 * count, 2 more. Position bands' boxes share it (search-console-position-bands-way-3-plan-2026-11-19.md), and `neutral` is
 * for a move that's neither good nor bad (fewer keywords at 21 and below).
 */
export function MoveLine({ now, before, against, count = false, neutral = false }: { now: number; before: number | null; against: string; count?: boolean; neutral?: boolean }) {
  const t = useTranslations("searchConsole.places.boxes");
  if (before === null) return <ChangeLine by={null}>{t("nothingBefore", { before: against })}</ChangeLine>;
  const by = now - before;
  if (by === 0) return <ChangeLine by={0}>{t("same", { before: against })}</ChangeLine>;
  const size = count || before === 0 ? formatNumber(Math.abs(by)) : percentOf(Math.abs(by) / before);
  return <ChangeLine by={by} neutral={neutral}>{t(by > 0 ? "more" : "fewer", { change: size, before: against })}</ChangeLine>;
}

/**
 * The four boxes: the country chosen's clicks, its share of every 100 clicks, the clicks from every other country, and
 * how many countries sent a click out of every country Google showed the website in. `country` is the country chosen as
 * a sentence says it ("the United Kingdom"); `against` the dates before ("September", "the 3 months before").
 */
export function PlacesBoxes({ figures, country, against }: { figures: PlacesFigures | null; country: string; against: string }) {
  const t = useTranslations("searchConsole.places.boxes");
  if (!figures) return <div className="h-[104px] animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />;
  const share = Math.round(figures.outOf100);
  const shareBefore = figures.outOf100Before === null ? null : Math.round(figures.outOf100Before);
  return (
    <FigureRow>
      {/* "Clicks", as Performance's first box, with the country on the line under it: "Clicks in the United Kingdom" took
          two lines at a laptop's width (Anthony, 18 November 2026: "You do it"). */}
      <Figure
        label={t("clicks")}
        value={formatNumber(figures.clicks)}
        detail={(
          <>
            <span className="block text-secondary">{t("inCountry", { country })}</span>
            <MoveLine now={figures.clicks} before={figures.clicksBefore} against={against} />
          </>
        )}
      />
      <Figure label={t("outOf100")} value={formatNumber(share)} detail={<MoveLine now={share} before={shareBefore} against={against} count />} />
      <Figure label={t("others")} value={formatNumber(figures.others)} detail={<MoveLine now={figures.others} before={figures.othersBefore} against={against} />} />
      <Figure
        label={t("clicked")}
        value={t("clickedOf", { count: formatNumber(figures.clicked), of: formatNumber(figures.countries) })}
        detail={<MoveLine now={figures.clicked} before={figures.clickedBefore} against={against} count />}
      />
    </FigureRow>
  );
}
