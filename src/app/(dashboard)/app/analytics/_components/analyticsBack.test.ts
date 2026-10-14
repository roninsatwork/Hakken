import { describe, expect, test } from "vitest";
import { backTarget } from "./analyticsBack";

/** A page's own screen goes back to the screen it was opened from (landing-pages-flow-plan.md LF9). */
describe("where a page's own screen goes back to", () => {
  test("the screen it was opened from, its address whole: dates, filters, sort and the table's page", () => {
    expect(backTarget("landing-pages?period=90&sort=left&direction=asc&page=2")).toEqual({
      path: "landing-pages?period=90&sort=left&direction=asc&page=2", screen: "landingPages", name: null,
    });
    expect(backTarget("")).toEqual({ path: "", screen: "overview", name: null });
    expect(backTarget("conversions")).toMatchObject({ screen: "conversions" });
    // Funnel, at its address now and at the one it had as Landing pages.
    expect(backTarget("funnel?period=30")).toMatchObject({ path: "funnel?period=30", screen: "landingPages" });
  });

  test("a channel's or an event's own screen by its name, and another page's own screen", () => {
    expect(backTarget("channels/channel?key=Organic+Search&period=30")).toMatchObject({ screen: "channel", name: "Organic Search" });
    expect(backTarget("events/event?key=generate_lead")).toMatchObject({ screen: "event", name: "generate_lead" });
    expect(backTarget("all-pages/page?key=~4&from=landing-pages")).toMatchObject({ screen: "page" });
  });

  test("anything else goes back to All pages: never an outside address, never a screen the section does not have", () => {
    for (const from of [null, undefined, "https://evil.example/", "//evil.example", "/app/admin", "sites/123", "connection?x=1", `landing-pages?q=${"x".repeat(3_000)}`]) {
      expect(backTarget(from)).toBeNull();
    }
  });
});
