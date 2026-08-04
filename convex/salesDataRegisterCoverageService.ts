/**
 * Comparing what the workspace holds for a care group against the official
 * register.
 *
 * The finder's gate proves a group's list was opened; nothing proved it was
 * read to the end. Allegra Care was the live case: eleven registered homes,
 * seven on file, and every per-site check passing. The referee for care groups
 * is the Care Quality Commission's register, which lists every location a
 * provider is registered to run — so coverage becomes a count against an
 * outside authority rather than a promise.
 *
 * Kept pure and out of the Convex functions so the parsing and the arithmetic
 * can be tested against captured payloads. The register's API answers are
 * parsed defensively: a shape this code does not recognise becomes a named
 * failure on the coverage row, never a silent zero.
 */

import { matchDiscoveredSite, type KnownSite } from "./salesDataProspectMatching";
import { nameFingerprint } from "./salesDataProspectMatching";

/** One location as the register describes it, reduced to what coverage needs. */
export type RegisterLocation = {
  name: string;
  postcode?: string;
  /** Still registered — deregistered locations are history, not gaps. */
  registered: boolean;
  /** The register also lists offices and agencies; only care homes count. */
  careHome: boolean;
};

export type ProviderCandidate = { providerId: string; providerName: string };

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

/**
 * The provider-search answer: every provider the register knows by that name.
 *
 * Returns null when the payload is not the shape the register documents, so
 * the caller can record a check failure instead of "no providers".
 */
export function parseProviderSearch(payload: unknown): ProviderCandidate[] | null {
  const record = asRecord(payload);
  const list = record?.providers;
  if (!Array.isArray(list)) return null;

  const candidates: ProviderCandidate[] = [];
  for (const entry of list) {
    const provider = asRecord(entry);
    const providerId = asString(provider?.providerId);
    const providerName = asString(provider?.providerName);
    if (providerId && providerName) candidates.push({ providerId, providerName });
  }
  return candidates;
}

/**
 * Does this registered provider belong to the group?
 *
 * By identifying words rather than equality: the register knows Colten Care as
 * "Colten Care (1993) Limited", and a group whose homes each sit in their own
 * company — "Kanesbury Care (Kingsman House Care Home) Limited" — still reads
 * as its brand when the brand's words appear in every company name. A group
 * that has renamed outright is not found, and says so on its coverage row.
 */
export function providerBelongsToGroup(providerName: string, groupName: string): boolean {
  const groupWords = nameFingerprint(groupName).split(" ").filter(Boolean);
  if (groupWords.length === 0) return false;
  const providerWords = new Set(nameFingerprint(providerName).split(" ").filter(Boolean));
  return groupWords.every((word) => providerWords.has(word));
}

/** The location ids a provider's detail record names. Null on an alien shape. */
export function parseProviderLocationIds(payload: unknown): string[] | null {
  const record = asRecord(payload);
  const list = record?.locationIds;
  if (!Array.isArray(list)) return null;
  return list.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

/**
 * One location's detail record, reduced.
 *
 * The register says "Y" for a care home and "Registered" for a live
 * registration; anything else — offices, agencies, deregistered rows — is kept
 * but marked, so the arithmetic (not the parsing) decides what counts.
 */
export function parseLocation(payload: unknown): RegisterLocation | null {
  const record = asRecord(payload);
  const name = asString(record?.name) ?? asString(record?.locationName);
  if (!name) return null;

  return {
    name,
    ...(asString(record?.postalCode) ? { postcode: asString(record?.postalCode)! } : {}),
    registered: asString(record?.registrationStatus)?.toUpperCase() === "REGISTERED",
    careHome: asString(record?.careHome)?.toUpperCase() === "Y",
  };
}

export type CoverageArithmetic = {
  /** Registered care homes the register holds for the group. */
  registerCount: number;
  /** Of those, how many are on file — as a customer or a prospect. */
  accountedFor: number;
  /** The ones that are not, named so a person can see what is owed. */
  missing: { name: string; postcode?: string }[];
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
  const counted = register.filter((location) => location.registered && location.careHome);

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
      });
    } else {
      accountedFor += 1;
    }
  }

  return { registerCount: counted.length, accountedFor, missing };
}
