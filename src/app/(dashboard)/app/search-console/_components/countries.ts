import { ALPHA3_TO_ALPHA2 } from "@/convex/utils/countryCodes";

/**
 * A country as the reader reads it: Google's three-letter code (`gbr`) turned
 * into the two-letter one the reader's language names, so `Intl.DisplayNames`
 * writes "United Kingdom" in English and "Regno Unito" in Italian. The codes
 * are the server's own list (`convex/utils/countryCodes.ts`). Null for a code
 * nobody can name.
 */
export function countryName(code: string, locale: string): string | null {
  const alpha2 = ALPHA3_TO_ALPHA2[code.toUpperCase()];
  return alpha2 ? regionName(alpha2, locale) : null;
}

/**
 * A two-letter country code (`GB`, as Google Analytics' `countryId` gives it)
 * in the reader's language. Null for a code nobody can name, "(not set)"
 * among them.
 */
export function regionName(alpha2: string, locale: string): string | null {
  if (!/^[a-z]{2}$/i.test(alpha2)) return null;
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(alpha2.toUpperCase()) ?? null;
  } catch {
    return null;
  }
}

/**
 * The countries English says with "the" before them: "in the United Kingdom", "in the Netherlands", but "in France"
 * (Countries and devices' "Clicks in the United Kingdom" and "Devices in the United Kingdom", search-console-countries-and-
 * devices-way-1-plan-2026-11-18.md). By their two-letter codes.
 */
const TAKES_THE = new Set([
  "AE", "AX", "BQ", "BS", "CC", "CF", "CK", "DO", "EH", "FK", "FO", "GB", "GM", "GS", "HM", "IM", "IO", "KM", "KY", "MH",
  "MP", "MV", "NL", "PH", "PN", "PS", "SB", "SC", "TC", "TF", "UM", "US", "VA", "VG", "VI",
]);

/**
 * A country as a sentence says it after "in": "the United Kingdom" and "France" in English. Other languages get the
 * name alone, and their words are written round it ("Clic · Regno Unito"). Null for a code nobody can name.
 */
export function countryInWords(code: string, locale: string): string | null {
  const alpha2 = ALPHA3_TO_ALPHA2[code.toUpperCase()];
  const name = alpha2 ? regionName(alpha2, locale) : null;
  if (!name || !alpha2) return name;
  return locale.startsWith("en") && TAKES_THE.has(alpha2) ? `the ${name}` : name;
}
