/**
 * Comparing what the workspace holds for a care group against the official
 * register.
 *
 * The finder's gate proves a group's list was opened; nothing proved it was
 * read to the end. Allegra Care was the live case: eleven registered homes,
 * seven on file, and every per-site check passing. The referee for care groups
 * is the Care Quality Commission's register, read the way everything else on
 * this platform reads the web — search finds the group's provider pages on
 * cqc.org.uk, the page reader fetches them, and this file turns their text
 * into a count. Anthony, 2026-08-04: *"we have google search, we have places
 * api and we have firecrawl"* — no separate keyed feed.
 *
 * Kept pure and out of the Convex functions so the parsing and the arithmetic
 * can be tested against captured pages. A page shape this code does not
 * recognise becomes a named failure on the coverage row, never a silent zero.
 */

import { matchDiscoveredSite, nameFingerprint, type KnownSite } from "./salesDataProspectMatching";
import { normalizeKey } from "./salesDataImportService";

/** One location as the register's page describes it, reduced to what counts. */
export type RegisterLocation = {
  name: string;
  postcode?: string;
  /** Still registered — an archived profile is history, not a gap. */
  registered: boolean;
  /** The register's own id, so a filed prospect can cite its exact page. */
  locationId?: string;
};

/**
 * The register's provider ids among a search's answers.
 *
 * A search for a group surfaces its provider pages in every flavour —
 * overview, contact, services — and groups whose homes each sit in their own
 * registered company surface several providers. The ids are what matter; the
 * flavours collapse.
 */
export function extractProviderIds(results: { url: string }[]): string[] {
  const ids: string[] = [];
  for (const result of results) {
    const match = result.url.match(/cqc\.org\.uk\/provider\/(1-[0-9]+)/);
    if (match && !ids.includes(match[1])) ids.push(match[1]);
  }
  return ids;
}

/**
 * Words that open many businesses' names without identifying any of them.
 * Ordered stripping, unlike the matcher's sorted fingerprints, because here
 * order is the whole signal.
 */
const GENERIC_NAME_WORDS = new Set(["THE", "LTD", "LIMITED", "PLC", "AND", "CARE", "HOMES", "HOME", "GROUP", "NURSING"]);

function identifyingPrefix(name: string): string[] {
  return normalizeKey(name)
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
    .filter((word) => !GENERIC_NAME_WORDS.has(word));
}

/**
 * Does this registered company belong to the group?
 *
 * The company's name must open with the group's distinctive words, in order.
 * The register knows Colten Care as four companies — "Colten Care Limited"
 * and three numbered siblings — and Allegra registers each home as its own
 * company, "Allegra Fairmile Grange Limited": all open with their brand.
 * Containing the words was the first rule, and the first live run showed why
 * order matters: "Acorn Luxury Care Limited" and "London Luxury care LTD"
 * both contain "Luxury Care" and are somebody else entirely. A group that
 * has renamed outright is not claimed, and says so on its coverage row.
 */
export function providerBelongsToGroup(providerName: string, groupName: string): boolean {
  const groupWords = identifyingPrefix(groupName);
  if (groupWords.length === 0) return false;
  const providerWords = identifyingPrefix(providerName);
  return groupWords.every((word, index) => providerWords[index] === word);
}

/**
 * The register page's own furniture, never a care home's name. Compared
 * case-insensitively — the first live run met a lowercase "see old profile".
 */
const NOISE_LABELS = new Set(["full details", "see new profile", "see old profile"]);

const LOCATION_LINK = /\[([^\]]+)\]\(https:\/\/www\.cqc\.org\.uk\/location\/(1-[0-9]+)[^)]*\)/g;

/** As the Royal Mail prints one, anywhere in a location's block of text. */
const POSTCODE = /\b[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2}\b/;

/**
 * The locations named on a provider's services page.
 *
 * The page lists each location as a link to its profile, followed by its
 * address and, for closed registrations, an "Archived" marker — Newstone House
 * appears twice on Colten's page, once archived and once live, and must count
 * once. Each link opens a block that runs to the next link; the block is where
 * the address and the marker live.
 */
