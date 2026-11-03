"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { periodBounds, shiftMonths, ukDay } from "@/convex/utils/calendarPeriods";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { ChangeLine } from "@/src/ui/components/screens/Change";
import { useSeesPart } from "@/src/ui/components/screens/hakkenSeesStore";
import { formatNumber } from "../../sites/_components/siteFormat";
import { changeOf, formatPercent } from "./analyticsFormat";
import { useEventName } from "./useEventName";
import { useAnalyticsArgs, useAnalyticsStatus, usePeriod, periodWord } from "./useAnalytics";

/** A page's screen read whole: its own figures and its story, two reads the screen runs side by side. */
export type PageAnswer = NonNullable<FunctionReturnType<typeof api.googleAnalyticsPageReads.analyticsPage>>
  & NonNullable<FunctionReturnType<typeof api.googleAnalyticsPageReads.analyticsPageStory>>;
type Boxes = NonNullable<FunctionReturnType<typeof api.googleAnalyticsPageBoxes.analyticsPageBoxes>>;

/**
 * The span before, as people name it: "September" for a month's dates (Anthony, 2026-11-03: words for a reading age
 * of 14, real names for dates), otherwise the section's own words ("the 3 months before").
 */
export function useBeforeNamed(): string {
  const tf = useTranslations("googleAnalytics.filters");
  const locale = useLocale();
  const [period] = usePeriod();
  const word = periodWord(period);
  if (word === "lastMonth" || word === "thisMonth") {
    const before = shiftMonths(periodBounds(word, ukDay()).from, -1);
    return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, { month: "long", timeZone: "UTC" }).format(new Date(`${before}T00:00:00Z`));
  }
  return tf(`before.${word}`);
}

/** A count against the span before, in plain words (3.4% fewer than September), as the kit's `ChangeLine` colours it. */
function MoreOrFewer({ now, before }: { now: number; before: number | null | undefined }) {
  const t = useTranslations("googleAnalytics.page.boxes");
  const named = useBeforeNamed();
  const change = changeOf(now, before);
  if (change === null) return <span className="block text-muted">{t("nothingBefore", { before: named })}</span>;
  return (
    <span className="block">
      <ChangeLine by={change}>{t(change > 0 ? "more" : change < 0 ? "fewer" : "same", { change: formatPercent(Math.abs(change)), before: named })}</ChangeLine>
    </span>
  );
}

/** A part of a whole as people say it: "1 in 4" while it is a half or less, a percentage above. */
function partOf(part: number, whole: number): { oneIn: number } | { percent: string } | null {
  if (whole <= 0 || part <= 0) return null;
  const share = part / whole;
  return share <= 0.5 ? { oneIn: Math.max(2, Math.round(1 / share)) } : { percent: formatPercent(share) };
}

/**
 * A page's four boxes (page-screen-redo-plan-2026-11-03.md, step 1; boards 2 and 3, approved by Anthony on
 * 3 November 2026, "we should only have 4 max"). On a product's page: Views, Added to basket, Bought (the box the eye
 * lands on first) and Started on this page. On any other page: Views, Started on this page, Visitors who bought (or,
 * off a shop, who did its main conversion) and Scrolled to the bottom. Counts and shares only, never money; visits,
 * never Google's count of times, so a share is never past 100%. The figures the eye reads go to it as one part.
 */
