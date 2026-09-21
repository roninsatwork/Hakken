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
