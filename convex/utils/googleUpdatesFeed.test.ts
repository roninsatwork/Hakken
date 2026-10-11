import { describe, expect, test } from "vitest";
import { expectedDaysOf, feedUpdates, type FeedIncident } from "./googleUpdatesFeed";

/**
 * Google's Search Status page filed as Google updates
 * (search-console-volatility-plan.md, V14), on incidents as Google's feed
 * gave them on 2026-10-11.
 */

const SPAM: FeedIncident = {
  id: "XhUDXP7A67iHCD2kmbVu",
  begin: "2026-09-24T16:15:00+00:00",
  end: "2026-10-08T08:00:00+00:00",
  external_desc: "September 2026 spam update",
  service_name: "Ranking",
  uri: "incidents/XhUDXP7A67iHCD2kmbVu",
  updates: [
    { when: "2026-10-08T08:37:09+00:00", text: "The rollout was complete as of October 8, 2026.", status: "AVAILABLE" },
    {
      when: "2026-09-24T16:15:47+00:00",
      text: "Released the September 2026 spam update <https://developers.google.com/search/docs/appearance/spam-updates>, which applies globally and to all languages. The rollout may take up to two weeks to complete.",
      status: "SERVICE_INFORMATION",
    },
  ],
  most_recent_update: { status: "AVAILABLE" },
};
const SERVING: FeedIncident = {
  id: "s1", begin: "2026-02-25T10:00:00+00:00", end: "2026-02-25T14:00:00+00:00", external_desc: "Serving was experiencing an issue",
  service_name: "Serving", uri: "incidents/s1", updates: [], most_recent_update: { status: "AVAILABLE" },
};

describe("Google's update list from its Search Status page (V14)", () => {
  test("a ranking update filed as one entered by hand: its title, Google's words without the link, its days and its page", () => {
    expect(feedUpdates([SPAM])).toEqual([{
      titleEn: "September 2026 spam update",
      descriptionEn: "Released the September 2026 spam update, which applies globally and to all languages. The rollout may take up to two weeks to complete.",
      startedOn: "2026-09-24",
      finishedOn: "2026-10-08",
      expectedDays: 14,
      url: "https://status.search.google.com/incidents/XhUDXP7A67iHCD2kmbVu",
    }]);
  });

  test("only ranking updates; one still rolling out has no finish", () => {
    const rolling = { ...SPAM, id: "r", uri: "incidents/r", end: null, most_recent_update: { status: "SERVICE_INFORMATION" } };
    const filed = feedUpdates([SERVING, rolling]);
    expect(filed.map((update) => [update.titleEn, update.finishedOn])).toEqual([["September 2026 spam update", ""]]);
  });

  test("how long Google said it may take", () => {
    expect([
      expectedDaysOf("The rollout may take up to two weeks to complete."),
      expectedDaysOf("The rollout may take a few days to complete."),
      expectedDaysOf("The rollout may take up to 5 days to complete."),
      expectedDaysOf("Released the May 2026 core update."),
    ]).toEqual([14, 3, 5, 14]);
  });
});