export function PageBoxes({ answer, page }: { answer: PageAnswer; page: string }) {
  const t = useTranslations("googleAnalytics.page.boxes");
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const nameOf = useEventName();
  const boxes: Boxes | null | undefined = useQuery(api.googleAnalyticsPageBoxes.analyticsPageBoxes, status?.connection?.newestDay && page ? { ...args, page } : "skip");
  const row = answer.row;
  const story = answer.story;
  const started = story.started;
  const product = boxes?.product ?? null;
  const sale = boxes?.sale ?? null;

  // What the eye reads of the boxes: the same figures, named as the boxes name them; one object while they stand.
  const seen = useMemo(() => (row ? {
    views: row.views, viewsBefore: answer.viewsBefore ?? null,
    visits: started?.visits ?? null, visitsBefore: started?.visitsBefore ?? null, websiteVisits: started?.websiteVisits ?? null,
    ...(product ? { itemsAdded: product.itemsAdded, itemsBought: product.itemsBought, itemsBoughtBefore: product.itemsBoughtBefore, websiteItemsBought: product.websiteItemsBought } : {}),
    ...(!product && sale ? { boughtRate: sale.startedVisits > 0 ? sale.visits / sale.startedVisits : null, websiteBoughtRate: sale.websiteVisits > 0 ? sale.websiteEventVisits / sale.websiteVisits : null } : {}),
    ...(!product ? { scrolledToBottomRate: story.read, groupScrolledToBottomRate: story.groupRead } : {}),
  } : null), [row, answer.viewsBefore, started, product, sale, story.read, story.groupRead]);
  useSeesPart("boxes", seen);

  if (!row) return null;
  const line = (words: string) => <span className="block text-secondary">{words}</span>;
  const quiet = (words: string) => <span className="block text-muted">{words}</span>;

  const views = <Figure label={t("views")} value={formatNumber(row.views)} detail={<MoreOrFewer now={row.views} before={answer.viewsBefore} />} />;
  const startedHere = (
    <Figure
      label={t("started")}
      value={started ? formatNumber(started.visits) : story.live ? "…" : "–"}
      detail={started ? <>
        {line(t("startedShare", { share: formatPercent(started.websiteVisits > 0 ? started.visits / started.websiteVisits : null) }))}
        <MoreOrFewer now={started.visits} before={started.visitsBefore} />
      </> : quiet(story.live ? t("collecting") : t("noneStarted"))}
    />
  );

  if (product) {
    const bought = partOf(product.itemsBought, product.itemsAdded);
    const ofAll = partOf(product.itemsBought, product.websiteItemsBought);
    return (
      <FigureRow columns={4}>
        {views}
        <Figure
          label={t("added")}
          value={formatNumber(product.itemsAdded)}
          detail={<>
            {line(bought === null ? t("noneBought") : "oneIn" in bought ? t("oneInBought", { count: bought.oneIn }) : t("shareBought", { share: bought.percent }))}
            {product.products > 1 ? quiet(t("versions", { count: product.products })) : null}
          </>}
        />
        <Figure
          label={t("bought")}
          value={formatNumber(product.itemsBought)}
          emphasis
          detail={line(ofAll === null ? t("noneSold") : "oneIn" in ofAll ? t("oneInSold", { count: ofAll.oneIn }) : t("shareSold", { share: ofAll.percent }))}
        />
        {startedHere}
      </FigureRow>
    );
  }

  const share = sale && sale.startedVisits > 0 ? sale.visits / sale.startedVisits : null;
  const websiteShare = sale && sale.websiteVisits > 0 ? sale.websiteEventVisits / sale.websiteVisits : null;
  return (
    <FigureRow columns={4}>
      {views}
      {startedHere}
      <Figure
        label={sale && !sale.shop ? t("converted") : t("whoBought")}
        value={sale ? formatNumber(sale.visits) : boxes === undefined ? "…" : "–"}
        emphasis
        detail={sale ? <>
          {line(t("ofThem", { share: formatPercent(share) }))}
          {quiet(t("wholeWebsite", { share: formatPercent(websiteShare) }))}
          {!sale.shop ? quiet(t("counting", { event: nameOf(sale.eventName) })) : null}
        </> : boxes === undefined ? null : quiet(t("noSale"))}
      />
      <Figure
        label={t("scrolled")}
        value={story.live && story.read === null ? "…" : formatPercent(story.read)}
        detail={story.read === null && !story.live ? quiet(t("notCounting")) : <>
          {line(t("ofPeople"))}
          {story.group && story.groupRead !== null ? quiet(t("similarPages", { share: formatPercent(story.groupRead) })) : null}
        </>}
      />
    </FigureRow>
  );
}
