import { describe, expect, test } from "vitest";
import { buildTaskReportEmail } from "./taskReportEmail";

/**
 * A chart of groups sent by email (ask-hakken-every-chart-plan-2026-10-31.md, phase 3 and the gaps): the biggest
 * group's figure big, each group written beside its bar, Search Console's countries named, the week's hours by day.
 */

const brand = { platformName: "Hakken", appUrl: "https://app.hakken.test" };
const sent = { every: "week", weekday: 1, timeOfDay: "08:00", link: "/app/search-console/site/countries-and-devices", website: "morehandles.co.uk", period: "lastMonth" };

describe("a chart of groups by email", () => {
  test("Search Console's clicks by country: each country by its name, the biggest first", () => {
    const made = buildTaskReportEmail({ language: "en", brand, payload: {
      ...sent, look: "analyticsGroups", kind: "bars", by: "country", measure: "clicks",
      groups: [{ name: "gbr", value: 840, before: 790 }, { name: "irl", value: 60 }],
    } });
    if ("skip" in made) throw new Error(made.skip);
    expect(made.subject).toBe("Clicks from Google by country: United Kingdom 840");
    expect(made.content.lede).toBe("Last month, against the month before.");
    expect(made.content.facts?.map((fact) => fact.term)).toEqual(["United Kingdom", "Ireland"]);
    expect(made.content.facts?.[0].note).toBe("The period before: 790.");
    expect(made.pictures?.[0].bars.values).toEqual([840, 60]);
  });

  test("the week's hours: each day's busiest and quietest four hours in words, no picture", () => {
    const made = buildTaskReportEmail({ language: "en", brand, payload: {
      ...sent, look: "analyticsGroups", kind: "grid", by: "hour", measure: "conversions", event: "purchase",
      groups: [{ name: "08:00–12:00", value: 40 }, { name: "12:00–16:00", value: 25 }],
      rows: [{ event: "1", values: [12, 4] }, { event: "0", values: [1, 3] }],
    } });
    if ("skip" in made) throw new Error(made.skip);
    expect(made.subject).toBe("When people made a purchase, by hour and day: 08:00–12:00 40");
    expect(made.content.facts?.map((fact) => [fact.term, fact.value, fact.note])).toEqual([
      ["Monday", "12", "highest 08:00–12:00 12, lowest 12:00–16:00 4"],
      ["Sunday", "3", "highest 12:00–16:00 3, lowest 08:00–12:00 1"],
    ]);
    expect(made.pictures).toBeUndefined();
  });

  test("Clarity's grid: each measure by name, its highest and lowest page, in percent", () => {
    const made = buildTaskReportEmail({ language: "en", brand, payload: {
      ...sent, look: "analyticsGroups", source: "clarity", kind: "grid", by: "page", measure: "scroll",
      groups: [{ name: "/", value: 900 }, { name: "/basket", value: 300 }],
      rows: [{ event: "scroll", values: [41.2, 63] }, { event: "rageClicks", values: [2, 7] }],
    } });
    if ("skip" in made) throw new Error(made.skip);
    expect(made.subject).toBe("What people do on each page, from Clarity: / 900");
    expect(made.content.facts?.map((fact) => [fact.term, fact.note])).toEqual([
      ["Scroll", "highest /basket 63%, lowest / 41.2%"],
      ["Angry clicks", "highest /basket 7%, lowest / 2%"],
    ]);
  });

  test("Visibility's websites at the newest check, by its day, counted not shared", () => {
    const made = buildTaskReportEmail({ language: "en", brand, payload: {
      ...sent, look: "analyticsGroups", source: "visibility", kind: "bars", by: "website", measure: "estimatedVisitors", period: "latest", asOf: "2026-10-28",
      groups: [{ name: "corston.com", value: 4120 }, { name: "morehandles.co.uk", value: 2210 }],
    } });
    if ("skip" in made) throw new Error(made.skip);
    expect(made.subject).toBe("Estimated visitors from Google by website: corston.com 4,120");
    expect(made.content.lede).toBe("At the newest check, 28 October.");
  });
});
