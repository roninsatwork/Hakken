import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { EYE_BUILDERS, EYE_OWN_FINDINGS } from "./chatAppEyes";
import { analyticsPartsOf } from "./utils/analyticsScreens";
import { findingWords } from "./utils/sees/findings";
import { pageDataFor, pageFigureLines } from "./utils/sees/pageData";
import { pageFindings } from "./utils/sees/pageFindings";
import type { CalendarPeriod } from "./utils/calendarPeriods";
import {
  CHAT_APP_SECTIONS,
  type ChatAppSection,
  FINDINGS_SCREENS,
  type FindingsScreen,
  MAIN_SCREENS,
  ROWS_PER_ANSWER,
  SECTION_NAMES,
  TOOL_NAMES,
  TOP_LISTS,
  type TopList,
  datesOf,
  quoted,
  sectionOfScreen,
} from "./utils/chatAppMcp";

/**
 * Ask Hakken in ChatGPT and Claude: the five tools
 * (docs/plans/active/ask-hakken-from-ai-chat-apps-plan-2026-11-21.md, phase 3).
 * Each is a thin layer over the reads Ask Hakken already makes for a company
 * (`assistantReads.ts`, `assistant*Reads.ts`), which read through the screens'
 * own reads: the same figures as the screens, saved data only, nothing asked of
 * Google, Bing or Microsoft. The company is always the pass's, never one the app
 * names, and a section switched off for the company says so rather than answer.
 *
 * Plain functions run inside the door's HTTP action (`chatAppDoor.ts`), not
 * Convex functions of their own: each read below is an internal query, called
 * with the pass's company.
 */

type Runner = Pick<ActionCtx, "runQuery">;
type Who = { companyId: Id<"companies">; origin: string; platformName: string };
type Read = Record<string, unknown> & { ok?: boolean; problem?: string };

/** What a tool sends back, and what the door writes in the log. */
export type ToolOutcome = {
  answer: Record<string, unknown>;
  isError: boolean;
  website?: string;
  period?: CalendarPeriod;
  /** The screen or list asked for, for the log. */
  detail?: string;
  reason?: string;
};

/** Findings an answer carries at most, the biggest first, as the eye ranks them. */
const MOST_FINDINGS = 8;

/**
 * What a screen's eye shows for the dates: its figure lines and its own findings, worked out by the eye's code over
 * the figures the screen hands its eye, built on the server the way the screen builds them (`chatAppEyes`). Null when
 * the screen has no builder yet; a problem when it would show nothing for these dates.
 */
async function eyeOf(ctx: Runner, who: Who, screen: string, website: string, period: CalendarPeriod, key?: string): Promise<{ figures: string[]; findings: string[] } | { problem: string } | null> {
  const build = EYE_BUILDERS[screen];
  if (!build) return null;
  try {
    const siteId = await ctx.runQuery(internal.chatAppEyeReads.siteForWebsiteInternal, { companyId: who.companyId, website });
    if (!siteId) return { problem: `${quoted(website, 80)} isn't one of this company's websites. Ask your_websites for them.` };
    const run = (read: string, args: Record<string, unknown>) => ctx.runQuery(internal.chatAppEyeReads.eyeReadInternal, { companyId: who.companyId, read, args });
    const ask = { siteId, period, ...(key ? { key } : {}) };
    const data = await build(run, ask);
    const figures = data === null || data === undefined ? null : pageDataFor(data, screen);
    if (figures === null) return { problem: "There are no figures on this screen for these dates yet." };
    const own = (await EYE_OWN_FINDINGS[screen]?.(run, ask)) ?? null;
    return { figures: pageFigureLines(screen, figures), findings: (own ?? pageFindings(screen, figures)).slice(0, MOST_FINDINGS).map(findingWords) };
  } catch {
    return { problem: "That screen couldn't be read just now. Try again in a moment." };
  }
}

/** Lists a chart needs whole: every day of the period. Every other list is cut to the lean table's rows. */
const KEEP_WHOLE = new Set(["days", "points", "series", "byDay"]);

/**
 * An answer made small and safe to hand on: lists cut to ten rows, a screen's
 * address made whole so the app can link to it, and text from other websites
 * (a page's title, a search term) cut short.
 */
