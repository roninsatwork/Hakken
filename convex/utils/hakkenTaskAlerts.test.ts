import { describe, expect, it } from "vitest";
import { alertTemplate, checkedAlert, dayWords, type AlertFacts } from "./hakkenTaskAlerts";

const facts: AlertFacts = {
  website: "example.co.uk",
  page: "https://example.co.uk/web-design-london/",
  measure: "visitors",
  condition: { op: "below", value: 10, days: 1 },
  day: "2026-10-05",
  value: 7,
  usual: 23,
  streak: 1,
};

describe("an alert's words", () => {
  it("says the day as people do", () => {
    expect(dayWords("2026-10-05")).toBe("Monday 5 October");
  });

  it("has a plain template: what happened, on which day, against its usual", () => {
    expect(alertTemplate(facts)).toEqual({
      headline: "/web-design-london/ had a quiet day",
      body: "It had 7 visitors from Google on Monday 5 October. It usually gets about 23 a day.",
    });
    expect(alertTemplate({ ...facts, page: undefined, condition: { op: "above", value: 1000, days: 1 }, value: 1204, streak: 3 }).body)
      .toBe("It had 1,204 visitors from Google on Monday 5 October. It usually gets about 23 a day. That's 3 days in a row.");
  });

  it("keeps the model's words only when every number in them is a checked figure", () => {
    const good = JSON.stringify({ headline: "A quiet day for your London page", body: "It had 7 visitors from Google on Monday 5 October, when it usually gets about 23." });
    expect(checkedAlert(good, facts)).toEqual(JSON.parse(good));

    const invented = JSON.stringify({ headline: "A quiet day", body: "It had 7 visitors, down 70% on the usual 23." });
    expect(checkedAlert(invented, facts)).toBeNull();
    expect(checkedAlert("Not JSON at all", facts)).toBeNull();
    expect(checkedAlert(JSON.stringify({ headline: "", body: "x" }), facts)).toBeNull();
  });

  it("does not count the numbers in the page's own address", () => {
    const withAddress = JSON.stringify({ headline: "Quiet day", body: "/web-design-london-2026/ had 7 visitors on Monday 5 October." });
    expect(checkedAlert(withAddress, { ...facts, page: "https://example.co.uk/web-design-london-2026/" })).not.toBeNull();
  });
});
