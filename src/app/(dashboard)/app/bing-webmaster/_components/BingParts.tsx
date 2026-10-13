"use client";

import { useTranslations } from "next-intl";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { ChangeLine } from "@/src/ui/components/screens/Change";
import { HakkenSees, type HakkenSeesStep } from "@/src/ui/components/screens/HakkenSees";
import { formatNumber } from "../../sites/_components/siteFormat";
import { formatPosition, formatRate } from "../../search-console/_components/searchConsoleFormat";

/**
 * The parts every Bing Webmaster page shares (bing-webmaster-plan.md §5, §6):
 * What Hakken sees, written from the page's own figures, and the four
 * figures, each beside Google's for the same days (BW10).
 */

/** A share of a whole, as the screens write it: "5.3%". */
export function formatShare(value: number | null | undefined): string {
  if (value === null || value === undefined) return "–";
  return `${(value * 100).toLocaleString("en-GB", { maximumFractionDigits: value < 0.1 ? 1 : 0 })}%`;
}

/** A click-through rate to two places, as Bing's own screen writes it: "0.31%". */
export function formatCtr(value: number | null | undefined): string {
  if (value === null || value === undefined) return "–";
  return `${(value * 100).toLocaleString("en-GB", { minimumFractionDigits: value < 0.01 ? 2 : 1, maximumFractionDigits: 2 })}%`;
}

/**
 * What Hakken sees on a Bing page: its sentences, and a step with the link to
 * where it is read. Written from the page's own answer, so it says only what
 * the page shows.
 */
export function BingSees({ says, steps = [] }: { says: (string | null | false | undefined)[]; steps?: HakkenSeesStep[] }) {
  const sentences = says.filter((line): line is string => Boolean(line));
  if (sentences.length === 0) return null;
  return <HakkenSees says={sentences.slice(0, 3)} steps={steps.slice(0, 3)} />;
}

type Totals = { clicks: number; impressions: number };

/**
 * Clicks, impressions, click-through rate and Bing's share of the website's
 * search clicks, each against Google's for the same days, as drawn (§5,
 * boards 2, 3 and 5). Without Search Console connected, each says so.
 */
export function BingFigures({ bing, google }: { bing: Totals | null; google: Totals | null }) {
  const t = useTranslations("bingWebmaster.figures");
  if (!bing) return <div className="h-24 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />;
  const ctr = bing.impressions > 0 ? bing.clicks / bing.impressions : null;
  const googleCtr = google && google.impressions > 0 ? google.clicks / google.impressions : null;
  const points = ctr !== null && googleCtr !== null ? Math.round((ctr - googleCtr) * 10_000) / 100 : null;
  const share = google && bing.clicks + google.clicks > 0 ? bing.clicks / (bing.clicks + google.clicks) : null;
  return (
    <FigureRow>
      <Figure
        label={t("clicks")}
        value={formatNumber(bing.clicks)}
        detail={<span className="text-secondary">{google ? t("google", { value: formatNumber(google.clicks) }) : t("noGoogle")}</span>}
      />
      <Figure
        label={t("impressions")}
        value={formatNumber(bing.impressions)}
        detail={<span className="text-secondary">{google ? t("google", { value: formatNumber(google.impressions) }) : t("noGoogle")}</span>}
      />
      <Figure
        label={t("ctr")}
        value={formatCtr(ctr)}
        detail={points !== null && googleCtr !== null ? (
          <ChangeLine by={points}>
            {t(points >= 0 ? "ctrAbove" : "ctrBelow", { points: Math.abs(points).toLocaleString("en-GB", { maximumFractionDigits: 2 }), google: formatCtr(googleCtr) })}
          </ChangeLine>
        ) : <span className="text-secondary">{t("noGoogle")}</span>}
      />
      <Figure
        label={t("share")}
        value={formatShare(share)}
        emphasis
        detail={<span className="text-secondary">{google ? t("shareOf", { bing: formatNumber(bing.clicks), total: formatNumber(bing.clicks + google.clicks) }) : t("noGoogle")}</span>}
      />
    </FigureRow>
  );
}

/** One keyword's or page's figures on its own screen, each beside Google's for the same 90 days. */
export function BingRecordFigures({ row }: {
  row: { clicks: number; impressions: number; ctr: number | null; position: number | null; googleClicks: number | null; googleImpressions: number | null; googlePosition: number | null } | null;
}) {
  const t = useTranslations("bingWebmaster.figures");
  if (!row) return <div className="h-24 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />;
  const googleCtr = row.googleImpressions && row.googleClicks !== null ? row.googleClicks / row.googleImpressions : null;
  const points = row.ctr !== null && googleCtr !== null ? Math.round((row.ctr - googleCtr) * 10_000) / 100 : null;
  const places = row.position !== null && row.googlePosition !== null ? Math.round((row.googlePosition - row.position) * 10) / 10 : null;
  const plain = (value: number | null, format: (value: number) => string) =>
    <span className="text-secondary">{value === null ? t("noGoogle") : t("googlePlain", { value: format(value) })}</span>;
  return (
    <FigureRow>
      <Figure label={t("clicks")} value={formatNumber(row.clicks)} detail={plain(row.googleClicks, formatNumber)} />
      <Figure label={t("impressions")} value={formatNumber(row.impressions)} detail={plain(row.googleImpressions, formatNumber)} />
      <Figure
        label={t("ctr")}
        value={formatRate(row.ctr)}
        detail={points !== null && googleCtr !== null ? (
          <ChangeLine by={points}>
            {t(points >= 0 ? "ctrAbove" : "ctrBelow", { points: Math.abs(points).toLocaleString("en-GB", { maximumFractionDigits: 1 }), google: formatRate(googleCtr) })}
          </ChangeLine>
        ) : plain(null, formatNumber)}
      />
      <Figure
        label={t("position")}
        value={formatPosition(row.position)}
        emphasis
        detail={places !== null ? (
          <ChangeLine by={places}>
            {t(places >= 0 ? "positionHigher" : "positionLower", { places: Math.abs(places).toLocaleString("en-GB"), google: formatPosition(row.googlePosition) })}
          </ChangeLine>
        ) : plain(null, formatNumber)}
      />
    </FigureRow>
  );
}
