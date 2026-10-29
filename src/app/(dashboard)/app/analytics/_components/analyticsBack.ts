/**
 * Where a page's own screen goes back to (docs/plans/active/landing-pages-flow-plan.md
 * LF9; Anthony, 2026-10-14: "the back button on the screen should take you
 * back to the screen you came from"). Every page link in the section carries
 * the screen it was clicked on, its address and all (`from`), so back returns
 * to it as it was — dates, device, country, filters, sort and the table's
 * page. Only the section's own screens are accepted, never an outside
 * address; anything else goes back to All pages.
 */
export const BACK_SCREENS = {
  "": "overview",
  live: "live",
  channels: "channels",
  "channels/channel": "channel",
  campaigns: "campaigns",
  // Landing pages is Funnel now; an address from before still comes back to it.
  funnel: "landingPages",
  "landing-pages": "landingPages",
  "all-pages": "allPages",
  "all-pages/page": "page",
  events: "events",
  "events/event": "event",
  conversions: "conversions",
  // The pages behind a square of the Conversions map (conversion-charts-plan.md).
  "conversions/pages": "conversionPages",
  products: "products",
  visitors: "visitors",
  "tracking-health": "trackingHealth",
} as const;

export type BackScreen = (typeof BACK_SCREENS)[keyof typeof BACK_SCREENS];

/** The longest address kept: a page opened from a page opened from a page still fits, a runaway never does. */
const MOST_FROM = 2_000;

/** The screen to go back to, its path and query within the website's section, and a channel's or event's name; null for All pages. */
export function backTarget(from: string | null | undefined): { path: string; screen: BackScreen; name: string | null } | null {
  if (from == null || from.length > MOST_FROM) return null;
  const at = from.indexOf("?");
  const segment = at < 0 ? from : from.slice(0, at);
  const query = at < 0 ? "" : from.slice(at + 1);
  if (!Object.prototype.hasOwnProperty.call(BACK_SCREENS, segment)) return null;
  const screen = BACK_SCREENS[segment as keyof typeof BACK_SCREENS];
  const name = screen === "channel" || screen === "event" ? new URLSearchParams(query).get("key") : null;
  return { path: query ? `${segment}?${query}` : segment, screen, name };
}
