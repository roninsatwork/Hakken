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
  if (!alpha2) return null;
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(alpha2) ?? null;
  } catch {
    return null;
  }
}
