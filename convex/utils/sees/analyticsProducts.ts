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

/** The shop's four steps, as many times as each happened. */
export type ShopSteps = { looked: number; basket: number; checkout: number; bought: number };

export type ProductFacts = { name: string; looks: number; bought: number; revenue: number };

/**
 * Products: looks, baskets and the share in between; the share of checkouts
 * finished; a product looked at 100 times or more and bought 1% of the time
 * or less; the best seller. Then look at that product's page, and find out
 * why checkouts aren't finished (under half).
 */
export function productsSees(steps: ShopSteps, products: readonly ProductFacts[]): Seen {
  if (steps.looked === 0 && steps.bought === 0) return seen([{ code: "none" }]);
  const finished = steps.checkout > 0 ? Math.min(1, steps.bought / steps.checkout) : null;
  const best = [...products].filter((product) => product.revenue > 0).sort((left, right) => right.revenue - left.revenue)[0] ?? null;
  const stuck = [...products]
    .filter((product) => product.looks >= MANY_LOOKS && product.bought / product.looks <= RARELY_BOUGHT)
    .sort((left, right) => right.looks - left.looks)[0] ?? null;
  return seen([
    steps.looked > 0 && { code: "looksToBasket", a: steps.looked, b: steps.basket, c: steps.basket / steps.looked },
    finished !== null && { code: finished < FEW_FINISHED ? "fewFinished" : "finished", a: finished, b: steps.checkout },
    stuck && { code: "stuck", text: stuck.name, a: stuck.looks, b: stuck.bought },
    best && { code: "bestSeller", text: best.name, a: best.revenue },
  ], [
    // The product's page found by its name among the website's pages.
    stuck && { code: "seeProduct", text: stuck.name, link: "allPages", to: toPage("all-pages", { q: stuck.name }) },
    finished !== null && finished < FEW_FINISHED && { code: "whyUnfinished", link: "checkoutEvent", to: toPage("events/event", { key: "begin_checkout" }) },
  ]);
}