export function lean(value: unknown, origin: string, key = ""): unknown {
  if (Array.isArray(value)) {
    const rows = KEEP_WHOLE.has(key) ? value : value.slice(0, ROWS_PER_ANSWER);
    return rows.map((row) => lean(row, origin));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([field, inner]) => [field, lean(inner, origin, field)]));
  }
  if (typeof value === "string") {
    if (key === "link" && value.startsWith("/")) return `${origin}${value}`;
    if (key === "name" || key === "label" || key === "title") return quoted(value);
  }
  return value;
}

/**
 * A section's headline for the summary: its figures and boxes without its lists, which top_of_list and
 * screen_findings give. Keeps a summary of five sections small enough to read at a glance.
 */
export function headline(value: unknown): unknown {
  if (Array.isArray(value)) return undefined;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([field, inner]) => {
      const kept = headline(inner);
      return kept === undefined ? [] : [[field, kept]];
    }));
  }
  return value;
}

function text(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === "string" ? value.trim().slice(0, 300) : "";
}

async function sectionsOn(ctx: Runner, companyId: Id<"companies">): Promise<Set<string>> {
  return new Set(await ctx.runQuery(internal.featureSwitches.menuFeaturesForCompanyInternal, { companyId }));
}

const switchedOff = (section: ChatAppSection): Read => ({ ok: false, problem: `${SECTION_NAMES[section]} is switched off for this company, so there are no figures to read.` });

/** One screen's figures, through Ask Hakken's read of it. A read that fails says so, and the other sections still answer. */
async function readScreen(ctx: Runner, companyId: Id<"companies">, section: ChatAppSection, screen: string, website: string, period: CalendarPeriod, extra: Record<string, string> = {}): Promise<Read> {
  try {
    if (section === "searchConsole") {
      return await ctx.runQuery(internal.assistantSearchConsoleReads.searchConsoleScreenInternal, { companyId, website, screen: screen as never, period, ...extra }) as Read;
    }
    if (section === "googleAnalytics") {
      const asked = { companyId, website, screen: screen as never, period, ...extra };
      const answer = await ctx.runQuery(internal.assistantAnalyticsReads.googleAnalyticsInternal, asked) as Read;
      const parts = analyticsPartsOf(screen);
      if (parts.length === 0 || !answer.ok) return answer;
      const found = typeof answer.pageKey === "string" ? { key: answer.pageKey } : {};
      const more = await Promise.all(parts.map((part) => ctx.runQuery(internal.assistantAnalyticsReads.googleAnalyticsInternal, { ...asked, ...found, part } as never)));
      return Object.assign({}, answer, ...more) as Read;
    }
    if (section === "bingWebmaster") {
      return await ctx.runQuery(internal.assistantBingReads.bingWebmasterInternal, { companyId, website, screen: screen as never, period, ...extra }) as Read;
    }
    if (section === "visibility") {
      return await ctx.runQuery(internal.assistantVisibilityReads.visibilityScreenInternal, { companyId, website, screen: screen as never, period }) as Read;
    }
    return { ok: false, problem: "Microsoft Clarity's figures can't be read from a chat app yet. Open the Microsoft Clarity screen to see them." };
  } catch {
    return { ok: false, problem: `${SECTION_NAMES[section]} couldn't be read just now. Try again in a moment.` };
  }
}

/**
 * The chart drawn in the chat: Google Analytics' visits each day against the dates before, where the company has
 * them. The headline figures come from the Overview screen's own read, so the chart's total is the screen's.
 */
async function visitsChart(ctx: Runner, who: Who, website: string, period: CalendarPeriod, overview: Read | null) {
  const companyId = who.companyId;
  try {
    const chart = await ctx.runQuery(internal.assistantAnalyticsCharts.analyticsChartInternal, { companyId, website, period });
    if (!chart.ok) return null;
    const points = (chart.points as Array<{ day: string; visits: number }>).map((point) => ({ day: point.day, value: point.visits }));
    const beforePoints = ((chart.before as { points?: Array<{ day: string; visits: number }> } | null)?.points ?? []).map((point) => ({ day: point.day, value: point.visits }));
    const whole = overview?.ok !== false ? (overview?.wholeWebsite as { visits?: number; visitsBefore?: number } | undefined) : undefined;
    return {
      title: "Visits each day",
      website: chart.host,
      points,
      before: beforePoints,
      ...(typeof whole?.visits === "number" ? { total: whole.visits } : {}),
      ...(typeof whole?.visitsBefore === "number" ? { totalBefore: whole.visitsBefore } : {}),
      ...(typeof overview?.link === "string" ? { link: lean(overview.link, who.origin, "link") } : {}),
    };
  } catch {
    return null;
  }
}

