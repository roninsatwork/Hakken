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
