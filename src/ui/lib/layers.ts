/**
 * What sits on top of what.
 *
 * Every stacking bug in this app has had the same shape: two things pick a
 * z-index by hand, tie, and the one later in the document wins. The account
 * menu disappearing behind a page's filter bar was exactly that — the header
 * and the filter bar were both `z-30`, and the filter bar is further down the
 * page.
 *
 * The rule is that a screen never chooses a number. It chooses a role from
 * here, and the roles are ordered once, in one place.
 *
 * The subtlety worth knowing: a z-index only competes with its siblings inside
 * the nearest ancestor that forms a stacking context. `position` with a
 * z-index, `backdrop-blur`, `opacity` below 1 and `transform` all create one.
 * The app header is sticky *and* blurred, so the `z-[999]` on the menu inside
 * it never escaped the header's own layer — which is why raising that number
 * never fixed anything, and why the number that matters is the header's.
 *
 * Ordering, lowest first:
 *
 *   CONTENT      in-page elements that overlap each other
 *   RAISED       something that must beat its own page's content
 *   PAGE_CHROME  toolbars, filter bars, sticky table headings
 *   HEADER       the app header and anything opening out of it
 *   SIDEBAR      the main navigation, which covers the page when it is a drawer
 *   OVERLAY      modals and their backdrops
 *   NOTIFICATION toasts, which must clear a modal
 *
 * `PAGE_CHROME` is deliberately below `HEADER`. A filter bar has to cover the
 * table under it and must never cover the account menu. `SIDEBAR` stays above
 * `HEADER` because on a narrow screen it is a drawer over the whole page.
 */
export const LAYER = {
  CONTENT: "z-0",
  RAISED: "z-10",
  PAGE_CHROME: "z-20",
  HEADER: "z-40",
  SIDEBAR: "z-50",
  OVERLAY: "z-[60]",
  NOTIFICATION: "z-[70]",
} as const;

export type LayerName = keyof typeof LAYER;

/** Lowest to highest, so the guard can reason about what outranks what. */
export const LAYER_ORDER: LayerName[] = [
  "CONTENT",
  "RAISED",
  "PAGE_CHROME",
  "HEADER",
  "SIDEBAR",
  "OVERLAY",
  "NOTIFICATION",
];

/**
 * The z-index a role resolves to, as a number, for the guard and for tests.
 * `z-[60]` is an arbitrary-value Tailwind class; the number inside is what CSS
 * ends up with.
 */
export function layerValue(name: LayerName): number {
  const match = LAYER[name].match(/\d+/);
  return match ? Number(match[0]) : 0;
}
