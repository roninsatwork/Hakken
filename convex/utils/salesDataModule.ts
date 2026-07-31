/**
 * The module key for the sales data section.
 *
 * Its own file, rather than a constant exported from `salesData.ts`, because
 * the navigation needs it in the browser and `salesData.ts` defines Convex
 * queries — importing that into a client component would ship the backend with
 * it. `convex/utils/` is the shared home for values both sides need.
 */
export const SALES_DATA_MODULE_KEY = "salesData";
