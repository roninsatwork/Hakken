"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { PRODUCT_CHART_VIEWS } from "@/convex/utils/sees/analyticsProducts";
import { BarsCard } from "@/src/ui/components/screens/BarsCard";
import { useSeesPart } from "@/src/ui/components/screens/hakkenSeesStore";
import { CHART_COMPARATOR_GREY, CHART_SERIES_ORANGE } from "@/src/ui/components/charts/chartPalette";
import { useSiteParam } from "@/src/app/(dashboard)/app/sites/_components/useSiteParam";
import { useEventName } from "@/src/app/(dashboard)/app/analytics/_components/useEventName";
import { periodWord, useAnalyticsArgs, usePeriod } from "@/src/app/(dashboard)/app/analytics/_components/useAnalytics";

/**
 * Products' two charts (products-screen-4-plan-2026-11-02.md, phase 3; board "4 · Your products" of the canvas
 * "Products page, three ways"), each the kit's configurable chart drawn as bars (`ChartExplorer` with `bars`). Visits
 * and items only, never money.
 */

export type ShopChoice = { steps: string[]; sale: string | null };
type Answer = NonNullable<FunctionReturnType<typeof api.googleAnalyticsProductReads.analyticsProducts>>;

/** An event's visits now and the period before, by its Google name, from the page's events list. */
export function eventFigures(answer: Answer) {
  const held = new Map(answer.events.map((event) => [event.eventName, event]));
  // A step picked that recorded nothing in these dates is nought, against nought when the period before is held.
  const compared = answer.events.some((event) => event.visitsBefore !== null) || answer.journey.sale?.visitsBefore !== null;
  return (eventName: string) => held.get(eventName) ?? { eventName, visits: 0, visitsBefore: compared ? 0 : null };
}

/**
 * Bought or left behind: for each step the shop picked, its visits split into those that ended with the sale and those
 * that didn't, the step most visits reached first. Its two dropdowns pick the steps and the sale from the shop's own
 * events (Anthony, 2026-11-02: "too bespoke to Morehandles - perhaps we add the events to a drop down").
 */
export function BoughtOrLeftChart({ answer, choice, onPick, host }: {
  answer: Answer;
  choice: ShopChoice;
  onPick: (next: ShopChoice) => void;
  host: string;
}) {
  const t = useTranslations("googleAnalytics.products.steps");
  const nameOf = useEventName();
  const figureOf = eventFigures(answer);
  const sold = choice.sale ? figureOf(choice.sale).visits : 0;
  const steps = choice.steps.map(figureOf).sort((left, right) => right.visits - left.visits);
  const data = steps.map((step) => ({ label: nameOf(step.eventName), bought: Math.min(sold, step.visits), left: Math.max(0, step.visits - sold) }));
  const series = [
    { key: "bought", name: t("endedWith", { sale: choice.sale ? nameOf(choice.sale) : "" }), colour: CHART_SERIES_ORANGE },
    { key: "left", name: t("leftWithout"), colour: CHART_COMPARATOR_GREY },
  ];
  // The shop's own events, most visits first, and any it picked that recorded nothing in these dates.
  const listed = [...new Set([...answer.events.map((event) => event.eventName), ...choice.steps, ...(choice.sale ? [choice.sale] : [])])];
  return (
    <BarsCard
      title={t("title")}
      hint={t("hint")}
      exportName="google-analytics-shop-steps"
      csvHeading={t("stepsLabel")}
      host={host}
      waiting={null}
      controls={[
        {
          kind: "ticks", key: "steps", label: t("stepsLabel"), everyWord: t("everyEvent"),
          choices: listed.filter((name) => name !== choice.sale).map((name) => ({ key: name, label: nameOf(name) })),
          ticked: choice.steps,
          onChange: (next) => onPick({ steps: next, sale: choice.sale }),
        },
        {
          kind: "select", key: "sale", label: t("saleLabel"), value: choice.sale ?? "",
          options: [...(choice.sale ? [] : [{ value: "", label: t("noSale") }]), ...listed.map((name) => ({ value: name, label: nameOf(name) }))],
          onChange: (value) => onPick({ steps: choice.steps.filter((step) => step !== value), sale: value || null }),
        },
      ]}
      nothingTicked={choice.sale === null ? t("noSale") : choice.steps.length === 0 ? t("noSteps") : null}
      rows={data}
      series={series}
      figure={t("visits")}
      totalOf={(row) => Number(row.bought ?? 0) + Number(row.left ?? 0)}
      stacked
      anything={data.some((row) => row.bought + row.left > 0)}
      empty={t("empty")}
    />
  );
}

