import { describe, expect, test } from "vitest";
import { lookupsFromToolCalls } from "./assistantLookups";

/** What a reply looked up, read from its run's tool calls (assistant-foundation-plan.md, item 7). */
describe("a reply's look-ups", () => {
  const call = (handlerMapping: string, data: unknown, args: unknown = {}, status = "SUCCESS") => ({
    handlerMapping,
    status,
    argumentsJson: JSON.stringify(args),
    resultJson: JSON.stringify({ status: "success", data }),
  });

  test("one per call that read something, in order, with its screen, days and pages", () => {
    expect(lookupsFromToolCalls([
      call("assistant.websites", { websites: [], link: "/app/sites/a" }),
      call("assistant.searchConsole", { ok: true, website: "a.test", from: "2026-09-29", to: "2026-10-05", link: "/app/search-console/a" }),
      call("assistant.searchConsole", { ok: true, website: "a.test", from: "2026-09-06", to: "2026-10-05", link: "/app/search-console/a/pages" }, { page: "/boiler" }),
    ])).toEqual([
      { kind: "websites", link: "/app/sites/a" },
      { kind: "searchConsole", website: "a.test", days: 7, link: "/app/search-console/a" },
      { kind: "searchConsole", website: "a.test", days: 30, page: "/boiler", link: "/app/search-console/a/pages" },
    ]);
  });

  test("nothing for a call that read nothing: refused, failed, not the company's, or not a figure read", () => {
    expect(lookupsFromToolCalls([
      call("assistant.site.overview", { ok: false, problem: "b.test is not one of this company's websites." }),
      call("assistant.tasks.open", { tasks: [], link: "/app/tasks" }, {}, "FAILED"),
      call("knowledge.search", { results: [], link: "/somewhere" }),
      { handlerMapping: "assistant.ai.mentions", status: "SUCCESS", argumentsJson: "{}", resultJson: "not json" },
    ])).toEqual([]);
  });

  test("a chart of a calendar month is that month, not its days", () => {
    expect(lookupsFromToolCalls([
      call("assistant.chart", { ok: true, website: "a.test", from: "2026-09-01", to: "2026-09-30", link: "/app/search-console/a" }, { month: "2026-09" }),
      call("assistant.chart", { ok: true, website: "a.test", from: "2026-09-24", to: "2026-09-30", link: "/app/search-console/a" }, { days: 7 }),
    ])).toEqual([
      { kind: "searchConsole", website: "a.test", month: "2026-09", link: "/app/search-console/a" },
      { kind: "searchConsole", website: "a.test", days: 7, link: "/app/search-console/a" },
    ]);
  });

  test("the same look-up once", () => {
    const overview = call("assistant.site.overview", { ok: true, website: "a.test", link: "/app/sites/a" });
    expect(lookupsFromToolCalls([overview, overview])).toEqual([{ kind: "overview", website: "a.test", link: "/app/sites/a" }]);
  });
});
