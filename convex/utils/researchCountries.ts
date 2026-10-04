import { SEO_LOCATIONS, countryCodeOf, resolveLocationCode } from "./seoLocations";

/**
 * The countries a keyword can be looked up in (docs/plans/active/keyword-
 * research-plan.md): the drawing's list, each a DataForSEO location code
 * checked against their locations list. Kept apart from `SEO_LOCATIONS`, the
 * places a website is watched from, so adding a country here adds nothing to
 * the website location picker.
 *
 * A lookup opens on the website's own country (Anthony, 2026-10-04: "just the
 * home countries by default"); another is looked up only when picked.
 */
export type ResearchCountry = { code: number; label: string; iso: string };

export const RESEARCH_COUNTRIES: readonly ResearchCountry[] = [
  { code: 2826, label: "United Kingdom", iso: "GB" },
  { code: 2372, label: "Ireland", iso: "IE" },
  { code: 2840, label: "United States", iso: "US" },
  { code: 2036, label: "Australia", iso: "AU" },
  { code: 2124, label: "Canada", iso: "CA" },
];

export const RESEARCH_COUNTRY_CODES: readonly number[] = RESEARCH_COUNTRIES.map((country) => country.code);

export function findResearchCountry(code: number): ResearchCountry | null {
  return RESEARCH_COUNTRIES.find((country) => country.code === code) ?? null;
}

/** A website's home country, from where it is watched — a city counts as its country; anywhere off the list as the United Kingdom. */
export function homeCountryOf(locationCode: number | undefined): number {
  const country = countryCodeOf(resolveLocationCode(locationCode));
  return findResearchCountry(country) ? country : RESEARCH_COUNTRIES[0].code;
}

/**
 * Where Google is asked from for a keyword's results: the city it names —
 * "app developer london" from London — when that city is one the platform
 * searches from (`SEO_LOCATIONS`), else the whole country. Asked from the
 * whole country, Google answered "app developer london" with job boards;
 * a searcher in London sees agencies (Anthony, 2026-10-04: "these are not
 * the results in Google"). A city of two or more words also answers to its
 * first ("newcastle"). The first city the keyword names wins.
 */
export function searchPlaceOf(keyword: string, countryCode: number): number {
  const iso = findResearchCountry(countryCode)?.iso;
  const text = ` ${keyword.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  let found: { code: number; at: number } | null = null;
  for (const place of SEO_LOCATIONS) {
    if (!place.city || place.countryIso !== iso) continue;
    const city = place.city.toLowerCase();
    for (const name of new Set([city, city.split(" ")[0]])) {
      const at = text.indexOf(` ${name} `);
      if (at >= 0 && (!found || at < found.at)) found = { code: place.code, at };
    }
  }
  return found?.code ?? countryCode;
}