const VIEWS = ["left", "sold", "more", "less"] as const;
type View = (typeof VIEWS)[number];

/**
 * The products chart: ten products for whichever view Show picks — left in baskets, sold, selling more or selling less
 * than the period before — for one category or all (Anthony, 2026-11-02: "Add control for Products Sold, left in basket
 * is lovely and selling more or less ... make this core standard component that we can reuse").
 */
export function ProductsChart({ categories, host }: { categories: readonly string[]; host: string }) {
  const t = useTranslations("googleAnalytics.products.chart");
  const tf = useTranslations("googleAnalytics.filters");
  const args = useAnalyticsArgs();
  const [period] = usePeriod();
  const [view, setView] = useSiteParam<View>("chartShow", "left", VIEWS);
  const [category, setCategory] = useSiteParam<string>("chartCategory", "");
  const answer = useQuery(api.googleAnalyticsProductReads.analyticsProductChart, { ...args, ...(category ? { category } : {}) });
  const before = tf(`before.${periodWord(period)}`);
  // The eye is handed Selling more and Selling less, whichever view is on screen, with each product's items bought now
  // and before, so code finds what moved (page-screen-redo-plan-2026-11-03.md, step 3); and the view on screen. Ten
  // products picked from the whole list (`picked`) are no whole: never "holds most of the list".
  const seen = useMemo(() => {
    if (!answer) return undefined;
    const listed = (list: typeof answer.more) => ({
      picked: true,
      rows: list.map((row) => ({ name: row.name, itemsBought: row.itemsBought, itemsBoughtBefore: row.itemsBoughtBefore, itemsAdded: row.itemsAdded, itemsLeft: row.itemsLeft })),
    });
    return {
      view: PRODUCT_CHART_VIEWS[view],
      ...(answer.compared ? { sellingMore: listed(answer.more), sellingLess: listed(answer.less) } : {}),
      ...(view === "left" ? { leftMost: listed(answer.left) } : view === "sold" ? { soldMost: listed(answer.sold) } : {}),
    };
  }, [answer, view]);
  useSeesPart("productsChart", seen);
  const periodName = tf(`periods.${periodWord(period)}`);
  const compares = view === "more" || view === "less";
  const bought = { key: "bought", name: t("bought"), colour: CHART_SERIES_ORANGE };
  const series = view === "left"
    ? [bought, { key: "left", name: t("leftInBasket"), colour: CHART_COMPARATOR_GREY }]
    : view === "sold"
      ? [bought]
      : [{ key: "before", name: before.charAt(0).toUpperCase() + before.slice(1), colour: CHART_COMPARATOR_GREY }, { key: "bought", name: periodName, colour: CHART_SERIES_ORANGE }];
  const rows = answer?.[view] ?? [];
  const data = rows.map((row) => ({ label: row.name, bought: row.itemsBought, left: row.itemsLeft, before: row.itemsBoughtBefore ?? 0 }));
  return (
    <BarsCard
      title={t(`titles.${view}`, { before })}
      hint={t(`hints.${view}`, { before, period: periodName.toLowerCase() })}
      exportName="google-analytics-products-chart"
      csvHeading={t("items")}
      host={host}
      waiting={answer === undefined ? undefined : null}
      controls={[
        { kind: "select", key: "show", label: t("showLabel"), value: view, options: VIEWS.map((value) => ({ value, label: t(`views.${value}`) })), onChange: (value) => setView(value as View) },
        {
          kind: "select", key: "category", label: t("categoryLabel"), value: category,
          options: [{ value: "", label: t("everyCategory") }, ...categories.map((name) => ({ value: name, label: name }))],
          onChange: setCategory,
        },
      ]}
      rows={data}
      series={series}
      figure={t("items")}
      stacked={view === "left"}
      anything={data.length > 0 && (!compares || answer?.compared === true)}
      empty={compares && answer?.compared === false ? t("notCompared", { before }) : t("empty")}
    />
  );
}
