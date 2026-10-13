import { describe, expect, test } from "vitest";
import type { Id } from "../_generated/dataModel";
import { checkForAssistant, checkOf, checkOnFor, clockFor, pageMoved, pageOfKey, trackOpen, type OpenFinding } from "./insightClock";
import type { Fact } from "./insightFacts";
import type { PageFacts } from "./moneyPageChecks";

/**
 * When a finding is checked (insightClock.ts; Anthony, 13 October 2026:
 * "why is this so far in the future", then "go"): its days start when it is
 * written and again when its page changes, it is judged once every day of
 * its figure is after that, against the same days a year before, and its
 * figure so far is kept each week.
 */

const PAGE = "/hub/kapferer-brand-identity-prism/";
const fact = (key: string, value: number, from: string, to: string): Fact => ({ key, value, unit: "count", source: "analytics", label: `conversions landing on ${PAGE}`, from, to });
const reading = (facts: Fact[]) => new Map(facts.map((entry) => [entry.key, entry]));
const landing = (which: "now" | "year", value: number, from: string, to: string) => fact(`ga.landing.${PAGE}.conversions.90.${which}`, value, from, to);
const open = (over: Partial<OpenFinding> = {}): OpenFinding => ({
  findingId: "finding_1" as Id<"insightFindings">, specialist: "conversion", watch: { key: `ga.landing.${PAGE}.conversions.365.now`, direction: "UP" },
  then: fact(`ga.landing.${PAGE}.conversions.365.now`, 1, "2025-10-11", "2026-10-10"), written: "2026-10-11", checkInDays: 90, clock: null, checkOn: "2027-01-09", ...over,
});

