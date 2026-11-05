/**
 * Campaigns in a person's words (docs/plans/active/campaigns-new-page-plan-2026-11-05.md, step 2), one place for the table, the map,
 * the squares, the eye and Ask Hakken, so they all say the same thing. Google says "google / cpc"; the page says Google Ads. A code
 * is what's kept and filtered on: the screens' words for it are in the dictionaries, and Ask Hakken's are here.
 */

/** Where a link was, for the sources a person would know by another name. Any other keeps its source, as it's written. */
export const CAME_FROM_CODES = ["googleAds", "googleFreeListing", "facebookAd", "instagramAd", "microsoftAds", "googleBusinessProfile", "email", "trustpilot", "pinterest", "notKnown"] as const;
export type CameFromCode = (typeof CAME_FROM_CODES)[number];

const PAID = new Set(["cpc", "ppc", "paid", "paidsocial", "paid_social", "paid-social", "ads", "ad"]);
const EMAIL = new Set(["email", "e-mail", "newsletter"]);
const NOT_SET = "(not set)";

/** Where a campaign's link was, from Google's "source / medium": a code, or the source as it's written. */
export function cameFromOf(sourceAndMedium: string): string {
  const cut = sourceAndMedium.lastIndexOf(" / ");
  const source = (cut < 0 ? sourceAndMedium : sourceAndMedium.slice(0, cut)).trim();
  const medium = (cut < 0 ? "" : sourceAndMedium.slice(cut + 3)).trim().toLowerCase();
  const name = source.toLowerCase();
  if (!source || name === NOT_SET) return "notKnown";
  if (EMAIL.has(medium)) return "email";
  if (name === "gmb" || name === "google business profile" || name === "google_business") return "googleBusinessProfile";
  if (name === "google") {
    if (PAID.has(medium)) return "googleAds";
    if (medium === "organic") return "googleFreeListing";
  }
  if ((name === "fb" || name === "facebook") && PAID.has(medium)) return "facebookAd";
  if ((name === "ig" || name === "instagram") && PAID.has(medium)) return "instagramAd";
  if ((name === "bing" || name === "microsoft") && PAID.has(medium)) return "microsoftAds";
  if (name === "trustpilot") return "trustpilot";
  if (name === "pinterest") return "pinterest";
  return source;
}

const CODES: ReadonlySet<string> = new Set(CAME_FROM_CODES);
/** Whether a place is one of the codes, with words of its own, or a source as it was written. */
export const isCameFromCode = (cameFrom: string): cameFrom is CameFromCode => CODES.has(cameFrom);

/** A campaign whose only name is a number, as an ad platform writes it: "52536031490414". */
export const hasNoName = (campaign: string) => /^\d{6,}$/.test(campaign.trim());

/** Ask Hakken's words for each place. The screens' are in `googleAnalytics.campaigns.cameFrom`. */
export const CAME_FROM_WORDS: Readonly<Record<CameFromCode, string>> = {
  googleAds: "Google Ads",
  googleFreeListing: "Google free listing",
  facebookAd: "Facebook ad",
  instagramAd: "Instagram ad",
  microsoftAds: "Microsoft Ads",
  googleBusinessProfile: "Google Business Profile",
  email: "Email",
  trustpilot: "Trustpilot",
  pinterest: "Pinterest",
  notKnown: "Not known",
};

/** A place in Ask Hakken's words. */
export const cameFromWords = (cameFrom: string) => (isCameFromCode(cameFrom) ? CAME_FROM_WORDS[cameFrom] : cameFrom);

/** A campaign in Ask Hakken's words: its name as tagged, or "Facebook ad with no name". */
export const campaignNameWords = (campaign: string, cameFrom: string) => (hasNoName(campaign) ? `${cameFromWords(cameFrom)} with no name` : campaign);

type CampaignFigures = { visits: number; visitsBefore?: number | null; change: number | null; purchases: number; purchasesBefore?: number | null; conversions: number; conversionsBefore: number | null; conversionRate: number | null; bounceRate: number | null; engagementRate: number | null; fewVisits: boolean };

/**
 * What the eye may read of a campaign: only what its page shows, in the page's names. The list holds more (time on the website, page views,
 * people), and a reader can't check a figure the page doesn't have: Ask Hakken quoted time on site for a campaign from it (2026-11-05).
 */
export const campaignForEye = (row: CampaignFigures, label: string, source: string) => ({
  label, source,
  visits: row.visits, visitsBefore: row.visitsBefore ?? null, change: row.change,
  purchases: row.purchases, purchasesBefore: row.purchasesBefore ?? null,
  conversions: row.conversions, conversionsBefore: row.conversionsBefore, conversionRate: row.conversionRate,
  bounceRate: row.bounceRate, engagementRate: row.engagementRate, fewVisits: row.fewVisits,
});

/** A place as Ask Hakken was asked for it, in the page's words or a code; any other is taken as a source, as it was written. */
export function cameFromAsked(asked: string): string {
  const words = asked.trim().toLowerCase();
  const found = CAME_FROM_CODES.find((code) => code.toLowerCase() === words || CAME_FROM_WORDS[code].toLowerCase() === words);
  return found ?? asked.trim();
}
