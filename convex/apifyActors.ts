/**
 * Apify jobs the platform itself understands.
 *
 * Apify is exposed to agents as one generic tool: an admin configures which job
 * a tool runs, and the platform never learns what any of them do. This file is
 * the one deliberate exception — the Rightmove listings scraper, whose results
 * the Properties screen knows how to turn into property records.
 *
 * It lives on its own rather than beside the Apify actions because the webhook
 * that stores results needs it too, and that webhook does not run in Node.
 */

// template:remove:start properties
/** The Rightmove listings scraper behind the Properties screen. */
export const RIGHTMOVE_ACTOR_ID = "jKpgGfgRfzrGgEMa8";

/**
 * Whether a finished run's results can be read as property listings.
 *
 * Everything else an agent starts through the generic Apify tool has a shape
 * this platform has never seen. Writing those items into the properties table
 * would fabricate records out of whatever fields happened to line up, which is
 * worse than storing nothing: a wrong property looks exactly like a right one.
 */
export function producesPropertyListings(actorId: string | undefined): boolean {
  return actorId === RIGHTMOVE_ACTOR_ID;
}
// template:remove:end

/**
 * Every string that looks like a web address, at any depth of a job's settings.
 *
 * An Apify job takes its targets as URLs, and with a generic tool the agent
 * chooses both the job and those targets. The shape of the settings belongs to
 * the job, so there is no field to check — the whole payload is walked instead.
 * Missing one nested address would be enough to point a scraper at something
 * inside our own network.
 */
export function collectUrls(value: unknown, found: string[] = []): string[] {
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value.trim())) found.push(value.trim());
    return found;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectUrls(entry, found);
    return found;
  }
  if (value !== null && typeof value === "object") {
    for (const entry of Object.values(value)) collectUrls(entry, found);
  }
  return found;
}
