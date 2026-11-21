import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import { holdFor } from "./assistantReads";
import { EYE_BUILDERS, EYE_OWN_FINDINGS, EYE_READS } from "./chatAppEyes";
import { calendarPeriodValidator } from "./utils/calendarPeriods";
import { findingWords } from "./utils/sees/findings";
import { pageDataFor, pageFigureLines } from "./utils/sees/pageData";
import { pageFindings } from "./utils/sees/pageFindings";
import { appError } from "./utils/appError";

/**
 * One of a screen's reads, for a chat app's question
 * (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md, Option B): the screen's own
 * reader helper, for the pass's company, in a query of its own so no screen's
 * reads run one query out of room. Every helper checks the website is the
 * company's, as the screens' queries do.
 */
export const eyeReadInternal = internalQuery({
  args: { companyId: v.id("companies"), read: v.string(), args: v.record(v.string(), v.any()) },
  handler: async (ctx, { companyId, read, args }) => {
    const reading = EYE_READS[read];
    if (!reading) throw appError("NOT_FOUND", `There's no read called ${read}.`);
    return (await reading({ db: ctx.db, companyId }, args)) ?? null;
  },
});

/** The website a chat app names, when it's one of the pass's company's own holds: its hold, for the screens' reads. */
export const siteForWebsiteInternal = internalQuery({
  args: { companyId: v.id("companies"), website: v.string() },
  handler: async (ctx, { companyId, website }) => {
    const found = await holdFor(ctx, companyId, website);
    return "held" in found && found.held ? found.held.hold._id : null;
  },
});

/**
 * A screen's eye, built on the server for one company's website, for checking a builder against saved data
 * (`npx convex run chatAppEyeReads:eyePreviewInternal`). Reads only what's saved: nothing is asked of Google.
 */
export const eyePreviewInternal = internalAction({
  args: { companyId: v.id("companies"), website: v.string(), screen: v.string(), period: calendarPeriodValidator, key: v.optional(v.string()) },
  handler: async (ctx, { companyId, website, screen, period, key }): Promise<{ figures: string[]; findings: string[] } | { problem: string }> => {
    const build = EYE_BUILDERS[screen];
    if (!build) return { problem: `No builder for ${screen} yet.` };
    const siteId = await ctx.runQuery(internal.chatAppEyeReads.siteForWebsiteInternal, { companyId, website });
    if (!siteId) return { problem: `${website} isn't one of this company's websites.` };
    const run = (read: string, args: Record<string, unknown>) => ctx.runQuery(internal.chatAppEyeReads.eyeReadInternal, { companyId, read, args });
    const ask = { siteId, period, ...(key ? { key } : {}) };
    const data = await build(run, ask);
    const figures = data === null || data === undefined ? null : pageDataFor(data, screen);
    if (figures === null) return { problem: "Nothing to show for these dates." };
    const own = (await EYE_OWN_FINDINGS[screen]?.(run, ask)) ?? null;
    return { figures: pageFigureLines(screen, figures), findings: (own ?? pageFindings(screen, figures)).map(findingWords) };
  },
});
