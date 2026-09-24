import { SEO_LOCATIONS } from "./seoLocations";

/**
 * Reading back from a pull's sent arguments where its answer was asked from.
 * Moved out of `seoCollectionParse.ts` when that module neared the
 * thousand-line ceiling the module-size guard sets.
 */

const LOCATION_BY_CITY = new Map(
  SEO_LOCATIONS.filter((location) => location.city).map((location) => [location.city!, location.code]),
);

/**
 * Which place a ranking was measured from, read back from what was sent.
 *
 * The ranking operations take DataForSEO's location code directly, unlike the
 * AI engines below, which take a country and a city.
 */
export function readSentLocationCode(taskArgsJson: string | undefined): number | undefined {
  if (!taskArgsJson) return undefined;
  try {
    const args = JSON.parse(taskArgsJson) as Record<string, unknown>;
    return typeof args.location_code === "number" ? args.location_code : undefined;
  } catch {
    return undefined;
  }
}

/** Which place the question was asked from, read back from what was sent. */
export function readLocationCode(taskArgsJson: string | undefined): number | undefined {
  if (!taskArgsJson) return undefined;
  try {
    const args = JSON.parse(taskArgsJson) as Record<string, unknown>;
    // The engines take a country and city, not a code; the code is what the
    // company website stored, and it is recovered from the city when present.
    const city = typeof args.web_search_city === "string" ? args.web_search_city : undefined;
    if (!city) return undefined;
    return LOCATION_BY_CITY.get(city);
  } catch {
    return undefined;
  }
}