async function listWebsites(ctx: Runner, who: Who): Promise<ToolOutcome> {
  const read = await ctx.runQuery(internal.assistantReads.websitesInternal, { companyId: who.companyId }) as Read;
  const on = await sectionsOn(ctx, who.companyId);
  return {
    answer: {
      websites: lean(read.websites ?? [], who.origin),
      sections: CHAT_APP_SECTIONS.map((section) => ({ section: SECTION_NAMES[section], switchedOn: on.has(section) })),
    },
    isError: false,
  };
}

async function websiteSummary(ctx: Runner, who: Who, args: Record<string, unknown>): Promise<ToolOutcome> {
  const website = text(args, "website");
  const period = datesOf(args);
  if (!website) return { answer: { problem: "Say which website, as your_websites lists it." }, isError: true, period };
  const on = await sectionsOn(ctx, who.companyId);
  const sections = [];
  let overview: Read | null = null;
  for (const section of CHAT_APP_SECTIONS) {
    const { screen } = FINDINGS_SCREENS[MAIN_SCREENS[section]];
    const read = on.has(section) ? await readScreen(ctx, who.companyId, section, screen, website, period) : switchedOff(section);
    if (section === "googleAnalytics") overview = read;
    // The main screen's eye: its findings always, and its figure lines where Ask Hakken has no read of the section.
    const eye = on.has(section) ? await eyeOf(ctx, who, MAIN_SCREENS[section], website, period) : null;
    const seen = eye && "findings" in eye ? eye : null;
    const headlineOf = read.ok !== false || !seen ? (lean(headline(read), who.origin) as Record<string, unknown>) : { figures: seen.figures };
    sections.push({ section: SECTION_NAMES[section], ...(seen ? { findings: seen.findings } : {}), ...headlineOf });
  }
  const chart = on.has("googleAnalytics") ? await visitsChart(ctx, who, website, period, overview) : null;
  return { answer: { website, dates: period, sections, ...(chart ? { chart } : {}) }, isError: false, website, period };
}

async function screenFindings(ctx: Runner, who: Who, args: Record<string, unknown>): Promise<ToolOutcome> {
  const website = text(args, "website");
  const period = datesOf(args);
  const asked = text(args, "screen");
  const key = text(args, "key");
  const known = FINDINGS_SCREENS[asked as FindingsScreen];
  const section = known?.section ?? sectionOfScreen(asked);
  if (!website || !section || (!known && !EYE_BUILDERS[asked])) {
    return { answer: { problem: "Say which website, and one of the screens the tool lists." }, isError: true, website, period, detail: asked || undefined };
  }
  const on = await sectionsOn(ctx, who.companyId);
  if (!on.has(section)) return { answer: { website, dates: period, section: SECTION_NAMES[section], ...switchedOff(section) }, isError: false, website, period, detail: asked, reason: "switchedOff" };
  const eye = await eyeOf(ctx, who, asked, website, period, key || undefined);
  const chart = asked === "googleAnalytics.overview" ? await visitsChart(ctx, who, website, period, null) : null;
  if (eye) {
    return {
      answer: { website, dates: period, section: SECTION_NAMES[section], screen: asked, ...(key ? { key: quoted(key) } : {}), ...eye, ...(chart ? { chart } : {}) },
      isError: false,
      website,
      period,
      detail: asked,
    };
  }
  // A screen with no builder yet answers with Ask Hakken's read of it, figures without findings.
  const read = known ? await readScreen(ctx, who.companyId, known.section, known.screen, website, period) : { ok: false, problem: "That screen can't be read from a chat app yet." };
  return {
    answer: { website, dates: period, section: SECTION_NAMES[section], screen: asked, ...(lean(read, who.origin) as Record<string, unknown>), ...(chart ? { chart } : {}) },
    isError: false,
    website,
    period,
    detail: asked,
  };
}

