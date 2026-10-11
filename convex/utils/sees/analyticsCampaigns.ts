import { seen, toPage, type Seen } from "../hakkenSees";
import type { ListRowFacts } from "./analytics";

/**
 * What Hakken sees on Campaigns (docs/plans/active/google-analytics-plan.md
 * §18.7, GA28): fixed rules over the list the screen already reads, as
 * `analytics.ts` holds the other screens' — apart to keep each module inside
 * its size. Words under `googleAnalytics.seen.campaigns`.
 */

/** Visits from tagged links under this share read as most of the marketing untold. */
export const FEW_TAGGED_SHARE = 0.1;
/** A campaign with this many visits and no conversion wants a look at where they landed. */
export const QUIET_CAMPAIGN_VISITS = 30;

const visitsOf = (rows: readonly ListRowFacts[]) => rows.reduce((total, row) => total + row.visits, 0);

/**
 * Campaigns: the share of visits from tagged links, said when under 10%; the
 * campaign that converted most; a campaign with 30 visits or more and no
 * conversion; "No visits came from a tagged link" when none. Then tag the
 * links in emails, ads and posts, and see where that campaign's visitors
 * landed.
 */
export function campaignsSees(rows: readonly ListRowFacts[], untagged: number): Seen {
  const tagged = visitsOf(rows);
  const tagLinks = { code: "tagLinks", link: "channels", to: toPage("channels") };
  if (tagged === 0) return seen([{ code: "none", a: untagged }], [tagLinks]);
  const all = tagged + untagged;
  const few = tagged / all < FEW_TAGGED_SHARE;
  const best = [...rows].filter((row) => row.conversions > 0).sort((left, right) => right.conversions - left.conversions || right.value - left.value)[0] ?? null;
  const quiet = [...rows].filter((row) => row.visits >= QUIET_CAMPAIGN_VISITS && row.conversions === 0).sort((left, right) => right.visits - left.visits)[0] ?? null;
  return seen([
    few ? { code: "fewTagged", a: tagged, b: all, c: untagged } : { code: "tagged", a: tagged, b: tagged / all },
    best ? { code: "best", text: best.label, a: best.conversions } : { code: "noneConverted" },
    quiet && { code: "quiet", text: quiet.label, a: quiet.visits },
  ], [
    few && tagLinks,
    quiet && { code: "seeLanding", text: quiet.label, link: "landingPages", to: toPage("landing-pages") },
  ]);
}
