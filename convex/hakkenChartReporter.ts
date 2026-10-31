import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { readChart, readPeriodBeforeChart } from "./googleAnalyticsChartReads";
import { chargeTaskWork } from "./hakkenTaskCredits";
import { queueOutboxMessage } from "./outbox";
import { ensureReaderPreferences } from "./readerPreferences";
import { emailWording } from "./utils/emailWording";
import { mainConversionAt, type AnalyticsChartMeasure } from "./utils/assistantCharts";
import { chartReportFigures, type ChartReportSpec } from "./utils/hakkenChartReport";
import { dayIn } from "./utils/hakkenTaskTiming";
import { groupsChartOf } from "./assistantGroupChartReads";
import { isCalendarPeriod } from "./utils/calendarPeriods";
import { EVERY_OTHER, groupsAreShares, sourceOfLook, type GroupsChart } from "./utils/assistantGroupCharts";

/**
 * A chart sent at a time (sees-side-panel-plan-2026-10-31.md, phase 5; Anthony: "send me a chart at 10am tomorrow
 * with my new conversion rates … this is handle tasks"), sent by the Stat Report Agent beside its weekly pages
 * reports (`hakkenStatReporter.sendReportInternal`): Google Analytics' days over the chart's period, read through
 * the very reads Conversions' chart makes, worked out in code — to its owner by email (the bars as a picture),
 * the bell, as their channels say. Counted once for its day at the reports' price. A chart sent once stops once
 * sent; a weekly one waits for next week. Saved data only: nothing is asked of Google.
 */
export async function sendChartReport(
  ctx: MutationCtx,
  task: Doc<"hakkenTasks">,
  report: ChartReportSpec,
  target: NonNullable<Doc<"hakkenTasks">["target"]>,
  now: number,
): Promise<"SENT" | "NOTHING_YET" | "GONE"> {
  if (report.kind && report.by) return await sendGroupsChartReport(ctx, task, { ...report, kind: report.kind, by: report.by }, target, now);
  // A line a day is always of Google Analytics' measures.
  const measure = report.measure as AnalyticsChartMeasure;
  const reader = { db: ctx.db, companyId: task.companyId };
  const common = { siteId: target.companyWebsiteId, period: report.period as never, device: "" };
  const read = await readChart(reader, common).catch(() => null);
  if (!read || read.points.length === 0) return "NOTHING_YET";
  // A rate is always of one conversion: the one it names, else the page's own (a shop's purchase, else the biggest).
  const eventAt = report.event ? read.events.indexOf(report.event) : measure === "conversionRate" ? mainConversionAt(read.events, read.points) : null;
  // The conversion it was about is no longer counted: nothing true to send.
  if (eventAt === -1) return "GONE";
  const before = await readPeriodBeforeChart(reader, common).catch(() => null);
  const figures = chartReportFigures(read.points, before?.held ? before.points : null, measure, eventAt);

  const owner = await ctx.db.get(task.userId);
  if (!owner) return "GONE";
  const preferences = await ensureReaderPreferences(ctx, owner._id);
  const language = preferences?.language ?? "en";
  const link = `/app/analytics/${target.companyWebsiteId}/conversions?period=${report.period}`;
  // Once a day at most, by the owner's own day: a weekly chart of last month is sent each week though its days stay.
  const sentOn = dayIn(now, task.timeZone);
  const seen = await ctx.db.query("hakkenTaskChecks").withIndex("by_task_day", (q) => q.eq("taskId", task._id).eq("day", sentOn)).first();
  if (!seen) {
    await ctx.db.insert("hakkenTaskChecks", { taskId: task._id, companyId: task.companyId, day: sentOn, value: figures.figure, met: true, streak: 0, alerted: true, checkedAt: now });
    await chargeTaskWork(ctx, {
      kind: "taskReports", runKey: `taskReports:${task._id}:${sentOn}`, companyId: task.companyId, userId: task.userId, how: "scheduled",
      companyWebsiteId: target.companyWebsiteId, detail: task.title,
    }, now);
  }
  if (task.channels.email && owner.email) {
    await queueOutboxMessage(ctx, {
      messageType: "TASK_REPORT",
      userId: owner._id,
      email: owner.email,
      language,
      payload: {
        taskId: task._id, look: "analyticsChart", website: target.website, measure: report.measure, ...(report.event ? { event: report.event } : {}),
        from: figures.from, to: figures.to, values: figures.values, figure: figures.figure, ...(figures.figureBefore !== undefined ? { figureBefore: figures.figureBefore } : {}),
        every: report.every, weekday: report.weekday, timeOfDay: task.timeOfDay, link,
      },
      idempotencyKey: `TASK_CHART:${task._id}:${sentOn}`,
    });
  }
  if (task.channels.bell && !seen) {
    const words = emailWording(language).taskChart;
    const figure = report.measure === "conversionRate"
      ? `${figures.figure.toLocaleString(emailWording(language).dateLocale, { maximumFractionDigits: 1 })}%`
      : Math.round(figures.figure).toLocaleString(emailWording(language).dateLocale);
    await ctx.scheduler.runAfter(0, internal.notifications.notifyUserInternal, {
      userId: owner._id,
      companyId: task.companyId,
      kind: "HAKKEN_TASK_REPORT",
      title: words.bellTitle({ title: words.title({ measure, ...(report.event ? { event: report.event } : {}) }) }),
      body: words.bellBody({ figure, figureIs: words.figureIs({ measure }) }),
      href: link,
    });
  }
  // Sent once: it stops, and stays on the Hakken tasks page as paused, so it can be read back or set again.
  if (report.every === "once") await ctx.db.patch(task._id, { state: "PAUSED", updatedAt: now });
  return "SENT";
}

