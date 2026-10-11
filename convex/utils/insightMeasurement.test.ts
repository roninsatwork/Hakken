import { describe, expect, test } from "vitest";
import { enquiryCheck } from "./insightEnquiryCheck";
import type { Fact } from "./insightFacts";
import { measurementBrief, measurementFrom, type AnalyticsHealth } from "./insightMeasurement";

/**
 * The Measurement check (insights-analyst-plan.md §4.1, phase 13): whether the
 * figures can be trusted, from the facts the team read and Analytics' own
 * checks read as they are (I38) — each check a status a person can act on.
 */

const count = (key: string, value: number): Fact => ({ key, value, unit: "count", source: "analytics", label: key });
const passing = (check: string): AnalyticsHealth => ({ check, passing: true });
const HEALTHY = ["NOTHING_COUNTED", "NO_VALUE", "TRACKING_STOPPED", "SUDDEN_FALL", "SELF_REFERRAL", "PAYMENT_REFERRALS", "TOO_MUCH_UNKNOWN", "STRANGERS"].map(passing);

describe("the Measurement check", () => {
  test("a website measured well passes every check, Google's private searches aside", () => {
    const facts = [
      count("ga.counted.form_submission.times.365.now", 120), count("ga.event.form_submission.people.365.now", 110),
      count("sc.clicks.90.now", 1000), count("sc.tiedClicks.90.now", 930), count("ga.channel.Organic Search.visits.90.now", 900),
    ];
    const checks = measurementFrom(facts, enquiryCheck(facts), HEALTHY);
    expect(checks.map((check) => [check.check, check.status, check.found])).toEqual([
      ["enquiryCounted", "PASSING", "countsOnce"],
      ["everyWayCounted", "PASSING", "allFired"],
      ["enquiriesValued", "PASSING", "valued"],
      ["visitsHavePage", "PASSING", "havePage"],
      ["googleAgrees", "PASSING", "agree"],
      ["googleTiesPages", "PASSING", "tied"],
      ["analyticsSteady", "PASSING", "steady"],
      ["referralsReal", "PASSING", "real"],
      ["onlyThisWebsite", "PASSING", "only"],
    ]);
    expect(measurementBrief(checks)).toBeNull();
  });

  test("ways to enquire that never fired, Analytics' own failures, and Google's limit, as ronins.co.uk's", () => {
    const facts = [
      count("ga.counted.form_submission.times.365.now", 260), count("ga.event.form_submission.people.365.now", 255),
      count("ga.counted.phone_click.times.365.now", 0), count("ga.counted.email_click.times.365.now", 0),
      count("ga.funnel.click.did.365.now", 271), count("ga.funnel.click.then.365.now", 255),
      count("sc.clicks.90.now", 1070), count("sc.tiedClicks.90.now", 570), count("ga.channel.Organic Search.visits.90.now", 700),
    ];
    const health = HEALTHY.map((entry) => entry.check === "TOO_MUCH_UNKNOWN" ? { check: entry.check, passing: false, count: 33, share: 0.143 } : entry.check === "STRANGERS" ? { check: entry.check, passing: false, names: ["nclnet.org"], count: 39 } : entry);
    const checks = measurementFrom(facts, enquiryCheck(facts), health);
    const of = (id: string) => checks.find((check) => check.check === id)!;
    expect(of("enquiryCounted")).toMatchObject({ status: "LOOK", found: "leavesBefore", a: 255, b: 271 });
    expect(of("everyWayCounted")).toMatchObject({ status: "LOOK", found: "neverFired", names: ["phone_click", "email_click"], a: 2, b: 3 });
    expect(of("visitsHavePage")).toMatchObject({ status: "LOOK", found: "noPage", a: 33, b: 14 });
    expect(of("googleAgrees")).toMatchObject({ status: "LOOK", found: "fewer", a: 700, b: 1070 });
    expect(of("googleTiesPages")).toMatchObject({ status: "LIMIT", found: "partTied", a: 53 });
    expect(of("onlyThisWebsite")).toMatchObject({ status: "LOOK", found: "strangers", names: ["nclnet.org"], a: 39 });
    expect(measurementBrief(checks)).toContain("5 things to look at");
  });

  test("without Analytics, each of its checks says it can't tell yet rather than passing", () => {
    const facts = [count("sc.clicks.90.now", 400), count("sc.tiedClicks.90.now", 300)];
    const checks = measurementFrom(facts, enquiryCheck(facts), null);
    expect(checks.filter((check) => check.status === "PASSING")).toEqual([]);
    expect(checks.find((check) => check.check === "enquiryCounted")).toMatchObject({ status: "UNKNOWN", found: "noAnalytics" });
    expect(checks.find((check) => check.check === "googleTiesPages")).toMatchObject({ status: "LIMIT", a: 75 });
  });

  test("a handful of enquiries is too few to call either way", () => {
    const facts = [count("ga.counted.form_submission.times.365.now", 8), count("ga.event.form_submission.people.365.now", 8)];
    expect(measurementFrom(facts, enquiryCheck(facts), HEALTHY)[0]).toMatchObject({ status: "UNKNOWN", found: "tooFew", a: 8 });
  });
});
