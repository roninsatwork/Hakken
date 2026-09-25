/**
 * What a pull *is*, as a single string.
 *
 * `operation : websiteId : paramsHash : cycleDate` — the same question asked
 * twice produces the same key, and a key already in the table is a question
 * already bought. Because DataForSEO charges when a task is posted rather than
 * when its result is read, this is the difference between a duplicate being
 * untidy and a duplicate being expensive.
 *
 * The cycle date is part of the key on purpose. Yesterday's rankings and
 * today's are different facts, so a key that left the date out would make the
 * second day look like a duplicate of the first and quietly stop collecting.
 * It is a date and not a timestamp for the same reason from the other side: a
 * cycle that starts at 09:00 and a catch-up that runs at 11:00 are the same
 * day's collection and must not be bought twice.
 *
 * Pure, and deliberately dependency-free: it is called from mutations, from
 * tests, and one day from a customer-facing door, and all three have to agree
 * to the character.
 */

/**
 * A stable digest of the parameters.
 *
 * Key order must not matter — `{ target, limit }` and `{ limit, target }` are
 * the same request, and a key that disagreed would buy it twice — so the
 * entries are sorted before hashing. Undefined values are dropped rather than
 * hashed as "undefined", because omitting a parameter and passing nothing are
 * the same request to DataForSEO.
 *
 * Not a crypto hash: this is a collision-avoidance key inside our own table,
 * not a security boundary, and it has to run identically in a Convex
 * mutation, in Node and in a browser test without importing anything. But 64
 * bits, not 32: every search checked on a day shares its operation, its
 * placeholder website and its date, so only this tells them apart — and at
 * ten thousand a day, 32 bits let two collide about one day in a hundred, one
 * search then served the other's results page (reliability plan 3.5). At 64,
 * about once in some thirty billion days.
 */
export function hashSeoParams(params: Record<string, unknown>): string {
  const entries = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => [key, normaliseValue(value)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  return hash64(JSON.stringify(entries));
}

/**
 * Arrays keep their order; everything else is sorted.
 *
 * A keyword list is not a set — DataForSEO returns results positionally — so
 * reordering it is a different request and must hash differently. A nested
 * object is a bag of named settings and is sorted like the top level.
 */
function normaliseValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normaliseValue);
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, inner]) => inner !== undefined && inner !== null)
      .map(([key, inner]) => [key, normaliseValue(inner)] as const)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  }
  return value;
}

/**
 * A 64-bit digest as sixteen hex characters: two 32-bit lanes, each character
 * mixed into both by different multipliers, then each lane's bits spread into
 * the other (the mixing of bryc's public-domain cyrb53, kept whole at 64 bits).
 */
function hash64(input: string): string {
  let high = 0xdeadbeef;
  let low = 0x41c6ce57;
  for (let index = 0; index < input.length; index += 1) {
    const unit = input.charCodeAt(index);
    high = Math.imul(high ^ unit, 2654435761);
    low = Math.imul(low ^ unit, 1597334677);
  }
  high = Math.imul(high ^ (high >>> 16), 2246822507);
  high ^= Math.imul(low ^ (low >>> 13), 3266489909);
  low = Math.imul(low ^ (low >>> 16), 2246822507);
  low ^= Math.imul(high ^ (high >>> 13), 3266489909);
  return (high >>> 0).toString(16).padStart(8, "0") + (low >>> 0).toString(16).padStart(8, "0");
}

/** A timestamp as the `YYYY-MM-DD` a cycle is collected for, in UTC. */
export function seoCycleDate(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

export function buildSeoIdempotencyKey(args: {
  operationId: string;
  websiteId: string;
  params: Record<string, unknown>;
  cycleStartedAt: number;
}): string {
  const paramsHash = hashSeoParams(args.params);
  return [
    args.operationId,
    args.websiteId,
    paramsHash,
    seoCycleDate(args.cycleStartedAt),
  ].join(":");
}
