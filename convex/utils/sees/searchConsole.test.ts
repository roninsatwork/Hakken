import { describe, expect, test } from "vitest";
import { updatesSees, volatilitySees, type VolatilityFacts } from "./searchConsole";

/**
 * What Hakken sees on Volatility and Google updates
 * (search-console-volatility-plan.md §4), on ronins.co.uk's own numbers of
 * October 2026: usually 1.5, 2.1 while September's spam update ran.
 */

const SPAM = { title: "September 2026 spam update", startedOn: "2026-09-24", finishedOn: "2026-10-08", before: 1.54, during: 2.06 };
const base: VolatilityFacts = {
  latest: { day: "2026-10-07", volatility: 2.4, movedUp5: 2, movedDown5: 10 },
  usual: 1.6,
  update: SPAM,
  clicks: { now: 61, before: 67 },
  impressions: { now: 4_100, before: 4_200 },
};
const codes = (box: ReturnType<typeof volatilitySees>) => ({ says: box.says.map((one) => one.code), steps: box.steps.map((one) => one.code) });

describe("Volatility's box (§4.1)", () => {
  test("moving more than usual while Google's update ran: it looks like Google; hold changes, check the drops, then their pages", () => {
    const box = volatilitySees(base);
    expect(codes(box)).toEqual({ says: ["updateMoved", "clicksFellWithIt", "pointsToGoogle"], steps: ["holdUntil", "checkDropped", "pagesIfNotBack"] });
    expect(box.says[0]).toMatchObject({ text: SPAM.title, a: 34, days: ["2026-09-24", "2026-10-08"] });
    expect(box.says[1]).toMatchObject({ a: 9 });
    expect(box.steps[0]).toMatchObject({ days: ["2026-10-22"], to: { segment: "google-updates" } });
    expect(box.steps[1]).toMatchObject({ a: 10, to: { segment: "volatility", filters: { way: "down" } } });
  });

  test("an update still rolling out: hold changes until it finishes", () => {
    const box = volatilitySees({ ...base, update: { ...SPAM, finishedOn: null } });
    expect(codes(box)).toEqual({ says: ["updateRolling", "clicksFellWithIt", "pointsToGoogle"], steps: ["holdWhileRolling", "checkDropped"] });
  });

  test("moving more than usual with no update: start with your own pages", () => {
    const box = volatilitySees({ ...base, update: null });
    expect(codes(box)).toEqual({ says: ["movedNoUpdate", "ownPagesFirst"], steps: ["checkDropped", "lookAtPages"] });
    expect(box.says[0]).toMatchObject({ a: 50, days: ["2026-10-07"] });
  });

  test("calm, with clicks and impressions falling together: fewer people searched — demand, not Google", () => {
    const box = volatilitySees({ ...base, update: null, latest: { ...base.latest!, volatility: 1.6 }, clicks: { now: 50, before: 67 }, impressions: { now: 3_000, before: 4_200 } });
    expect(codes(box)).toEqual({ says: ["demand", "isDemand"], steps: ["seeSearches"] });
    expect(box.says[0]).toMatchObject({ a: 29 });
  });

  test("calm: Google is calm, near your usual; clicks said only when they moved a tenth", () => {
    const calm = { ...base, update: null, latest: { ...base.latest!, volatility: 1.7 } };
    expect(codes(volatilitySees(calm))).toEqual({ says: ["calm"], steps: [] });
    const rose = volatilitySees({ ...calm, clicks: { now: 80, before: 67 } });
    expect(codes(rose)).toEqual({ says: ["calm", "clicksRoseCalm"], steps: ["seeWins"] });
    expect(rose.says[0]).toMatchObject({ a: 1.7, b: 1.6 });
  });

  test("no days yet, too few keywords, no usual yet", () => {
    expect(codes(volatilitySees({ ...base, latest: null }))).toEqual({ says: ["noDays"], steps: [] });
    expect(codes(volatilitySees({ ...base, latest: { ...base.latest!, volatility: null } }))).toEqual({ says: ["tooFew"], steps: [] });
    expect(codes(volatilitySees({ ...base, update: null, usual: null }))).toEqual({ says: ["calmNoUsual"], steps: [] });
  });

  test("an update whose days ran 30% or more above the fortnight before says Google, even when the newest day is calm", () => {
    const calmDay = { ...base, latest: { ...base.latest!, volatility: 1.9 }, usual: 1.8 };
    expect(codes(volatilitySees(calmDay)).says[0]).toBe("updateMoved");
    expect(codes(volatilitySees({ ...calmDay, update: { ...SPAM, during: 1.7 } })).says[0]).toBe("calm");
  });
});

describe("Google updates' box (§4.2)", () => {
  const facts = { ...SPAM, clicksChange: null, positionBefore: null, positionAfter: null };

  test("finished, its 14 days after not passed: what it did to positions, and when its clicks show", () => {
    const box = updatesSees(facts, "2026-10-08");
    expect(codes(box)).toEqual({ says: ["finished", "movedMore", "clicksShowOn"], steps: ["holdUntil"] });
    expect(box.says[1]).toMatchObject({ a: 34, b: 2.06, c: 1.54 });
    expect(box.says[2]).toMatchObject({ days: ["2026-10-22"] });
  });

  test("rolling out; then its 14 days after passed: what it did to clicks and position", () => {
    expect(codes(updatesSees({ ...facts, finishedOn: null }, "2026-10-08"))).toEqual({ says: ["rolling", "movingMore"], steps: ["holdWhileRolling"] });
    const done = updatesSees({ ...facts, clicksChange: -0.18, positionBefore: 17.4, positionAfter: 19.1 }, "2026-10-30");
    expect(codes(done)).toEqual({ says: ["cutClicks", "positionFromTo"], steps: ["seeLosses"] });
    expect(done.says[0]).toMatchObject({ a: 18 });
  });

  test("none in the dates", () => {
    expect(codes(updatesSees(null, "2026-10-08"))).toEqual({ says: ["noneInDates"], steps: [] });
  });
});
