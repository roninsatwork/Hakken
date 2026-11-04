import { internal } from "./_generated/api";
import type { ToolHandlerExecutionInput } from "./aiToolExecutionService";
import { CHART_MARK } from "./utils/assistantCharts";
import { pageChartFrom } from "./utils/assistantPageCharts";

/**
 * Ask Hakken redraws a chart from the page its conversation started on (ask-hakken-every-chart-page-plan-2026-11-03.md,
 * shared work 9; the checklist's point 5: "the chat can redraw any of its charts another way"). The page's charts came
 * with the conversation from the eye's panel (`startedOn.charts`, each the figures its own download holds), so every
 * chart on every page can be redrawn — bars, a pie, a line, the top ten, against the period before — with no tool of
 * its own for each screen, and from the page's figures only, never the model's. A read: it changes nothing. The query
 * it reads by lives in `assistantPageCharts.ts`: a module the tool registry imports defines no function of its own.
 */

const NONE = { ok: false, problem: "This conversation didn't start from a page with charts, so there is none to redraw. Use show_chart instead." };

export const ASSISTANT_PAGE_CHART_HANDLERS: Record<string, (input: ToolHandlerExecutionInput) => Promise<unknown>> = {
  "assistant.pageChart": async (input) => {
    if (!input.companyId || !input.runId) return NONE;
    const page = await input.ctx.runQuery(internal.assistantPageCharts.pageChartsOfRunInternal, { runId: input.runId, companyId: input.companyId });
    if (!page || page.charts.length === 0) return NONE;
    const number = typeof input.args.chart === "number" ? input.args.chart : Number(input.args.chart);
    const table = Number.isInteger(number) ? page.charts[number - 1] : undefined;
    if (!table) return { ok: false, problem: `There is no chart ${String(input.args.chart)} on the page. Its charts: ${page.charts.map((chart, at) => `${at + 1}. ${chart.title}`).join("; ")}.` };
    const text = (key: string) => (typeof input.args[key] === "string" && (input.args[key] as string).trim() ? (input.args[key] as string).trim() : undefined);
    const top = typeof input.args.top === "number" ? input.args.top : undefined;
    const kind = text("kind");
    const measure = text("measure");
    const against = text("against");
    const drawn = pageChartFrom(table, { link: page.path, ...(kind ? { kind } : {}), ...(measure ? { measure } : {}), ...(against ? { against } : {}), ...(top ? { top } : {}) });
    if (!drawn.ok) return drawn;
    // The figures for its words, as the chart draws them.
    return {
      ok: true, chart: drawn.chart, figures: drawn.chart.groups,
      note: `The chart is drawn under your answer from these figures, with a link to the page. Write ${CHART_MARK} on a line of its own where it belongs, after the sentences it illustrates; don't list the figures in a table or describe the chart.`,
    };
  },
};
