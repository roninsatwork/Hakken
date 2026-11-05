import { PURCHASE_EVENT } from "./analyticsEvents";

/**
 * Which things people did get a column in "What people did after they arrived" (docs/plans/active/campaigns-new-page-plan-2026-11-05.md,
 * step 5): the website's most counted things, at most four. One that's nearly the same as another is left out, as it's the same
 * thing counted twice: More Handles counts `checkout_complete` 662 times and `purchase` 654. A purchase is kept over its twin.
 */
export const MOST_ACTIONS = 4;
/** Within this share of a thing already chosen, it's that thing again. */
const NEARLY_THE_SAME = 0.05;

export function chosenActions(totals: ReadonlyMap<string, number>, most = MOST_ACTIONS): string[] {
  const done = [...totals.entries()].filter(([, count]) => count > 0);
  const ranked = done.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  const purchase = ranked.find(([event]) => event === PURCHASE_EVENT);
  const chosen: Array<[string, number]> = purchase ? [purchase] : [];
  for (const entry of ranked) {
    if (chosen.length >= most) break;
    if (chosen.some(([event, count]) => event === entry[0] || Math.abs(count - entry[1]) <= NEARLY_THE_SAME * Math.max(count, entry[1]))) continue;
    chosen.push(entry);
  }
  return chosen.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).map(([event]) => event);
}

/** Ask Hakken's words for the things people do in a shop. Any other goes by Google's name, with its dashes taken out. */
const ACTION_WORDS: Readonly<Record<string, string>> = {
  add_to_cart: "Added to basket",
  begin_checkout: "Started checkout",
  purchase: "Bought",
  newsletter_sign_ups: "Signed up for emails",
};
export const actionWords = (event: string) => ACTION_WORDS[event] ?? event.replace(/[_-]+/g, " ").trim();
