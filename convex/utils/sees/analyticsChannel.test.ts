import { describe, expect, test } from "vitest";
import { channelPageSees, channelsPageSees, type ChannelPageFacts, type ChannelsPageFacts } from "./analyticsChannel";

/**
 * What Hakken sees on a channel's page and on Channels
 * (docs/plans/active/ga-channel-pages-plan.md CH12): each rule fires on the
 * figures that support it and keeps quiet otherwise, the same for any website.
 */

function facts(overrides: Partial<ChannelPageFacts> = {}): ChannelPageFacts {
  return {
    channel: "Organic Search",
    figures: { visits: 192, visitsBefore: 150, engaged: 146, people: 138, newPeople: 128, conversions: 0, conversionsBefore: 3, started: 0 },
    kinds: [
      { kind: "service", visits: 69, visitsBefore: 83, conversions: 0, conversionsBefore: 2 },
      { kind: "hub", visits: 53, visitsBefore: 29, conversions: 0, conversionsBefore: 0 },
      { kind: "NO_PAGE", visits: 32, visitsBefore: 15, conversions: 0, conversionsBefore: 0 },
    ],
    pages: [
      { key: "~1", visits: 33, visitsBefore: 49, conversions: 0, conversionsBefore: 2 },
      { key: "~2", visits: 22, visitsBefore: 17, conversions: 0, conversionsBefore: 1 },
    ],
    noPage: { visits: 32, engaged: 1 },
    uncounted: [],
    copies: [],
    ai: null,
    spans: null,
    ...overrides,
  };
}

const codes = (box: { says: Array<{ code: string }> }) => box.says.map((say) => say.code);

describe("a channel's own page", () => {
  test("the lead, the converting page losing visits, and where the change went", () => {
    const box = channelPageSees(facts());
    expect(box.says[0]).toEqual({ code: "lead.up.down", text: "Organic Search", a: 192, b: 150, c: 0, more: "3" });
    expect(box.says[1]).toEqual({ code: "pageFell", text: "~1", a: 49, b: 33, c: 2 });
    expect(box.says[2]).toEqual({ code: "shift", text: "hub", a: 29, b: 53, more: "service", c: 69 });
    expect(box.steps[0]).toMatchObject({ code: "winBack", text: "~1", link: "seePage", to: { segment: "landing-pages/page", filters: { key: "~1" } } });
    // The Content hub grew to 53 and converts nothing, while Service converted before.
    expect(box.steps[1]).toMatchObject({ code: "routeOn", text: "hub", a: 53, to: { segment: "channels/channel", filters: { key: "Organic Search", view: "groups" } } });
  });

  test("a page whose visits fell less than a fifth is no fall", () => {
    const box = channelPageSees(facts({ pages: [{ key: "~1", visits: 40, visitsBefore: 49, conversions: 0, conversionsBefore: 2 }] }));
    expect(codes(box)).not.toContain("pageFell");
  });

  test("a key event not counted: counted when Tracking health reads it as an enquiry, said either way", () => {
    const enquiry = channelPageSees(facts({ pages: [], kinds: [], uncounted: [{ eventName: "form_submission", count: 6, enquiry: true }] }));
    expect(enquiry.says).toContainEqual({ code: "uncountedEnquiry", text: "form_submission", a: 6 });
    expect(enquiry.steps).toContainEqual(expect.objectContaining({ code: "countIt", text: "form_submission", link: "chooseWhatCounts" }));
    const plain = channelPageSees(facts({ pages: [], kinds: [], uncounted: [{ eventName: "newsletter", count: 4, enquiry: false }] }));
    expect(plain.says).toContainEqual({ code: "uncounted", text: "newsletter", a: 4 });
    expect(plain.steps.map((step) => step.code)).not.toContain("countIt");
  });

  test("a conversion that is really something else is said before any key event not counted", () => {
    const box = channelPageSees(facts({ pages: [], kinds: [], copies: [{ eventName: "form_submission", other: "click", count: 9 }], uncounted: [{ eventName: "contact", count: 2, enquiry: true }] }));
    expect(box.says).toContainEqual({ code: "copy", text: "form_submission", more: "click", a: 9 });
    expect(box.steps).toContainEqual(expect.objectContaining({ code: "checkCopy", link: "trackingHealth" }));
  });

  test("visits with no page recorded over 5%: the engagement without them, and the fix", () => {
    const box = channelPageSees(facts({ pages: [], kinds: [] }));
    const noPage = box.says.find((say) => say.code === "noPage");
    expect(noPage?.a).toBe(32);
    expect(noPage?.b).toBeCloseTo(145 / 160);
    expect(noPage?.c).toBeCloseTo(146 / 192);
    expect(box.steps).toContainEqual(expect.objectContaining({ code: "fixNoPage", a: 32 }));
    expect(codes(channelPageSees(facts({ pages: [], kinds: [], noPage: { visits: 5, engaged: 0 } })))).not.toContain("noPage");
  });

  test("Direct's people mostly new: links whose source was lost, only from 10 people", () => {
    const direct = (people: number, newPeople: number) => channelPageSees(facts({
      channel: "Direct", pages: [], kinds: [], noPage: null,
      figures: { visits: 40, visitsBefore: 33, engaged: 33, people, newPeople, conversions: 3, conversionsBefore: 0, started: 3 },
    }));
    expect(direct(30, 27).says).toContainEqual({ code: "lostSources", a: 27, b: 30 });
    expect(direct(30, 27).steps).toContainEqual(expect.objectContaining({ code: "tagLinks", link: "campaigns" }));
    expect(codes(direct(30, 15))).not.toContain("lostSources");
    expect(codes(direct(8, 8))).not.toContain("lostSources");
  });

  test("what is particular to the channel comes before where the change went: Direct's lost sources are never crowded out", () => {
    const box = channelPageSees(facts({
      channel: "Direct", pages: [], noPage: null, uncounted: [{ eventName: "form_submission", count: 1, enquiry: false }],
      figures: { visits: 40, visitsBefore: 33, engaged: 33, people: 30, newPeople: 27, conversions: 3, conversionsBefore: 0, started: 3 },
    }));
    expect(codes(box)).toEqual(["lead.up.up", "lostSources", "shift"]);
  });

  test("growing over the year, falling now: said only when the last 90 days are below both spans", () => {
    const quiet = { pages: [], kinds: [], noPage: null };
    const falling = channelPageSees(facts({ ...quiet, spans: { last90: 23, previous90: 61, yearAgo90: 80, year: 254, yearBefore: 168 } }));
    expect(falling.says).toContainEqual({ code: "fallingNow", a: 23, b: 61, c: 80 });
    expect(codes(channelPageSees(facts({ ...quiet, spans: { last90: 70, previous90: 61, yearAgo90: 80, year: 254, yearBefore: 168 } })))).not.toContain("fallingNow");
    expect(codes(channelPageSees(facts({ ...quiet, spans: { last90: 23, previous90: 61, yearAgo90: 80, year: 100, yearBefore: 168 } })))).not.toContain("fallingNow");
  });

  test("AI assistants filed elsewhere, and conversions a channel starts beyond its own", () => {
    const quiet = { pages: [], kinds: [], noPage: null };
    expect(channelPageSees(facts({ ...quiet, ai: { visits: 254, elsewhere: 180 } })).says).toContainEqual({ code: "filedElsewhere", a: 180, b: 254 });
    const starts = channelPageSees(facts({ ...quiet, figures: { visits: 100, visitsBefore: 100, engaged: 80, people: 50, newPeople: 20, conversions: 3, conversionsBefore: 3, started: 6 } }));
    expect(starts.says).toContainEqual({ code: "starts", a: 6, b: 3 });
    const level = channelPageSees(facts({ ...quiet, figures: { visits: 100, visitsBefore: 100, engaged: 80, people: 50, newPeople: 20, conversions: 3, conversionsBefore: 3, started: 4 } }));
    expect(codes(level)).not.toContain("starts");
  });

  test("no visits: says so; nothing before: the new lead", () => {
    expect(channelPageSees(facts({ figures: { ...facts().figures, visits: 0 } })).says).toEqual([{ code: "none", text: "Organic Search" }]);
    const fresh = channelPageSees(facts({ pages: [], kinds: [], noPage: null, figures: { ...facts().figures, visitsBefore: null, conversionsBefore: null } }));
    expect(fresh.says[0]).toEqual({ code: "leadNew", text: "Organic Search", a: 192, c: 0 });
  });

  test("at most three sentences and three steps", () => {
    const box = channelPageSees(facts({ uncounted: [{ eventName: "form_submission", count: 6, enquiry: true }], ai: { visits: 192, elsewhere: 10 } }));
    expect(box.says.length).toBeLessThanOrEqual(3);
    expect(box.steps.length).toBeLessThanOrEqual(3);
  });
});

