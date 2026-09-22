/**
 * The places a website can be watched from.
 *
 * A short, curated list rather than DataForSEO's full catalogue, which runs to
 * tens of thousands of entries. Two reasons, and the second is the one that
 * matters: a picker over that many rows is unusable, and every code here has
 * been checked against their locations endpoint, whereas a free-text box would
 * let somebody save a number that quietly returns nothing for money.
 *
 * `2826` is the United Kingdom and is what the registry's operations already
 * default to, so a website with no location set behaves exactly as it does
 * today. That is why absence is a real value rather than a gap.
 *
 * Grows when a customer needs somewhere that is not here. It is meant to.
 */

/**
 * `countryIso` and `city` exist because the AI engines' web search does not
 * take a DataForSEO location code at all — it takes an ISO country and a city
 * name. One place list, two ways of naming it, so a client's chosen location
 * reaches every kind of collection without a second picker.
 */
export type SeoLocation = { code: number; label: string; countryIso: string; city?: string };

/** What an unset location resolves to, matching the registry's own defaults. */
export const DEFAULT_LOCATION_CODE = 2826;

export const SEO_LOCATIONS: readonly SeoLocation[] = [
  { code: 2826, label: "United Kingdom", countryIso: "GB" },
  { code: 1006886, label: "London, England", countryIso: "GB", city: "London" },
  { code: 1006654, label: "Birmingham, England", countryIso: "GB", city: "Birmingham" },
  { code: 1006974, label: "Manchester, England", countryIso: "GB", city: "Manchester" },
  { code: 1006925, label: "Leeds, England", countryIso: "GB", city: "Leeds" },
  { code: 1006752, label: "Liverpool, England", countryIso: "GB", city: "Liverpool" },
  { code: 1007136, label: "Bristol, England", countryIso: "GB", city: "Bristol" },
  { code: 1007220, label: "Newcastle upon Tyne, England", countryIso: "GB", city: "Newcastle upon Tyne" },
  { code: 1007183, label: "Sheffield, England", countryIso: "GB", city: "Sheffield" },
  { code: 1007387, label: "Nottingham, England", countryIso: "GB", city: "Nottingham" },
  { code: 9046459, label: "Edinburgh, Scotland", countryIso: "GB", city: "Edinburgh" },
  { code: 9046354, label: "Glasgow, Scotland", countryIso: "GB", city: "Glasgow" },
  { code: 9046254, label: "Cardiff, Wales", countryIso: "GB", city: "Cardiff" },
  { code: 9046084, label: "Belfast, Northern Ireland", countryIso: "GB", city: "Belfast" },
];

export function findSeoLocation(code: number): SeoLocation | null {
  return SEO_LOCATIONS.find((location) => location.code === code) ?? null;
}

/**
 * The code to send for a website, once inheritance is applied.
 *
 * Absent means the platform default rather than "no location", because every
 * DataForSEO operation needs one and leaving it out only moves the decision
 * into their defaults instead of ours.
 */
export function resolveLocationCode(stored: number | undefined): number {
  return stored ?? DEFAULT_LOCATION_CODE;
}
