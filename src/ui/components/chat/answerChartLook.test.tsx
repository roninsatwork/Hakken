import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { describe, expect, it, vi } from "vitest";
import type { AnswerChart as Chart } from "@/convex/utils/assistantCharts";
import { expectApprovedLook } from "@/src/test/lookOutline";
import { AnswerChart } from "./AnswerChart";

/**
 * Ask Hakken's charts hold to the look Anthony signed off on the canvas "Ask Hakken, every kind of chart"
 * (ask-hakken-every-chart-plan-2026-10-31.md, board 1; https://claude.ai/artifact/DMCDEfYqSVr7y63viu1wRe): a line,
 * bars, stacked bars, the pie — the one part new to the screen kit, its ring beside its legend — a scatter and a grid,
 * each titled and drawn by the app's own parts, on morehandles.co.uk's September figures as drawn. The outline is
 * saved beside the plan in docs/plans/assets/ask-hakken-every-chart/look/.
 */

vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());

const groups = (chart: Record<string, unknown>) => ({
  look: "analyticsGroups", by: "channel", website: "morehandles.co.uk", period: "lastMonth", link: "/app/analytics/site/conversions?period=lastMonth", ...chart,
}) as Chart;

const BOARD: Chart[] = [
  {
    look: "analyticsDays", measure: "visits", website: "morehandles.co.uk", from: "2026-09-01", to: "2026-09-30", beforeFrom: "2026-08-01", beforeTo: "2026-08-31",
    points: [{ day: "2026-09-01", value: 1180, before: 1210 }, { day: "2026-09-02", value: 1244, before: 1190 }], link: "/app/analytics/site/conversions?period=lastMonth",
  } as Chart,
  groups({ kind: "bars", measure: "visits", groups: [{ name: "Organic Search", value: 12809, before: 13382 }, { name: "Cross-network", value: 10720, before: 9020 }] }),
  groups({ kind: "stacked", measure: "visits", groups: [{ name: "Organic Search", value: 34.9, before: 38.6 }, { name: "*", value: 65.1, before: 61.4 }] }),
  groups({ kind: "pie", by: "device", measure: "visits", groups: [{ name: "mobile", value: 56.5 }, { name: "desktop", value: 40.9 }, { name: "tablet", value: 2.6 }] }),
  groups({ kind: "scatter", by: "kind", measure: "conversionRate", event: "purchase", groups: [{ name: "Brand", value: 5.7, visits: 3517 }, { name: "Blog", value: 0.4, visits: 2027 }] }),
  groups({ kind: "grid", by: "kind", measure: "conversionRate", event: "purchase", groups: [{ name: "Brand", value: 3517 }, { name: "Blog", value: 2027 }], rows: [{ event: "purchase", values: [5.7, 0.4] }] }),
];

describe("Ask Hakken's charts, as signed off", () => {
  it("every kind titled and drawn by the app's own parts; the pie a ring beside its legend", async () => {
    const { container } = render(<div>{BOARD.map((chart, at) => <AnswerChart key={at} chart={chart} />)}</div>);
    // The ring is drawn, not only its legend: the drawing kit's static page could not show it (the plan's audit).
    expect(container.querySelector('[data-part="pie-ring"] svg')).not.toBeNull();
    await expectApprovedLook(container, "ask-hakken-every-chart", "Main", "Ask Hakken's charts");
  });
});