describe("Channels", () => {
  function overview(overrides: Partial<ChannelsPageFacts> = {}): ChannelsPageFacts {
    return {
      rows: [
        { channel: "Organic Search", visits: 192, visitsBefore: 150, conversions: 0, conversionsBefore: 3 },
        { channel: "Direct", visits: 40, visitsBefore: 33, conversions: 3, conversionsBefore: 0 },
        { channel: "AI assistants", visits: 8, visitsBefore: 2, conversions: 0, conversionsBefore: 1 },
      ],
      best: { channel: "AI assistants", rate: 0.059, siteRate: 0.015 },
      uncounted: [{ eventName: "form_submission", count: 7, enquiry: true, channel: "Organic Search" }],
      noPage: 38,
      ai: { visits: 8, elsewhere: 0 },
      ...overrides,
    };
  }

  test("the lead, the busiest channel converting nothing while another does, and a key event not counted", () => {
    const box = channelsPageSees(overview());
    expect(box.says[0]).toEqual({ code: "lead.up.down", a: 240, b: 185, c: 3, more: "4" });
    expect(box.says[1]).toEqual({ code: "topNone", text: "Organic Search", a: 0.8, more: "Direct", b: 40, c: 3 });
    expect(box.says[2]).toEqual({ code: "uncountedEnquiry", text: "form_submission", a: 7, more: "Organic Search" });
    expect(box.steps.map((step) => step.code)).toEqual(["whyStopped", "countIt", "fixNoPage"]);
    expect(box.steps[0]).toMatchObject({ text: "Organic Search", to: { segment: "channels/channel", filters: { key: "Organic Search" } } });
  });

  test("the channel converting best over 12 months, when nothing else fills the box first", () => {
    const box = channelsPageSees(overview({ uncounted: [] }));
    expect(box.says).toContainEqual({ code: "best", text: "AI assistants", a: 0.059, b: 0.015 });
  });

  test("no channels with visits: says so", () => {
    expect(channelsPageSees(overview({ rows: [] })).says).toEqual([{ code: "none" }]);
  });
});
