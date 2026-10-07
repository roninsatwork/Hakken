import { internal } from "./_generated/api";
import type { ToolHandlerExecutionInput } from "./aiToolExecutionService";
import { shiftDay } from "./searchConsoleDays";
import { CHART_MARK, chartPoints, type AnswerChart, type ChartMeasure } from "./utils/assistantCharts";

/**
 * The Assistant's chart (docs/plans/active/hakken-tasks-plan.md, item 2.1),
 * registered with the rest in `aiToolExecutionService.ts`: `show_chart` names
 * the look-up and the measure, and gets back the chart drawn under its answer
 * — a website's or a page's visitors or impressions each day, against as
 * many days before — from the figures the look-up reads, never from the
 * model. A read: it changes nothing, and any member may ask for one.
 */

const NO_COMPANY = { ok: false, problem: "This conversation belongs to no company, so there are no figures to chart here." };

/** The look-ups a chart can draw from: Search Console's days, for now. */
const LOOKUPS = new Set(["search_console"]);

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function text(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Search Console's own periods: the nearest of 7, 30 and 90 days. */
function period(value: unknown): 7 | 30 | 90 {
  const days = typeof value === "number" && Number.isFinite(value) ? value : 30;
  return days <= 14 ? 7 : days <= 60 ? 30 : 90;
}

type Range = { from: string; to: string; beforeFrom: string; beforeTo: string };

/** The days drawn: a calendar month and the month before it, or the newest 7, 30 or 90 days and as many before. */
function rangeOf(args: Record<string, unknown>, newestDay: string): Range | { problem: string } {
  const month = text(args, "month");
  if (month) {
    if (!MONTH.test(month)) return { problem: "Say the month as YYYY-MM, for example 2026-09." };
    const from = `${month}-01`;
    if (from > newestDay) return { problem: `Search Console has no figures for ${month} yet: its newest day is ${newestDay}.` };
    const lastOfMonth = shiftDay(`${shiftDay(`${month}-28`, 4).slice(0, 7)}-01`, -1);
    const beforeTo = shiftDay(from, -1);
    return { from, to: lastOfMonth < newestDay ? lastOfMonth : newestDay, beforeFrom: `${beforeTo.slice(0, 7)}-01`, beforeTo };
  }
  const days = period(args.days);
  const from = shiftDay(newestDay, -(days - 1));
  return { from, to: newestDay, beforeFrom: shiftDay(from, -days), beforeTo: shiftDay(from, -1) };
}

const valueOf = (measure: ChartMeasure) => (day: { day: string; clicks: number; impressions: number }) => ({
  day: day.day,
  value: measure === "visitors" ? day.clicks : day.impressions,
});

const sum = (days: Array<{ value: number }>) => days.reduce((total, day) => total + day.value, 0);

export const ASSISTANT_CHART_HANDLERS: Record<string, (input: ToolHandlerExecutionInput) => Promise<unknown>> = {
  "assistant.chart": async (input) => {
    if (!input.companyId) return NO_COMPANY;
    if (!LOOKUPS.has(text(input.args, "lookup") ?? "search_console")) {
      return { ok: false, problem: "Charts draw Search Console's visitors and impressions for now: lookup is search_console." };
    }
    const website = text(input.args, "website");
    if (!website) return { ok: false, problem: "Say which of the company's websites to chart." };
    const measure = (text(input.args, "measure") ?? "visitors") as ChartMeasure;
    if (measure !== "visitors" && measure !== "impressions") {
      return { ok: false, problem: "A chart shows visitors from Google, or how often it showed up in Google (impressions)." };
    }
    const page = text(input.args, "page");

    const resolved = await input.ctx.runQuery(internal.hakkenTaskFigures.resolveTargetInternal, {
      companyId: input.companyId, website, ...(page ? { page } : {}),
    });
    if (!resolved.ok) return { ok: false, problem: resolved.problem };
    const range = rangeOf(input.args, resolved.newestDay);
    if ("problem" in range) return { ok: false, problem: range.problem };

    // The days before are drawn only where Search Console's history reaches.
    const heldFrom = resolved.oldestDay;
    const beforeHeld = !heldFrom || range.beforeTo >= heldFrom;
    const [now, before] = await Promise.all([
      input.ctx.runAction(internal.hakkenTaskFigures.targetDaysInternal, { companyId: input.companyId, target: resolved.target, from: range.from, to: range.to }),
      beforeHeld
        ? input.ctx.runAction(internal.hakkenTaskFigures.targetDaysInternal, {
            companyId: input.companyId, target: resolved.target, from: heldFrom && range.beforeFrom < heldFrom ? heldFrom : range.beforeFrom, to: range.beforeTo,
          })
        : Promise.resolve({ ok: true as const, days: [] }),
    ]);
    if (!now.ok) return { ok: false, problem: now.problem };
    const days = now.days.map(valueOf(measure));
    const earlier = beforeHeld && before.ok ? before.days.map(valueOf(measure)) : null;
    const link = `/app/search-console/${resolved.target.companyWebsiteId}${resolved.target.page ? "/pages" : ""}`;

    const chart: AnswerChart = {
      look: "searchConsoleDays",
      measure,
      website: resolved.target.website,
      ...(resolved.target.page ? { page: resolved.target.page } : {}),
      ...range,
      points: chartPoints(days, earlier, { ...range, ...(heldFrom ? { heldFrom } : {}) }),
      link,
    };
    return {
      ok: true,
      website: resolved.target.website,
      ...(resolved.target.page ? { page: resolved.target.page } : {}),
      measure: measure === "visitors" ? "visitors from Google (Search Console clicks)" : "times shown in Google (impressions)",
      from: range.from,
      to: range.to,
      total: sum(days),
      ...(earlier ? { theDaysBefore: { from: range.beforeFrom, to: range.beforeTo, total: sum(earlier) } } : {}),
      link,
      note: `The chart is drawn under your answer from these figures, with a link to the screen. Write ${CHART_MARK} on a line of its own where it belongs, after the sentences it illustrates; don't list the days or describe the chart.`,
      chart,
    };
  },
};
