import { PRODUCT_CHART_VIEWS } from "../analyticsProducts";
import { eyeWithParts } from "./googleAnalyticsShared";

/**
 * What Google Analytics Products hands its eye, built in one place for the screen (`products/page.tsx` and its charts)
 * and for a chat app's question (`chatAppEyes/googleAnalytics.ts`), so the two can't disagree
 * (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md, Option B). The page hands its boxes and steps; the table and the
 * chart hand their own rows. Visits, items and products, never money.
 */

/** Google's own names for a basket and a checkout: the steps whose boxes are named so. */
const BASKET = "add_to_cart";
const CHECKOUT = "begin_checkout";

export type ShopChoice = { steps: string[]; sale: string | null };
type EventFigure = { eventName: string; visits: number; visitsBefore: number | null };
type ProductsRead = {
  events: readonly EventFigure[];
  journey: { sale: EventFigure | null };
  choice: { steps: string[]; sale: string | null };
  neverBought: { count: number; of: number; countBefore: number | null };
};
type ChartRow = { name: string; itemsBought: number; itemsBoughtBefore: number | null; itemsAdded: number; itemsLeft: number };
type ChartRead = { left: readonly ChartRow[]; sold: readonly ChartRow[]; more: readonly ChartRow[]; less: readonly ChartRow[]; compared: boolean };
/** The products chart's views, in the order Show offers them: Left in baskets first. */
export type ProductChartView = "left" | "sold" | "more" | "less";

/** An event's visits now and the period before, by its Google name, from the page's events list. */
export function eventFigures(answer: Pick<ProductsRead, "events" | "journey">) {
  const held = new Map(answer.events.map((event) => [event.eventName, event]));
  // A step picked that recorded nothing in these dates is nought, against nought when the period before is held.
  const compared = answer.events.some((event) => event.visitsBefore !== null) || answer.journey.sale?.visitsBefore !== null;
  return (eventName: string): EventFigure => held.get(eventName) ?? { eventName, visits: 0, visitsBefore: compared ? 0 : null };
}

/**
 * What the eye reads of Products (page-screen-redo-plan-2026-11-03.md, step 3): only what the screen shows, under the
 * measures' names (`convex/utils/sees/measures.ts`), so code finds what moved — the four boxes against the period
 * before; the steps the shop picked, a funnel and never a whole (`picked`). Never every event the shop records.
 */
export function productsSeesData(answer: ProductsRead, choice: ShopChoice, nameOf: (eventName: string) => string, neverBoughtName: string) {
  const figureOf = eventFigures(answer);
  const steps = choice.steps.map(figureOf).sort((left, right) => right.visits - left.visits);
  const sale = choice.sale ? figureOf(choice.sale) : null;
  // The visits left after each of the first two steps, as the boxes count them, where they are Google's basket and checkout.
  const leftAt = (eventName: string) => {
    const step = steps.slice(0, 2).find((one) => one.eventName === eventName);
    if (!step || !sale) return null;
    const before = step.visitsBefore !== null && sale.visitsBefore !== null ? Math.max(0, step.visitsBefore - sale.visitsBefore) : null;
    return { now: Math.max(0, step.visits - sale.visits), before };
  };
  const baskets = leftAt(BASKET);
  const checkouts = leftAt(CHECKOUT);
  return {
    boxes: {
      ...(baskets ? { basketsLeft: baskets.now, basketsLeftBefore: baskets.before } : {}),
      ...(checkouts ? { checkoutsLeft: checkouts.now, checkoutsLeftBefore: checkouts.before } : {}),
      ...(sale ? { sale: nameOf(sale.eventName), visitsThatBought: sale.visits, visitsThatBoughtBefore: sale.visitsBefore } : {}),
      productsNeverBought: answer.neverBought.count, productsNeverBoughtBefore: answer.neverBought.countBefore, productsAdded: answer.neverBought.of, neverBoughtName,
    },
    steps: {
      picked: true,
      rows: steps.map((step) => ({ name: nameOf(step.eventName), visits: step.visits, visitsBefore: step.visitsBefore, visitsThatBought: sale ? Math.min(sale.visits, step.visits) : 0, visitsLeft: sale ? Math.max(0, step.visits - sale.visits) : step.visits })),
    },
  };
}

/**
 * The table's page on screen, picked from every product by its sort, so never "holds most of the list"; the rest of the
 * table by its name in the reader's words, for the eye's "left in baskets far more than the others".
 */
export function productsTableForEye<Row>(rows: readonly Row[] | undefined, othersName: string) {
  return rows ? { picked: true, rows, othersName } : undefined;
}

/**
 * The chart's figures: Selling more and Selling less, whichever view is on screen, with each product's items bought now
 * and before, so code finds what moved (page-screen-redo-plan-2026-11-03.md, step 3); and the view on screen. Ten
 * products picked from the whole list (`picked`) are no whole: never "holds most of the list".
 */
export function productsChartForEye(answer: ChartRead | null | undefined, view: ProductChartView) {
  if (!answer) return undefined;
  const listed = (list: readonly ChartRow[]) => ({
    picked: true,
    rows: list.map((row) => ({ name: row.name, itemsBought: row.itemsBought, itemsBoughtBefore: row.itemsBoughtBefore, itemsAdded: row.itemsAdded, itemsLeft: row.itemsLeft })),
  });
  return {
    view: PRODUCT_CHART_VIEWS[view],
    ...(answer.compared ? { sellingMore: listed(answer.more), sellingLess: listed(answer.less) } : {}),
    ...(view === "left" ? { leftMost: listed(answer.left) } : view === "sold" ? { soldMost: listed(answer.sold) } : {}),
  };
}

export type ProductsEyeWords = { eventName: (eventName: string) => string; neverBoughtName: string; othersName: string };

/** The page's reads: its own, the table's page as it opens, and the chart for every category. */
export type ProductsEyeReads<Row> = { products: ProductsRead | null | undefined; table: { rows: readonly Row[]; preparing?: boolean } | null | undefined; chart: ChartRead | null | undefined };

/**
 * Products' figures as its eye reads them, as the page opens: the steps and sale the shop picked, the table by product
 * sorted by items bought, the chart on Left in baskets. Null when the page shows none.
 */
export function productsEyeData<Row>(reads: ProductsEyeReads<Row>, words: ProductsEyeWords) {
  const { products } = reads;
  if (!products) return null;
  // A table still being built shows no rows (`useSiteListPage`), so it hands the eye none.
  const table = reads.table && !reads.table.preparing ? reads.table.rows : undefined;
  return eyeWithParts(productsSeesData(products, { steps: products.choice.steps, sale: products.choice.sale }, words.eventName, words.neverBoughtName), {
    productsTable: productsTableForEye(table, words.othersName),
    productsChart: productsChartForEye(reads.chart, "left"),
  });
}