/**
 * A chart of groups sent at a time (ask-hakken-every-chart-plan-2026-10-31.md, phase 3): the website's channels, kinds
 * of page, devices or countries over the period as of its day, from the Conversions map's own read, worked out as Ask
 * Hakken drew it — by email (each group a bar, with its name and figure written beside), and the bell. Counted and
 * stopped as a line a day is.
 */
async function sendGroupsChartReport(
  ctx: MutationCtx,
  task: Doc<"hakkenTasks">,
  report: ChartReportSpec & { kind: NonNullable<ChartReportSpec["kind"]>; by: NonNullable<ChartReportSpec["by"]> },
  target: NonNullable<Doc<"hakkenTasks">["target"]>,
  now: number,
): Promise<"SENT" | "NOTHING_YET" | "GONE"> {
  if (!isCalendarPeriod(report.period)) return "GONE";
  const built = await groupsChartOf({ db: ctx.db }, task.companyId, { _id: target.companyWebsiteId, host: target.website }, {
    kind: report.kind, by: report.by, measure: report.measure, ...(report.event ? { event: report.event } : {}), period: report.period, source: report.source ?? "analytics",
  }).catch(() => null);
  // The conversion it was about is no longer counted: nothing true to send. Anything else waits for its figures.
  if (!built) return "NOTHING_YET";
  if (!built.ok) return /is not one of the conversions/.test(built.problem) ? "GONE" : "NOTHING_YET";
  const chart: GroupsChart = built.chart;
  const link = chart.link;
  const top = chart.groups.find((group) => group.name !== EVERY_OTHER) ?? chart.groups[0];

  const owner = await ctx.db.get(task.userId);
  if (!owner) return "GONE";
  const preferences = await ensureReaderPreferences(ctx, owner._id);
  const language = preferences?.language ?? "en";
  const sentOn = dayIn(now, task.timeZone);
  const seen = await ctx.db.query("hakkenTaskChecks").withIndex("by_task_day", (q) => q.eq("taskId", task._id).eq("day", sentOn)).first();
  if (!seen) {
    await ctx.db.insert("hakkenTaskChecks", { taskId: task._id, companyId: task.companyId, day: sentOn, value: top.value, met: true, streak: 0, alerted: true, checkedAt: now });
    await chargeTaskWork(ctx, {
      kind: "taskReports", runKey: `taskReports:${task._id}:${sentOn}`, companyId: task.companyId, userId: task.userId, how: "scheduled",
      companyWebsiteId: target.companyWebsiteId, detail: task.title,
    }, now);
  }
  if (task.channels.email && owner.email) {
    await queueOutboxMessage(ctx, {
      messageType: "TASK_REPORT",
      userId: owner._id,
      email: owner.email,
      language,
      payload: {
        taskId: task._id, look: "analyticsGroups", source: sourceOfLook(chart.look), website: target.website, kind: chart.kind, by: chart.by, measure: chart.measure, ...(chart.event ? { event: chart.event } : {}),
        period: chart.period, ...(chart.asOf ? { asOf: chart.asOf } : {}), groups: chart.groups, ...(chart.rows ? { rows: chart.rows } : {}),
        every: report.every, weekday: report.weekday, timeOfDay: task.timeOfDay, link,
      },
      idempotencyKey: `TASK_CHART:${task._id}:${sentOn}`,
    });
  }
  if (task.channels.bell && !seen) {
    const words = emailWording(language).taskChart;
    // A grid's groups carry their visits or counts, whatever its squares hold.
    const rate = chart.kind !== "grid" && groupsAreShares(chart);
    const figure = rate ? `${top.value.toLocaleString(emailWording(language).dateLocale, { maximumFractionDigits: 1 })}%` : Math.round(top.value).toLocaleString(emailWording(language).dateLocale);
    await ctx.scheduler.runAfter(0, internal.notifications.notifyUserInternal, {
      userId: owner._id,
      companyId: task.companyId,
      kind: "HAKKEN_TASK_REPORT",
      title: words.bellTitle({ title: words.groupsTitle({ source: sourceOfLook(chart.look), kind: chart.kind, by: chart.by, measure: chart.measure, ...(chart.event ? { event: chart.event } : {}) }) }),
      body: `${words.groupsTop({ name: top.name === EVERY_OTHER ? words.everyOther : top.name })}: ${figure}.`,
      href: link,
    });
  }
  if (report.every === "once") await ctx.db.patch(task._id, { state: "PAUSED", updatedAt: now });
  return "SENT";
}
