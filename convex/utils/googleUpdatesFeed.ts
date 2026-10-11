/**
 * Google's Search Status page as Hakken files it (search-console-volatility-
 * plan.md, V14): each ranking incident — "September 2026 spam update" —
 * turned into an update as Admin → Content → Google updates holds one. Pure,
 * so it is tested on Google's own answer.
 */

/** One incident as the page's feed gives it (the fields read). */
export type FeedIncident = {
  id: string;
  begin: string;
  end?: string | null;
  external_desc: string;
  service_name: string;
  uri: string;
  updates?: Array<{ when: string; text: string; status: string }>;
  most_recent_update?: { status: string } | null;
};

/** An update as `fileFeedUpdate` takes it. */
export type FeedUpdate = {
  titleEn: string;
  descriptionEn: string;
  startedOn: string;
  finishedOn: string;
  expectedDays: number;
  url: string;
};

const PAGE = "https://status.search.google.com/";
const WORD_NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

/** "up to two weeks" is 14, "a few days" 3, "up to 5 days" 5; otherwise the 14 Google's updates usually take. */
export function expectedDaysOf(text: string): number {
  const said = text.toLowerCase();
  const span = /up to (\w+) (day|week)s?/.exec(said);
  if (span) {
    const count = WORD_NUMBERS[span[1]] ?? Number(span[1]);
    if (Number.isInteger(count) && count > 0) return span[2] === "week" ? count * 7 : count;
  }
  if (said.includes("a few days")) return 3;
  return 14;
}

/** Google's words without its links: "Released the update <https://…>, which…" reads "Released the update, which…". */
const withoutLinks = (text: string) => text.replace(/\s*<https?:[^>]*>/g, "").trim();

/** The ranking updates among Google's incidents, oldest first, as Hakken files them. */
export function feedUpdates(incidents: readonly FeedIncident[]): FeedUpdate[] {
  return incidents
    .filter((incident) => incident.service_name === "Ranking" && incident.external_desc && incident.begin)
    .map((incident) => {
      const first = [...(incident.updates ?? [])].sort((left, right) => left.when.localeCompare(right.when))[0];
      const description = withoutLinks(first?.text ?? incident.external_desc);
      // Finished once Google says it is complete: its end is the day the rollout ended.
      const done = incident.most_recent_update?.status === "AVAILABLE" && incident.end;
      return {
        titleEn: incident.external_desc.trim(),
        descriptionEn: description,
        startedOn: incident.begin.slice(0, 10),
        finishedOn: done ? incident.end!.slice(0, 10) : "",
        expectedDays: expectedDaysOf(description),
        url: `${PAGE}${incident.uri}`,
      };
    })
    .sort((left, right) => left.startedOn.localeCompare(right.startedOn));
}
