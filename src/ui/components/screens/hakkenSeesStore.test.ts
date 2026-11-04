import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { closeSees, noteSeesThread, resetSees, seesCharts, toggleSees, useSeesChart, useSeesThread, withSeesParts } from "./hakkenSeesStore";

/**
 * The eye's panel and its conversation (ask-hakken-every-chart-plan-2026-10-31.md, §2b; Anthony: "every time we press
 * the eye it should open a new chat thread"): the conversation lasts while the panel is open, and each press starts
 * a new one.
 */
describe("the eye's panel conversation", () => {
  afterEach(() => resetSees());

  it("keeps its conversation while open, and starts a new one at the next press", () => {
    const { result } = renderHook(() => useSeesThread("googleAnalytics.conversions|lastMonth"));
    act(() => toggleSees());
    act(() => noteSeesThread("googleAnalytics.conversions|lastMonth", "threads_1"));
    expect(result.current).toBe("threads_1");
    act(() => closeSees());
    // Closed, it is still the one asked in; pressed again, the panel opens empty.
    expect(result.current).toBe("threads_1");
    act(() => toggleSees());
    expect(result.current).toBeNull();
  });
});

/** A panel's own figures join its page's (sees-every-page-plan-2026-10-31.md, phase 4's gaps). */
describe("a page's figures with its panels' own", () => {
  const table = { rows: [{ key: "Direct", visits: 40 }] };

  it("sit beside the page's answer's parts, or beside a list as `page`", () => {
    expect(withSeesParts({ figures: { visits: 3 } }, { channelsTable: table })).toEqual({ figures: { visits: 3 }, channelsTable: table });
    expect(withSeesParts([{ key: "a" }], { channelsTable: table })).toEqual({ page: [{ key: "a" }], channelsTable: table });
  });

  it("leave a page as it is with no panels, and a page that handed over nothing with nothing", () => {
    const answer = { figures: { visits: 3 } };
    expect(withSeesParts(answer, {})).toBe(answer);
    expect(withSeesParts(undefined, { channelsTable: table })).toBeUndefined();
  });
});

/** Every chart on the page registers what it draws, for Ask Hakken to redraw (ask-hakken-every-chart-page-plan-2026-11-03.md). */
describe("the page's charts", () => {
  afterEach(() => resetSees());

  it("are held in the order first drawn, each with its latest figures, and let go as they leave", () => {
    const first = renderHook(({ figures }) => useSeesChart("a", { title: "Visits by day", csv: () => figures }), { initialProps: { figures: "Day,Visits\n2026-10-01,5" } });
    renderHook(() => useSeesChart("b", { title: "Visits by channel", csv: () => "Channel,Visits\nDirect,4" }));
    first.rerender({ figures: "Day,Visits\n2026-10-01,6" });
    expect(seesCharts().map((chart) => [chart.title, chart.csv()])).toEqual([["Visits by day", "Day,Visits\n2026-10-01,6"], ["Visits by channel", "Channel,Visits\nDirect,4"]]);
    first.unmount();
    expect(seesCharts().map((chart) => chart.title)).toEqual(["Visits by channel"]);
  });
});
