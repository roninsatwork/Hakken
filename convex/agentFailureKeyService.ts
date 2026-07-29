/**
 * Turning a failure message into something that groups.
 *
 * Failures on the agent screens were counted under the raw error string, used
 * verbatim as the grouping key. So "the property search timed out" and "the
 * property search timed out after 24000ms" were two separate problems, and any
 * error carrying a run id, a URL or a duration never grouped with anything at
 * all. The panel degraded into a list of near-duplicates at exactly the moment
 * there was a real problem to see.
 *
 * This strips out the parts that vary between two occurrences of the same fault
 * — ids, numbers, timestamps, URLs, quoted values — and leaves the shape of the
 * message behind. The original text is kept alongside the key for display; only
 * the grouping runs on this.
 */

/** Long enough that ordinary words never reach it, short enough to catch Convex ids. */
const OPAQUE_ID_MIN_LENGTH = 16;

/** Keys are only ever compared, never read aloud, so a hard ceiling is safe. */
const MAX_KEY_LENGTH = 200;

const REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  // Order matters: a URL contains digits and an ISO timestamp contains dashes,
  // so both have to be taken whole before the generic rules run.
  [/\bhttps?:\/\/\S+/gi, "<url>"],
  [/\b\d{4}-\d{2}-\d{2}t[\d:.]+z?\b/gi, "<time>"],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<id>"],
  // Convex ids and other opaque handles: long, unbroken, and carrying at least
  // one digit. The digit test is what keeps ordinary long words out.
  [new RegExp(String.raw`\b(?=[a-z0-9]*\d)[a-z0-9]{${OPAQUE_ID_MIN_LENGTH},}\b`, "gi"), "<id>"],
  // Quoted values are usually the specific thing that failed, not the failure.
  [/"[^"]*"/g, "<value>"],
  [/'[^']*'/g, "<value>"],
  // Numbers last, with any unit suffix attached so "24000ms" collapses whole.
  [/\b\d[\d.,]*\s*(ms|s|m|h|kb|mb|gb|%)?\b/gi, "<n>"],
];

/**
 * A trailing clause that is nothing but a placeholder, with the preposition
 * that introduced it: " after <n>", " at <time>", " (<id>)".
 *
 * Once the number is gone, "timed out after <n>" and "timed out" are the same
 * statement — but they are different strings, so the group splits on whether
 * the caller happened to append a duration. Because the clause is
 * information-free by the time this runs, dropping it can only merge messages
 * that were already indistinguishable without it; it cannot merge a timeout
 * with a refusal.
 */
const TRAILING_PLACEHOLDER =
  /[\s(,;:-]*\b(?:after|in|at|for|on|from|to|with|by)?\s*[([]?<(?:n|time|id|value|url)>[)\]]?[\s.,;:!-]*$/;

/**
 * A stable key for one kind of failure, or undefined when there is no message
 * to key on. Callers store the result next to the original text.
 */
export function buildFailureKey(message: string | undefined | null): string | undefined {
  if (typeof message !== "string") return undefined;

  let key = message.toLowerCase();
  for (const [pattern, replacement] of REPLACEMENTS) {
    key = key.replace(pattern, replacement);
  }

  key = key.replace(/\s+/g, " ").trim();

  // Loop: a message can end in more than one, as in "abandoned at <time> on <n>".
  let previous: string;
  do {
    previous = key;
    key = key.replace(TRAILING_PLACEHOLDER, "").trim();
  } while (key !== previous && key.length > 0);

  if (!key) return undefined;

  return key.length > MAX_KEY_LENGTH ? key.slice(0, MAX_KEY_LENGTH) : key;
}

/**
 * The message to show for a group. Failures that group together rarely word
 * themselves identically, so the shortest one is used: it is the one least
 * likely to be carrying an id or a stack fragment that only applies to a single
 * occurrence.
 */
export function pickGroupLabel(messages: ReadonlyArray<string>): string {
  let shortest: string | undefined;
  for (const message of messages) {
    const trimmed = message.trim();
    if (!trimmed) continue;
    if (shortest === undefined || trimmed.length < shortest.length) {
      shortest = trimmed;
    }
  }
  return shortest ?? "Unknown failure";
}
