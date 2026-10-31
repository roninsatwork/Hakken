import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { readChart, readPeriodBeforeChart } from "./googleAnalyticsChartReads";
import { chargeTaskWork } from "./hakkenTaskCredits";
import { queueOutboxMessage } from "./outbox";
import { ensureReaderPreferences } from "./readerPreferences";
import { emailWording } from "./utils/emailWording";
import { mainConversionAt } from "./utils/assistantCharts";
import { chartReportFigures, type ChartReportSpec } from "./utils/hakkenChartReport";
import { dayIn } from "./utils/hakkenTaskTiming";

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
  const reader = { db: ctx.db, companyId: task.companyId };
  const common = { siteId: target.companyWebsiteId, period: report.period as never, device: "" };
  const read = await readChart(reader, common).catch(() => null);
  if (!read || read.points.length === 0) return "NOTHING_YET";
  // A rate is always of one conversion: the one it names, else the page's own (a shop's purchase, else the biggest).
  const eventAt = report.event ? read.events.indexOf(report.event) : report.measure === "conversionRate" ? mainConversionAt(read.events, read.points) : null;
  // The conversion it was about is no longer counted: nothing true to send.
  if (eventAt === -1) return "GONE";
  const before = await readPeriodBeforeChart(reader, common).catch(() => null);
  const figures = chartReportFigures(read.points, before?.held ? before.points : null, report.measure, eventAt);

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
      title: words.bellTitle({ title: words.title({ measure: report.measure, ...(report.event ? { event: report.event } : {}) }) }),
      body: words.bellBody({ figure, figureIs: words.figureIs({ measure: report.measure }) }),
      href: link,
    });
  }
  // Sent once: it stops, and stays on the Hakken tasks page as paused, so it can be read back or set again.
  if (report.every === "once") await ctx.db.patch(task._id, { state: "PAUSED", updatedAt: now });
  return "SENT";
}