async function topOfList(ctx: Runner, who: Who, args: Record<string, unknown>): Promise<ToolOutcome> {
  const website = text(args, "website");
  const period = datesOf(args);
  const list = TOP_LISTS[text(args, "list") as TopList];
  const page = typeof args.page === "number" && Number.isInteger(args.page) && args.page >= 1 ? args.page : 1;
  if (!website || !list) return { answer: { problem: `Say which website, and one of these lists: ${Object.keys(TOP_LISTS).join(", ")}.` }, isError: true, website, period };
  const on = await sectionsOn(ctx, who.companyId);
  const read = on.has(list.section) ? await readScreen(ctx, who.companyId, list.section, list.screen, website, period) : switchedOff(list.section);
  if (read.ok === false) return { answer: { website, dates: period, list: list.name, problem: read.problem }, isError: false, website, period, detail: text(args, "list"), ...(!on.has(list.section) ? { reason: "switchedOff" } : {}) };
  const rows = Array.isArray(read.rows) ? read.rows : [];
  const total = [read.rowsListed, read.listed].find((count) => typeof count === "number") as number | undefined;
  const from = (page - 1) * ROWS_PER_ANSWER;
  const shown = rows.slice(from, from + ROWS_PER_ANSWER);
  return {
    answer: {
      website,
      dates: period,
      list: list.name,
      page,
      total: total ?? rows.length,
      rows: lean(shown, who.origin, "rows"),
      ...(from + ROWS_PER_ANSWER < rows.length ? { more: `Ask for page ${page + 1} to see the next ${ROWS_PER_ANSWER}.` } : rows.length < (total ?? 0) ? { more: `This answer holds the first ${rows.length}. Open the list's screen to see the rest.` } : {}),
      ...(typeof read.link === "string" ? { link: lean(read.link, who.origin, "link") } : {}),
      ...(typeof read.rule === "string" ? { rule: read.rule } : {}),
    },
    isError: false,
    website,
    period,
    detail: text(args, "list"),
  };
}

async function pageStory(ctx: Runner, who: Who, args: Record<string, unknown>): Promise<ToolOutcome> {
  const website = text(args, "website");
  const period = datesOf(args);
  const page = text(args, "page");
  if (!website || !page) return { answer: { problem: "Say which website, and the page's address or words from its title." }, isError: true, website, period };
  const on = await sectionsOn(ctx, who.companyId);
  const sections = [];
  if (on.has("searchConsole")) {
    try {
      const read = await ctx.runQuery(internal.assistantReads.searchConsoleInternal, { companyId: who.companyId, website, period, page }) as Read;
      sections.push({ section: SECTION_NAMES.searchConsole, ...(lean(read, who.origin) as Record<string, unknown>) });
    } catch {
      sections.push({ section: SECTION_NAMES.searchConsole, ok: false, problem: "Search Console couldn't be read just now." });
    }
  } else {
    sections.push({ section: SECTION_NAMES.searchConsole, ...switchedOff("searchConsole") });
  }
  const analytics = on.has("googleAnalytics") ? await readScreen(ctx, who.companyId, "googleAnalytics", "page", website, period, { key: page }) : switchedOff("googleAnalytics");
  sections.push({ section: SECTION_NAMES.googleAnalytics, ...(lean(analytics, who.origin) as Record<string, unknown>) });
  const bing = on.has("bingWebmaster") ? await readScreen(ctx, who.companyId, "bingWebmaster", "pages", website, period, { search: page }) : switchedOff("bingWebmaster");
  sections.push({ section: SECTION_NAMES.bingWebmaster, ...(lean(bing, who.origin) as Record<string, unknown>) });
  return { answer: { website, dates: period, page: quoted(page), sections }, isError: false, website, period };
}

/** Runs one tool for the pass's company. An unknown tool is the app's mistake, said as such. */
export async function runTool(ctx: Runner, who: Who, name: string, args: Record<string, unknown>): Promise<ToolOutcome> {
  if (!(TOOL_NAMES as readonly string[]).includes(name)) return { answer: { problem: `There's no tool called ${quoted(name, 60)}.` }, isError: true, reason: "unknownTool" };
  if (name === "your_websites") return await listWebsites(ctx, who);
  if (name === "website_summary") return await websiteSummary(ctx, who, args);
  if (name === "screen_findings") return await screenFindings(ctx, who, args);
  if (name === "top_of_list") return await topOfList(ctx, who, args);
  return await pageStory(ctx, who, args);
}
