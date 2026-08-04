/**
 * Deciding whether a site the agent found is somebody the workspace already
 * supplies.
 *
 * The mirror of the chain trap. Backfill's danger is writing head office's
 * details onto nine hotels; prospecting's is filing a site as a new lead when
 * it is already a customer under a slightly different name — and a rep then
 * telephones an account the workspace has supplied for a decade.
 *
 * Kept pure and out of the Convex functions so each rule can be tested on its
 * own, because the rules are the whole feature. A prospect list that is merely
 * plausible is worth nothing.
 */

import { normalizeKey } from "./salesDataImportService";

/**
 * Words that carry no identity, stripped before comparing two names.
 *
 * `COLTEN CARE - AVON REACH` against `Avon Reach House` is one business, and
 * without this it reads as two. Deliberately short: every entry here is a way
 * two different businesses could be collapsed into one, so it holds only words
 * that genuinely never distinguish a site from its neighbour.
 */
const NOISE_WORDS = new Set([
  "THE",
  "LTD",
  "LIMITED",
  "PLC",
  "AND",
  "HOUSE",
  "HOME",
  "CARE",
  "HOTEL",
  "SCHOOL",
]);

/** A postcode compared as the Royal Mail prints it, not as somebody typed it. */
export function normalizePostcode(value: string | undefined): string | null {
  const trimmed = value?.trim().toUpperCase().replace(/\s+/g, "");
  if (!trimmed || trimmed.length < 5) return null;
  return trimmed;
}

/**
 * The identifying words of a business name, in a stable order.
 *
 * The group prefix goes, the noise words go, and what is left is sorted so
 * `AVON REACH HOUSE` and `COLTEN CARE - AVON REACH` both reduce to `AVON REACH`.
 * Sorting means word order cannot make two spellings of one site look like two
 * sites; the trade is that an anagram of a name would match, which is not a
 * thing that happens to care homes.
 */
export function nameFingerprint(siteName: string, groupName?: string): string {
  // An apostrophe folds into its word rather than splitting it: the register
  // prints "St Catherine's View" where the workbook holds "St Catherines
  // View", and "Daish's" against "Daishs" is the same trap. Split apart, one
  // business reads as two.
  const foldApostrophes = (value: string) => normalizeKey(value).replace(/['’]/g, "");

  const groupWords = new Set(
    groupName ? foldApostrophes(groupName).split(/[^A-Z0-9]+/).filter(Boolean) : []
  );

  const words = foldApostrophes(siteName)
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
    .filter((word) => !NOISE_WORDS.has(word))
    .filter((word) => !groupWords.has(word));

  // A name made entirely of noise and its own group — "COLTEN CARE LTD" — has
  // no identifying words left. Falling back to the whole normalised name stops
  // every such account collapsing onto the same empty fingerprint.
  if (words.length === 0) return normalizeKey(siteName);

  return [...new Set(words)].sort().join(" ");
}

/** What a discovered site is compared against: one business already on file. */
export type KnownSite = {
  key: string;
  name: string;
  postcode?: string;
  groupName?: string;
};

export type DiscoveredSite = {
  siteName: string;
  groupName: string;
  postcode?: string;
};

export type SiteMatch =
  /** Already supplied, or already found. Nothing is written. */
  | { outcome: "KNOWN"; matched: KnownSite; on: "NAME" | "POSTCODE" | "FINGERPRINT" }
  /** A new site. Recorded as a prospect. */
  | { outcome: "NEW" }
  /**
   * Reads like a known business but sits at a different postcode.
   *
   * Recorded as a prospect with the clash named, because assuming it is the
   * same business is the mistake that puts a rep on the phone to an existing
   * account, and assuming it is a different one silently duplicates.
   */
  | { outcome: "CONFLICT"; matched: KnownSite; note: string };

/**
 * Is this site already on file?
 *
 * In order of how much the signal is worth:
 *
 * 1. **The same name.** Nothing to decide.
 * 2. **The same postcode.** The strongest signal available — two care homes do
 *    not share one — so it settles the question even when the names differ.
 * 3. **The same identifying words.** `COLTEN CARE - AVON REACH` against
 *    `Avon Reach House`. Only trusted when the postcodes agree or one side has
 *    none; a clash here is a conflict rather than a match.
 */
export function matchDiscoveredSite(site: DiscoveredSite, known: KnownSite[]): SiteMatch {
  const siteKey = normalizeKey(site.siteName);
  const sitePostcode = normalizePostcode(site.postcode);
  const siteFingerprint = nameFingerprint(site.siteName, site.groupName);

  const byName = known.find((candidate) => candidate.key === siteKey);
  if (byName) return { outcome: "KNOWN", matched: byName, on: "NAME" };

  if (sitePostcode) {
    const byPostcode = known.find(
      (candidate) => normalizePostcode(candidate.postcode) === sitePostcode
    );
    if (byPostcode) return { outcome: "KNOWN", matched: byPostcode, on: "POSTCODE" };
  }

  const byFingerprint = known.find(
    (candidate) => nameFingerprint(candidate.name, candidate.groupName) === siteFingerprint
  );
  if (byFingerprint) {
    const knownPostcode = normalizePostcode(byFingerprint.postcode);
    if (sitePostcode && knownPostcode && sitePostcode !== knownPostcode) {
      return {
        outcome: "CONFLICT",
        matched: byFingerprint,
        note:
          `Reads like "${byFingerprint.name}", which is at ${byFingerprint.postcode}, `
          + `but this site is at ${site.postcode}. Filed separately for a person to settle.`,
      };
    }
    return { outcome: "KNOWN", matched: byFingerprint, on: "FINGERPRINT" };
  }

  return { outcome: "NEW" };
}
