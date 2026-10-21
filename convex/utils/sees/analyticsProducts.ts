import { seen, toPage, type Seen } from "../hakkenSees";

/**
 * What Hakken sees on Products (docs/plans/active/google-analytics-plan.md
 * §18.7, GA34): fixed rules over the figures the screen's own read already
 * reads, as `analytics.ts` holds the other screens' — apart to keep each
 * module inside its size. Words under `googleAnalytics.seen.products`.
 */

/** A product looked at this often and bought this rarely wants a look at its page. */
export const MANY_LOOKS = 100;
export const RARELY_BOUGHT = 0.01;
/** Checkouts finished under this share want finding out why. */
export const FEW_FINISHED = 0.5;

/** The shop's four steps: the visits that reached each, shoppers rather than times (Anthony, 2026-10-21). */
export type ShopSteps = { looked: number; basket: number; checkout: number; bought: number };

/** The share of the visits that reached a step and left without buying: a basket or a checkout left. Null when none reached it. */
export function leftWithout(reached: number, bought: number): number | null {
  return reached > 0 ? Math.max(0, 1 - bought / reached) : null;
}

export type ProductFacts = { name: string; looks: number; bought: number; revenue: number };

/**
 * Products, by shoppers: the visits that looked at a product and how many added one to the basket; the baskets left
 * without buying and the checkouts not finished, each against the span before when there is one; a product looked at
 * 100 times or more and bought 1% of the time or less; the best seller. Then look at that product's page, and find out
 * why checkouts aren't finished (under half).
 */
export function productsSees(steps: ShopSteps, products: readonly ProductFacts[], before: ShopSteps | null = null): Seen {
  if (steps.looked === 0 && steps.bought === 0) return seen([{ code: "none" }]);
  const basketLeft = leftWithout(steps.basket, steps.bought);
  const basketBefore = before ? leftWithout(before.basket, before.bought) : null;
  const checkoutLeft = leftWithout(steps.checkout, steps.bought);
  const checkoutBefore = before ? leftWithout(before.checkout, before.bought) : null;
  const best = [...products].filter((product) => product.revenue > 0).sort((left, right) => right.revenue - left.revenue)[0] ?? null;
  const stuck = [...products]
    .filter((product) => product.looks >= MANY_LOOKS && product.bought / product.looks <= RARELY_BOUGHT)
    .sort((left, right) => right.looks - left.looks)[0] ?? null;
  return seen([
    steps.looked > 0 && { code: "looksToBasket", a: steps.looked, b: steps.basket, c: steps.basket / steps.looked },
    basketLeft !== null && (basketBefore !== null ? { code: "basketsLeft", a: basketLeft, b: basketBefore } : { code: "basketsLeftAlone", a: basketLeft }),
    checkoutLeft !== null && (checkoutBefore !== null
      ? { code: "checkoutsLeft", a: checkoutLeft, b: checkoutBefore, c: steps.checkout }
      : { code: "checkoutsLeftAlone", a: checkoutLeft, b: steps.checkout }),
    stuck && { code: "stuck", text: stuck.name, a: stuck.looks, b: stuck.bought },
    best && { code: "bestSeller", text: best.name, a: best.revenue },
  ], [
    // The product's page found by its name among the website's pages.
    stuck && { code: "seeProduct", text: stuck.name, link: "allPages", to: toPage("all-pages", { q: stuck.name }) },
    checkoutLeft !== null && 1 - checkoutLeft < FEW_FINISHED && { code: "whyUnfinished", link: "checkoutEvent", to: toPage("events/event", { key: "begin_checkout" }) },
  ]);
}
