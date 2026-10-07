import { describe, expect, it } from "vitest";
import { CHART_MARK, chartFromToolCalls, chartPoints, splitAtChart, type AnswerChart } from "./assistantCharts";

const chart: AnswerChart = {
  look: "searchConsoleDays",
  measure: "visitors",
  website: "example.co.uk",
  from: "2026-09-01",
  to: "2026-09-30",
  beforeFrom: "2026-08-01",
  beforeTo: "2026-08-31",
  points: [{ day: "2026-09-01", value: 70, before: 64 }],
  link: "/app/search-console/companyWebsites_1",
};
const ok = (data: unknown) => JSON.stringify({ status: "SUCCESS", data });

describe("a chart under an answer", () => {
  it("is the last chart the run drew, from a call that worked", () => {
    const later = { ...chart, measure: "impressions" as const };
    expect(chartFromToolCalls([
      { handlerMapping: "assistant.chart", status: "SUCCESS", resultJson: ok({ ok: true, chart }) },
      { handlerMapping: "assistant.searchConsole", status: "SUCCESS", resultJson: ok({ ok: true, link: "/x" }) },
      { handlerMapping: "assistant.chart", status: "SUCCESS", resultJson: ok({ ok: true, chart: later }) },
      { handlerMapping: "assistant.chart", status: "FAILED", resultJson: ok({ ok: true, chart }) },
    ])).toEqual(later);
    expect(chartFromToolCalls([{ handlerMapping: "assistant.chart", status: "SUCCESS", resultJson: ok({ ok: false, problem: "Not connected" }) }])).toBeUndefined();
    expect(chartFromToolCalls([{ handlerMapping: "assistant.chart", status: "SUCCESS", resultJson: ok({ ok: true, chart: { ...chart, points: [] } }) }])).toBeUndefined();
    expect(chartFromToolCalls([{ handlerMapping: "assistant.chart", status: "SUCCESS", resultJson: "not json" }])).toBeUndefined();
  });

  it("lines up each day with the day as many days before, a missing day counting as none", () => {
    const points = chartPoints(
      [{ day: "2026-09-01", value: 5 }, { day: "2026-09-03", value: 7 }],
      [{ day: "2026-08-29", value: 4 }],
      { from: "2026-09-01", to: "2026-09-03", beforeFrom: "2026-08-29" },
    );
    expect(points).toEqual([
      { day: "2026-09-01", value: 5, before: 4 },
      { day: "2026-09-02", value: 0, before: 0 },
      { day: "2026-09-03", value: 7, before: 0 },
    ]);
  });

  it("draws nothing before where Search Console's history starts, or when there are no days before", () => {
    const range = { from: "2026-09-01", to: "2026-09-02", beforeFrom: "2026-08-30", heldFrom: "2026-08-31" };
    expect(chartPoints([], [{ day: "2026-08-31", value: 3 }], range)).toEqual([
      { day: "2026-09-01", value: 0 },
      { day: "2026-09-02", value: 0, before: 3 },
    ]);
    expect(chartPoints([{ day: "2026-09-01", value: 2 }], null, range)[0]).toEqual({ day: "2026-09-01", value: 2 });
  });

  it("goes where the answer puts its mark, or after every word; the mark is never shown", () => {
    expect(splitAtChart(`September was good.\n\n${CHART_MARK}\n\nWant me to keep an eye on it?`)).toEqual({ before: "September was good.", after: "Want me to keep an eye on it?" });
    expect(splitAtChart("No mark here.")).toEqual({ before: "No mark here.", after: "" });
    expect(splitAtChart(`Twice ${CHART_MARK} and ${CHART_MARK} again`)).toEqual({ before: "Twice", after: "and  again" });
    // Still being written: the mark's first letters are not shown either.
    expect(splitAtChart("September was good.\n\n{{cha")).toEqual({ before: "September was good.", after: "" });
  });
});
