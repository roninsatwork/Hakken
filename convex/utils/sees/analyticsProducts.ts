import { seen, toPage, type Seen } from "../hakkenSees";

/**
 * What Hakken sees on Products (docs/plans/active/products-screen-4-plan-2026-11-02.md, phase 4): fixed rules over the
 * figures the screen's own read already reads, as `analytics.ts` holds the other screens' — apart to keep each module
 * inside its size. Items and visits, never money (Anthony, 2026-11-02). Words under `googleAnalytics.seen.products`.
 */

/** A product added to baskets this often wants a look at its page when this share or less is bought. */
export const MANY_ADDED = 20;
export const RARELY_BOUGHT = 0.1;
/** Checkouts finished under this share want finding out why. */
export const FEW_FINISHED = 0.5;

/** Google's own names for a basket and a checkout: the steps whose words say so. */
const BASKET = "add_to_cart";
const CHECKOUT = "begin_checkout";

/**
 * Each view of Products' chart as the eye's writer reads it: what the chart shows, in the eye's own English, never the
 * screen's language (page-screen-redo-plan-2026-11-03.md, step 3).
 */
export const PRODUCT_CHART_VIEWS = {
  left: "products most often left in baskets",
  sold: "products sold most",
  more: "products selling more than before",
  less: "products selling less than before",
} as const;

/** An event's visits, and the period before's when held. */
export type JourneyFigure = { eventName: string; visits: number; visitsBefore: number | null };
/** The shop's steps, most visits first, and the event that means a sale. */
export type Journey = { steps: readonly JourneyFigure[]; sale: JourneyFigure | null };

/** The share of the visits that reached a step and left without buying: a basket or a checkout left. Null when none reached it. */
export function leftWithout(reached: number, bought: number): number | null {
  return reached > 0 ? Math.max(0, 1 - bought / reached) : null;
}

export type ProductFacts = { name: string; itemsBought: number; itemsAdded: number; itemsLeft: number };

/**
 * Products, by visits and items: the share left at each of the first two steps, against the period before when there
 * is one — named as baskets and checkouts where they are Google's own; the product added most and rarely bought; the
 * best seller. Then look at that product's page, and find out why checkouts aren't finished (under half).
 */
export function productsSees(journey: Journey, products: readonly ProductFacts[]): Seen {
  const sold = journey.sale?.visits ?? 0;
  if (journey.steps.every((step) => step.visits === 0) && sold === 0 && products.every((product) => product.itemsBought === 0)) return seen([{ code: "none" }]);
  const said = journey.sale === null ? [] : journey.steps.slice(0, 2).map((step) => {
    const left = leftWithout(step.visits, sold);
    if (left === null) return null;
    const soldBefore = journey.sale?.visitsBefore ?? null;
    const before = step.visitsBefore !== null && soldBefore !== null ? leftWithout(step.visitsBefore, soldBefore) : null;
    const code = step.eventName === BASKET ? "basketsLeft" : step.eventName === CHECKOUT ? "checkoutsLeft" : "stepLeft";
    return before !== null
      ? { code, a: left, b: before, c: step.visits, text: step.eventName }
      : { code: `${code}Alone`, a: left, c: step.visits, text: step.eventName };
  });
  const checkout = journey.steps.find((step) => step.eventName === CHECKOUT);
  const checkoutLeft = checkout ? leftWithout(checkout.visits, sold) : null;
  const best = [...products].filter((product) => product.itemsBought > 0).sort((left, right) => right.itemsBought - left.itemsBought)[0] ?? null;
  const stuck = [...products]
    .filter((product) => product.itemsAdded >= MANY_ADDED && product.itemsBought / product.itemsAdded <= RARELY_BOUGHT)
    .sort((left, right) => right.itemsLeft - left.itemsLeft)[0] ?? null;
  return seen([
    ...said,
    stuck && { code: "mostLeft", text: stuck.name, a: stuck.itemsAdded, b: stuck.itemsBought },
    best && { code: "bestSeller", text: best.name, a: best.itemsBought },
  ], [
    // The product's page found by its name among the website's pages.
    stuck && { code: "seeProduct", text: stuck.name, link: "allPages", to: toPage("all-pages", { q: stuck.name }) },
    journey.sale !== null && checkoutLeft !== null && 1 - checkoutLeft < FEW_FINISHED && { code: "whyUnfinished", link: "checkoutEvent", to: toPage("events/event", { key: CHECKOUT }) },
  ]);
}
