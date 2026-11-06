/**
 * What kind of thing an event is, by its name, in one small file
 * (overview-new-page-plan-2026-11-06.md, steps 4 and 16): the Connection page's
 * table and the charts' steps sort events by the same rule, so a website's
 * events never read two ways.
 */

export const EVENT_KINDS = ["sales", "buying", "touch", "other", "quiet"] as const;
/** A sale; a step on the way to buying; getting in touch; anything else; and not happening at all. */
export type EventKind = (typeof EVENT_KINDS)[number];

const SALE = /(^|[^a-z])(purchase|sale|transaction)([^a-z]|$)|checkout[^a-z]*complete|order[^a-z]*complete/i;
const BUYING = /basket|cart|checkout|payment|shipping/i;
const TOUCH = /form|contact|enquir|inquir|newsletter|sign[^a-z]*up|subscribe|call|phone|tel|e?mail|chat|whatsapp|quote|brochure|prospectus|book|demo|appointment|apply|application|register|lead/i;

/** An event's kind by its name. `quiet` is for one the check says hasn't happened, whatever its name says it would be. */
export function eventKind(eventName: string, quiet = false): EventKind {
  if (quiet) return "quiet";
  if (SALE.test(eventName)) return "sales";
  if (BUYING.test(eventName)) return "buying";
  if (TOUCH.test(eventName)) return "touch";
  return "other";
}

const FIRST_STEP = /click|chat|tel|phone|e?mail|whatsapp|call|apply/i;
const REAL_THING = /form|submit|book|sign[^a-z]*up|contact|subscribe|enquir|inquir|quote|brochure|prospectus|register|lead|sent/i;

/**
 * On a website that doesn't sell, a click is a first step and a form is the real thing (step 4). A click on Apply now is
 * never called an application. A name that reads as both is a click if it says so, as `click_contact` only opens the form.
 */
export function isFirstStep(eventName: string): boolean {
  if (/click|tap|shown|opened|view/i.test(eventName)) return true;
  if (REAL_THING.test(eventName)) return false;
  return FIRST_STEP.test(eventName);
}

/** Under 2 in every 100 visits doing the thing that counts, over 12 months, the squares go out of 1,000: a rare thing still gets squares to see. */
export function squaresOutOf(thingsDone: number, visits: number): 100 | 1000 {
  if (visits <= 0) return 100;
  return (100 * thingsDone) / visits < 2 ? 1000 : 100;
}

/** A website that sells, in one place: the connection says so, or something was bought in these dates or those before. */
export function isShop(connectionShop: boolean | undefined, boughtNow: number | null | undefined, boughtBefore: number | null | undefined): boolean {
  return connectionShop === true || (boughtNow ?? 0) > 0 || (boughtBefore ?? 0) > 0;
}

/** What a row of the page's splits holds, for the sums below. `did` lines up with the list of events it came with. */
export type StepFigures = { visits: number; stayed: number; did: readonly number[] };

const didOf = (row: StepFigures, events: readonly string[], eventName: string) => {
  const at = events.indexOf(eventName);
  return at < 0 ? 0 : row.did[at] ?? 0;
};

/** How many visits reached each step on a shop: arrived, stayed, added to a basket, started checkout, bought. */
export function shopSteps(row: StepFigures, events: readonly string[]): number[] {
  return [row.visits, row.stayed, didOf(row, events, "add_to_cart"), didOf(row, events, "begin_checkout"), didOf(row, events, "purchase")];
}

/**
 * The same on a website that doesn't sell: arrived, stayed, did anything, and did the real thing. A visit doing two things
 * counts in both, so these are close rather than exact, and the plan's limits say so.
 */
export function serviceSteps(row: StepFigures, events: readonly string[]): number[] {
  let firsts = 0;
  let real = 0;
  events.forEach((eventName, at) => {
    if (isFirstStep(eventName)) firsts += row.did[at] ?? 0;
    else real += row.did[at] ?? 0;
  });
  return [row.visits, row.stayed, Math.min(row.stayed, firsts + real), real];
}

/** How visits ended, from how many reached each step: each step less the next, and the last as it is. Never below nought. */
export function endingsOf(steps: readonly number[]): number[] {
  return steps.map((value, at) => (at === steps.length - 1 ? Math.max(0, value) : Math.max(0, value - steps[at + 1])));
}
