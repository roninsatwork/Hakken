import { internal } from "./_generated/api";
import type { ToolHandlerExecutionInput } from "./aiToolExecutionService";

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
  "assistant.tasks.open": async (input) => {
    if (!input.companyId) return NO_COMPANY_FIGURES;
    return await input.ctx.runQuery(internal.assistantReads.openTasksInternal, { companyId: input.companyId });
  },
};
