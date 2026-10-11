import { internal } from "./_generated/api";
import type { ToolHandlerExecutionInput } from "./aiToolExecutionService";
import { ANALYTICS_SCREENS } from "./utils/analyticsScreens";

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

/** Search Console is read over its ready-made periods only: 7, 30 or 90 days, the nearest asked for. */
function nearestPeriod(days: number | undefined): 7 | 30 | 90 {
  if (days === undefined || days <= 7) return 7;
  return days <= 30 ? 30 : 90;
}

/** Google Analytics is read over its ready-made periods: 7, 30 or 90 days, or 12 months, the nearest asked for. */
function analyticsPeriod(days: number | undefined): 7 | 30 | 90 | 365 {
  if (days === undefined || days <= 7) return 7;
  return days <= 30 ? 30 : days <= 90 ? 90 : 365;
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
      days: nearestPeriod(numberArg(input.args, "days")),
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
      days: analyticsPeriod(numberArg(input.args, "days")),
      ...(device === "desktop" || device === "mobile" || device === "tablet" ? { device } : {}),
      ...(country ? { country: country.toLowerCase() } : {}),
      ...(key ? { key } : {}),
      ...(search ? { search } : {}),
      ...(list === "visitorType" || list === "browser" || list === "system" || list === "age" || list === "gender" || list === "interest" ? { list } : {}),
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