describe("when a finding is checked", () => {
  test("a figure held for 90 days is judged on them; a short check on 30 where they're held; one held for no span on its day", () => {
    const facts = reading([landing("now", 1, "2026-07-12", "2026-10-10"), landing("year", 0, "2025-07-12", "2025-10-10"),
      fact("sc.clicks.30.now", 90, "2026-09-11", "2026-10-10"), fact("sc.clicks.30.year", 80, "2025-09-11", "2025-10-10"), fact("sc.clicks.90.now", 300, "2026-07-12", "2026-10-10")]);
    expect(clockFor(`ga.landing.${PAGE}.conversions.365.now`, 90, facts, "2026-10-11")).toEqual({ from: "2026-10-11", why: "WRITTEN", days: 90, key: `ga.landing.${PAGE}.conversions.90`, page: PAGE });
    expect(clockFor("sc.clicks.90.now", 28, facts, "2026-10-11")).toMatchObject({ days: 30, key: "sc.clicks.30" });
    expect(clockFor("seo.ronins.co.uk.linkingSites.now", 56, facts, "2026-10-11")).toBeNull();
    expect(checkOnFor({ from: "2026-10-11", days: 90 })).toBe("2027-01-12");
    expect(checkOf({ watch: { key: "seo.ronins.co.uk.linkingSites.now" }, checkInDays: 56 }, facts, "2026-10-11")).toEqual({ checkOn: "2026-12-06" });
    expect(pageOfKey(`tech.page.${PAGE}.unreadDays`)).toBe(PAGE);
  });

  test("a finding from before gets its days from when it was written, and its figure so far", () => {
    const { updates } = trackOpen([open()], reading([landing("now", 1, "2026-07-12", "2026-10-10"), landing("year", 0, "2025-07-12", "2025-10-10")]), new Map(), "2026-10-19");
    expect(updates).toEqual([{
      findingId: "finding_1", clock: { from: "2026-10-11", why: "WRITTEN", days: 90, key: `ga.landing.${PAGE}.conversions.90`, page: PAGE }, checkOn: "2027-01-12",
      progress: { day: "2026-10-19", now: 1, against: 0, than: "YEAR", unit: "count", from: "2026-07-12", to: "2026-10-10" },
    }]);
  });

  test("its days start again when its page changes, and it waits until every day of its figure is after the change", () => {
    const clock = { from: "2026-10-11", why: "WRITTEN" as const, days: 90, key: `ga.landing.${PAGE}.conversions.90`, page: PAGE };
    const changed = trackOpen([open({ clock, checkOn: "2027-01-12" })], reading([]), new Map([[PAGE, "2026-11-03"]]), "2026-11-09");
    expect(changed.updates[0]).toMatchObject({ clock: { from: "2026-11-03", why: "PAGE_CHANGED" }, checkOn: "2027-02-04" });
    // Due, but its 90 days still start before the change: not judged yet.
    const restarted = { ...clock, from: "2026-11-03", why: "PAGE_CHANGED" as const };
    const early = trackOpen([open({ clock: restarted, checkOn: "2027-02-04" })], reading([landing("now", 3, "2026-11-02", "2027-01-30"), landing("year", 1, "2025-11-02", "2026-01-30")]), new Map(), "2027-02-08");
    expect(early.outcomes).toEqual([]);
    const judged = trackOpen([open({ clock: restarted, checkOn: "2027-02-04" })], reading([landing("now", 40, "2026-11-09", "2027-02-06"), landing("year", 10, "2025-11-09", "2026-02-06")]), new Map(), "2027-02-08");
    expect(judged.outcomes).toEqual([{ findingId: "finding_1", specialist: "conversion", outcome: "RIGHT", note: `conversions landing on ${PAGE}: 40 in the 90 days to 2027-02-06, against 10 the same days a year before.` }]);
  });

  test("a short check judged on 30 days goes on to 90 when those show no clear change", () => {
    const clicks = (days: 30 | 90, which: "now" | "year", value: number, from: string): Fact => ({ key: `sc.clicks.${days}.${which}`, value, unit: "count", source: "searchConsole", label: "Google clicks", from, to: "2026-11-20" });
    const clock = { from: "2026-10-12", why: "WRITTEN" as const, days: 30, key: "sc.clicks.30" };
    const watch = { key: "sc.clicks.90.now", direction: "UP" as const };
    const unclear = trackOpen([open({ watch, clock, checkOn: "2026-11-14", checkInDays: 56 })], reading([clicks(30, "now", 101, "2026-10-22"), clicks(30, "year", 100, "2025-10-22"), clicks(90, "now", 300, "2026-08-23"), clicks(90, "year", 290, "2025-08-23")]), new Map(), "2026-11-23");
    expect(unclear.outcomes).toEqual([]);
    expect(unclear.updates[0]).toMatchObject({ clock: { days: 90, key: "sc.clicks.90", from: "2026-10-12" }, checkOn: "2027-01-13" });
    const clear = trackOpen([open({ watch, clock, checkOn: "2026-11-14", checkInDays: 56 })], reading([clicks(30, "now", 200, "2026-10-22"), clicks(30, "year", 100, "2025-10-22"), clicks(90, "now", 300, "2026-08-23")]), new Map(), "2026-11-23");
    expect(clear.outcomes).toMatchObject([{ outcome: "RIGHT" }]);
  });

  test("a figure held for no span is read again on its day, against what it was when written", () => {
    const watch = { key: "seo.ronins.co.uk.linkingSites.now", direction: "UP" as const };
    const then: Fact = { key: watch.key, value: 40, unit: "count", source: "market", label: "linking websites" };
    const { outcomes, updates } = trackOpen([open({ watch, then, checkOn: "2026-12-06", checkInDays: 56 })], reading([{ ...then, value: 90 }]), new Map(), "2026-12-07");
    expect(outcomes).toMatchObject([{ outcome: "RIGHT" }]);
    expect(updates[0].progress).toMatchObject({ now: 90, against: 40, than: "WRITTEN" });
    expect(updates[0].clock).toBeUndefined();
  });

  test("a page has changed when its title, opening, a tenth of its words or a part the money pages' check names changes — not its spacing", () => {
    const page = (over: Partial<PageFacts> = {}) => ({ facts: { title: "Kapferer's prism", headline: "The brand identity prism", words: 1_200, price: false, proof: false, form: false, firstAsk: null, opening: "Kapferer's prism", ...over }, structured: [] });
    expect(pageMoved(page(), page({ title: "  kapferer's   PRISM " }))).toBe(false);
    expect(pageMoved(page(), page({ words: 1_400 }))).toBe(true);
    expect(pageMoved(page(), page({ form: true }))).toBe(true);
  });

  test("Ask Hakken reads how it is checked in the page's words", () => {
    const clock = { from: "2026-11-03", why: "PAGE_CHANGED" as const, days: 90, key: `ga.landing.${PAGE}.conversions.90`, page: PAGE };
    expect(checkForAssistant(clock, { day: "2026-11-09", now: 1, against: 0, than: "YEAR", unit: "count", to: "2026-11-07" }, "2027-02-04"))
      .toBe("Judged on the 90 days after its page changed on 2026-11-03, against the same days a year before, on 2027-02-04; the days start again if its page changes first. So far: 1 in the days to 2026-11-07, against 0 the same days a year before.");
  });
});