export function parseProviderPage(markdown: string): RegisterLocation[] {
  const matches = [...markdown.matchAll(LOCATION_LINK)].filter(
    (match) => !NOISE_LABELS.has(match[1].trim().toLowerCase())
  );

  const byId = new Map<string, RegisterLocation>();
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const locationId = match[2];
    if (byId.has(locationId)) continue;

    const blockStart = match.index ?? 0;
    const blockEnd =
      index + 1 < matches.length ? (matches[index + 1].index ?? markdown.length) : markdown.length;
    const block = markdown.slice(blockStart, blockEnd);

    const postcode = block.match(POSTCODE)?.[0];
    byId.set(locationId, {
      name: match[1].trim(),
      ...(postcode ? { postcode } : {}),
      registered: !/\bArchived\b/i.test(block),
      locationId,
    });
  }

  return dedupeRegisterLocations([...byId.values()]);
}

/**
 * One entry per home, across re-registrations and across providers.
 *
 * The same home under an old and a new registration is one home; live beats
 * archived, so a re-registered home counts as registered rather than as its
 * own ghost.
 */
export function dedupeRegisterLocations(locations: RegisterLocation[]): RegisterLocation[] {
  const byFingerprint = new Map<string, RegisterLocation>();
  for (const location of locations) {
    const fingerprint = nameFingerprint(location.name);
    const existing = byFingerprint.get(fingerprint);
    if (!existing || (!existing.registered && location.registered)) {
      byFingerprint.set(fingerprint, location);
    }
  }
  return [...byFingerprint.values()];
}

/**
 * The provider a location's own page names.
 *
 * Every location profile links "Provided and run by" to its registered
 * company, which is how a company no search surfaced is still found: a home
 * the workspace holds leads to its page, and its page leads to its company.
 */
export function extractProviderIdFromLocationPage(markdown: string): string | null {
  return markdown.match(/cqc\.org\.uk\/provider\/(1-[0-9]+)/)?.[1] ?? null;
}

/**
 * The known sites the register picture does not yet explain.
 *
 * When a home on file matches no register location, the register picture is
 * missing that home's company — Allegra registers every home separately, and
 * a search that surfaces one company makes "covered" a lie unless the others
 * are hunted down. These are the homes to hunt.
 */
export function unmatchedKnownSites(
  groupName: string,
  register: RegisterLocation[],
  known: KnownSite[]
): KnownSite[] {
  const registerAsKnown: KnownSite[] = register.map((location) => ({
    key: normalizeKey(location.name),
    name: location.name,
    groupName,
    ...(location.postcode ? { postcode: location.postcode } : {}),
  }));

  return known.filter(
    (site) =>
      matchDiscoveredSite(
        {
          siteName: site.name,
          groupName,
          ...(site.postcode ? { postcode: site.postcode } : {}),
        },
        registerAsKnown
      ).outcome === "NEW"
  );
}

export type CoverageArithmetic = {
  /** Live registered locations the register holds for the group. */
  registerCount: number;
  /** Of those, how many are on file — as a customer or a prospect. */
  accountedFor: number;
  /** The ones that are not, named so they can be filed as prospects. */
  missing: { name: string; postcode?: string; locationId?: string }[];
};

/**
 * The count that answers "did the finder read the whole list?".
 *
 * A register location matches on the same rules a discovered site does —
 * name, postcode, identifying words — because the register spells names its
 * own way and the postcode is the signal that survives respelling. A
 * fingerprint clash at a different postcode still counts as accounted for:
 * the site is on file and flagged, which is a person's decision pending, not
 * an unread one.
 */
export function computeCoverage(
  groupName: string,
  register: RegisterLocation[],
  known: KnownSite[]
): CoverageArithmetic {
  const counted = dedupeRegisterLocations(register).filter((location) => location.registered);

  const missing: { name: string; postcode?: string }[] = [];
  let accountedFor = 0;
  for (const location of counted) {
    const match = matchDiscoveredSite(
      {
        siteName: location.name,
        groupName,
        ...(location.postcode ? { postcode: location.postcode } : {}),
      },
      known
    );
    if (match.outcome === "NEW") {
      missing.push({
        name: location.name,
        ...(location.postcode ? { postcode: location.postcode } : {}),
        ...(location.locationId ? { locationId: location.locationId } : {}),
      });
    } else {
      accountedFor += 1;
    }
  }

  return { registerCount: counted.length, accountedFor, missing };
}
