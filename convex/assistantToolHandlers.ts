import { internal } from "./_generated/api";
import type { ToolHandlerExecutionInput } from "./aiToolExecutionService";
import { ANALYTICS_SCREENS } from "./utils/analyticsScreens";
import { BING_SCREENS } from "./utils/bingScreens";
import { OPENING_PERIOD, isCalendarPeriod, type CalendarPeriod } from "./utils/calendarPeriods";

/**
 * The Assistant's company-figure reads, as tool handlers
 * (docs/plans/active/assistant-foundation-plan.md, item 7), registered with
 * the rest in `aiToolExecutionService.ts`'s allowlist. Their own file only to
 * keep that one a size one can hold in mind.
 */

/** What the company-figure tools say in a conversation that belongs to no company. */
const NO_COMPANY_FIGURES = {
  ok: false,
  problem: "This conversation belongs to no company, so there are no company figures to read.",
};

/**
 * Search Console and Bing are read over the screens' calendar periods. A conversation set up before they came may
 * still ask in days: the nearest period stands in — last week, last month, last quarter or this year.
 */
function periodArg(args: Record<string, unknown>): CalendarPeriod {
  const period = optionalStringArg(args, "period");
  if (period && isCalendarPeriod(period)) return period;
  const days = numberArg(args, "days");
  if (days === undefined) return OPENING_PERIOD;
  return days <= 7 ? "lastWeek" : days <= 31 ? "lastMonth" : days <= 92 ? "lastQuarter" : "thisYear";
}


function stringArg(args: Record<string, unknown>, key: string) {
  const value = args[key];
  return typeof value === "string" ? value.trim() : "";
}

function optionalStringArg(args: Record<string, unknown>, key: string) {
  const value = args[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function numberArg(args: Record<string, unknown>, key: string) {
  const value = args[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export const ASSISTANT_FIGURE_HANDLERS: Record<string, (input: ToolHandlerExecutionInput) => Promise<unknown>> = {
  /**
   * The company's own figures (docs/plans/active/assistant-foundation-plan.md,
   * item 7): its websites, a website's overview, its Search Console figures,
   * its AI answers, its open tasks. Each reads through the function its screen
   * reads through (`assistantReads.ts`), for the conversation's company — the
   * run's, never one the model names — and a conversation with no company has
   * no company figures, which the answer says rather than failing.
   */
  "assistant.websites": async (input) => {
    if (!input.companyId) return NO_COMPANY_FIGURES;
    return await input.ctx.runQuery(internal.assistantReads.websitesInternal, { companyId: input.companyId });
  },
  "assistant.site.overview": async (input) => {
    if (!input.companyId) return NO_COMPANY_FIGURES;
    return await input.ctx.runQuery(internal.assistantReads.siteOverviewInternal, {
      companyId: input.companyId,
      website: stringArg(input.args, "website"),
    });
  },
  "assistant.searchConsole": async (input) => {
    if (!input.companyId) return NO_COMPANY_FIGURES;
    const page = optionalStringArg(input.args, "page");
    return await input.ctx.runQuery(internal.assistantReads.searchConsoleInternal, {
      companyId: input.companyId,
      website: stringArg(input.args, "website"),
      period: periodArg(input.args),
      ...(page ? { page } : {}),
    });
  },
  "assistant.ai.mentions": async (input) => {
    if (!input.companyId) return NO_COMPANY_FIGURES;
    const question = optionalStringArg(input.args, "question");
    return await input.ctx.runQuery(internal.assistantReads.aiMentionsInternal, {
      companyId: input.companyId,
      website: stringArg(input.args, "website"),
      ...(question ? { question } : {}),
    });
  },
  /** Insights' findings, as written (insights-analyst-plan.md I14, phase 16). */
  "assistant.insights.read": async (input) => {
    if (!input.companyId) return NO_COMPANY_FIGURES;
    return await input.ctx.runQuery(internal.assistantReads.insightsInternal, { companyId: input.companyId, website: stringArg(input.args, "website") });
  },
  "assistant.advice.read": async (input) => {
    if (!input.companyId) return NO_COMPANY_FIGURES;
    return await input.ctx.runQuery(internal.assistantReads.adviceInternal, {
      companyId: input.companyId,
      website: stringArg(input.args, "website"),
    });
  },
  /**
   * Every Google Analytics screen of the company's own websites, and Live
   * (docs/plans/active/google-analytics-plan.md §18.6.8): read through the
   * screens' own reads (`assistantAnalyticsReads.ts`).
   */
  "assistant.googleAnalytics": async (input) => {
    if (!input.companyId) return NO_COMPANY_FIGURES;
    const screen = stringArg(input.args, "screen");
    if (!(ANALYTICS_SCREENS as readonly string[]).includes(screen)) {
      return { ok: false, problem: `screen must be one of: ${ANALYTICS_SCREENS.join(", ")}.` };
    }
    const device = optionalStringArg(input.args, "device");
    const list = optionalStringArg(input.args, "list");
    const country = optionalStringArg(input.args, "country");
    const key = optionalStringArg(input.args, "key");
    const search = optionalStringArg(input.args, "search");
    return await input.ctx.runQuery(internal.assistantAnalyticsReads.googleAnalyticsInternal, {
      companyId: input.companyId,
      website: stringArg(input.args, "website"),
      screen: screen as (typeof ANALYTICS_SCREENS)[number],
      period: periodArg(input.args),
      ...(device === "desktop" || device === "mobile" || device === "tablet" ? { device } : {}),
      ...(country ? { country: country.toLowerCase() } : {}),
      ...(key ? { key } : {}),
      ...(search ? { search } : {}),
      ...(list === "visitorType" || list === "browser" || list === "system" || list === "age" || list === "gender" || list === "interest" ? { list } : {}),
    });
  },
  /** Every Bing Webmaster screen (bing-webmaster-plan.md BW13), through the screens' own reads (`assistantBingReads.ts`). */
  "assistant.bingWebmaster": async (input) => {
    if (!input.companyId) return NO_COMPANY_FIGURES;
    const screen = stringArg(input.args, "screen");
    if (!(BING_SCREENS as readonly string[]).includes(screen)) {
      return { ok: false, problem: `screen must be one of: ${BING_SCREENS.join(", ")}.` };
    }
    const search = optionalStringArg(input.args, "search");
    return await input.ctx.runQuery(internal.assistantBingReads.bingWebmasterInternal, {
      companyId: input.companyId,
      website: stringArg(input.args, "website"),
      screen: screen as (typeof BING_SCREENS)[number],
      period: periodArg(input.args),
      ...(search ? { search } : {}),
    });
  },
  "assistant.googleAnalytics.live": async (input) => {
    if (!input.companyId) return NO_COMPANY_FIGURES;
    const device = optionalStringArg(input.args, "device");
    const list = optionalStringArg(input.args, "list");
    return await input.ctx.runAction(internal.assistantAnalyticsReads.googleAnalyticsLiveInternal, {
      companyId: input.companyId,
      website: stringArg(input.args, "website"),
      ...(device === "desktop" || device === "mobile" || device === "tablet" ? { device } : {}),
      ...(list === "pages" || list === "places" || list === "devices" || list === "events" ? { list } : {}),
    });
  },
  "assistant.tasks.open": async (input) => {
    if (!input.companyId) return NO_COMPANY_FIGURES;
    return await input.ctx.runQuery(internal.assistantReads.openTasksInternal, { companyId: input.companyId });
  },
};
