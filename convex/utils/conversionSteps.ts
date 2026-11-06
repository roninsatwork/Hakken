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
