import type { FunctionArgs } from "convex/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import type { AgentTool } from "./insightsToolAsk";
import { ANALYTICS_READ, SEARCH_CONSOLE_READ, keyedRead } from "./utils/agentTools";
import { ANALYTICS_SCREENS, type AnalyticsScreen } from "./utils/analyticsScreens";
import { CALENDAR_PERIODS, isCalendarPeriod, periodSpan, ukDay } from "./utils/calendarPeriods";

/**
 * The reads an Insights agent may make for itself (stronger-agents-plan-2026-10-30.md
 * A1): each section's screens, through the reads Ask Hakken already makes
 * (`assistantAnalyticsReads.ts`), which call the very functions the screens
 * call — so a figure an agent reads is the figure on the screen. Saved data
 * only: Live, which asks Google, is not offered. Each read is fixed to what the
 * agent was asked about — the company, the website and, for a page's bubble,
 * its dates, country and device — so an agent can never read another company's
 * figures or wander to other dates than the reader's. The weekly run's agents,
 * which weigh several spans, pick the period themselves.
 */

/** What a read is fixed to: the company and website, and for a page's bubble its dates, country and device. */
export type ReadScope = {
  companyId: Id<"companies">;
  host: string;
  /** The website's hold: the Conversions map's read takes it. */
  holdId?: Id<"companyWebsites">;
  /** One of the screens' calendar periods; a page on custom dates offers no reads (Ask Hakken's reads take periods only). Left out, the agent picks. */
  period?: string;
  device?: string;
  country?: string;
  from?: string;
  to?: string;
};

/** The period an agent asked for, when the scope leaves it the agent's to pick. */
const PERIOD_ARG = { type: "string", enum: [...CALENDAR_PERIODS], description: "The calendar period: thisWeek, lastWeek, thisMonth, lastMonth, last3Months, last6Months or last12Months (weeks Monday to Sunday)." };

/** The period a read uses: the scope's, or the one the agent asked for; null when neither is a calendar period. */
function periodOf(scope: ReadScope, args: Record<string, unknown>) {
  const period = scope.period ?? args.period;
  return isCalendarPeriod(period) ? period : null;
}

/** A read's span: the page's own dates, or the period's whole days to the newest the section holds. */
function spanOf(scope: ReadScope, period: (typeof CALENDAR_PERIODS)[number], newest: unknown): { from?: string; to?: string } {
  if (scope.from && scope.to) return { from: scope.from, to: scope.to };
  if (typeof newest !== "string") return {};
  const span = periodSpan(period, ukDay(), newest);
  return span ? { from: span.from, to: span.to } : {};
}

/** Visitors' lists, as the read names them. */
const VISITOR_LISTS = ["visitorType", "browser", "system", "age", "gender", "interest"] as const;

/** The screens an agent may read, by what each holds. */
const SCREENS_IN_WORDS = [
  "overview: visits, page views, people, conversions and their value against the span before, visits by channel, what changed most",
  "channels: each channel's visits and conversions; channel (key: the channel's name): its sources",
  "campaigns and adKeywords: visits from tagged links and ad keywords",
  "landingPages: each page visits land on, with its conversions; landingPage (key: the page's path): where its visits came from",
  "allPages: each page's views; page (key: the page's path): the page before, where people went next, its sources",
  "events: every event; event (key: Google's event name): what it was about, the pages it happened on",
  "conversions: each conversion counted, how visits reached them by channel and by kind of page, each event by kind of page, what people did before converting",
  "conversionsBy (columns: kind, channel, device or country): the Conversions page's map — for each conversion, the visits that did it, the visits it took for one, and each page kind's, channel's, device's or country's rate in every hundred of its visits, against the span before",
  "visitors (list: visitorType, browser, system, age, gender or interest): who visited and who converted",
  "products: a shop's steps (looked, added to basket, checkout, bought) with the baskets and checkouts left, and each product",
].join("; ");

/** Whether a page's dates can be read: Ask Hakken's reads take the screens' calendar periods, never custom dates. */
export const readable = (scope: Pick<ReadScope, "period">) => scope.period === undefined || isCalendarPeriod(scope.period);

/** Google Analytics' screens for the scope's website and dates: the agent picks the screen and, for a screen of one, which. */
export function analyticsTool(scope: ReadScope): AgentTool {
  return {
    declaration: {
      name: ANALYTICS_READ,
      description: `Read one Google Analytics screen of ${scope.host}${scope.period ? ", for the dates, country and device the reader is looking at" : ", for one calendar period, every device, the main home country"}. Every number comes back with its key in double square brackets: name a figure by that key, never type it. Screens: ${SCREENS_IN_WORDS}.`,
      parametersJsonSchema: {
        type: "object",
        required: scope.period ? ["screen"] : ["screen", "period"],
        properties: {
          screen: { type: "string", enum: [...ANALYTICS_SCREENS, "conversionsBy"] },
          columns: { type: "string", enum: ["kind", "channel", "device", "country"], description: "For conversionsBy: what the map's columns are." },
          ...(scope.period ? {} : { period: PERIOD_ARG }),
          key: { type: "string", description: "For channel, landingPage, page and event: the channel, the page's path, or the event's Google name." },
          search: { type: "string", description: "Words to find in a list's names. Optional." },
          list: { type: "string", enum: [...VISITOR_LISTS], description: "For visitors: which list." },
        },
      },
    },
    read: async (ctx: ActionCtx, args: Record<string, unknown>, prefix: string) => {
      const screen = typeof args.screen === "string" ? args.screen : "";
      if (screen !== "conversionsBy" && !(ANALYTICS_SCREENS as readonly string[]).includes(screen)) return { problem: `screen must be one of: ${ANALYTICS_SCREENS.join(", ")}, conversionsBy.` };
      const period = periodOf(scope, args);
      if (!period) return { problem: scope.period ? "The reader is looking at their own dates, which the screens' reads do not take: use the page's figures." : "Say which calendar period to read." };
      const text = (name: string) => (typeof args[name] === "string" && (args[name] as string).trim() ? (args[name] as string).trim() : undefined);
      // The Conversions page's map, read through the map's own function (agentReads.ts), its rates worked out in code.
      if (screen === "conversionsBy") {
        const columns = text("columns");
        if (columns !== "kind" && columns !== "channel" && columns !== "device" && columns !== "country") return { problem: "Say which columns: kind, channel, device or country." };
        if (!scope.holdId) return { problem: "The map can't be read here." };
        const map = await ctx.runQuery(internal.agentReads.conversionsByInternal, {
          companyId: scope.companyId, siteId: scope.holdId, period, device: scope.device ?? "", columns, ...(scope.country ? { country: scope.country } : {}),
        }) as Record<string, unknown>;
        if (map.ok === false) return { problem: String(map.problem ?? "The map could not be read.") };
        return keyedRead(map, scope.period ? `${prefix}.by${columns}` : `${prefix}.${period}.by${columns}`, {
          source: "analytics",
          ...(scope.from && scope.to ? { from: scope.from, to: scope.to } : {}),
          ...(scope.country ? { country: scope.country } : {}),
        });
      }
      const list = text("list");
      const asked: FunctionArgs<typeof internal.assistantAnalyticsReads.googleAnalyticsInternal> = {
        companyId: scope.companyId,
        website: scope.host,
        screen: screen as AnalyticsScreen,
        period,
        ...(scope.device === "desktop" || scope.device === "mobile" || scope.device === "tablet" ? { device: scope.device } : {}),
        ...(scope.country ? { country: scope.country } : {}),
        ...(text("key") ? { key: text("key") } : {}),
        ...(text("search") ? { search: text("search") } : {}),
        ...(list && (VISITOR_LISTS as readonly string[]).includes(list) ? { list: list as (typeof VISITOR_LISTS)[number] } : {}),
      };
      const answer = await ctx.runQuery(internal.assistantAnalyticsReads.googleAnalyticsInternal, asked) as Record<string, unknown>;
      if (answer.ok === false) return { problem: String(answer.problem ?? "That screen could not be read.") };
      // Overview's page panels are a read of their own, as on the screen and in Ask Hakken.
      const whole = screen === "overview"
        ? { ...answer, ...await ctx.runQuery(internal.assistantAnalyticsReads.googleAnalyticsInternal, { ...asked, part: "pages" }) as Record<string, unknown> }
        : answer;
      const currency = typeof whole.currency === "string" ? whole.currency : null;
      // A read the agent dated itself says its period in its keys, so two periods' figures never share a name.
      return keyedRead(whole, scope.period ? `${prefix}.${screen}` : `${prefix}.${period}.${screen}`, {
        source: "analytics",
        ...spanOf(scope, period, whole.figuresTo),
        ...(scope.country ? { country: scope.country } : {}),
        currency,
      });
    },
  };
}

/** Search Console for the scope's website: the website's clicks and impressions over a period, or the pages matching words. */
export function searchConsoleTool(scope: ReadScope): AgentTool {
  return {
    declaration: {
      name: SEARCH_CONSOLE_READ,
      description: `Read Search Console for ${scope.host}: Google clicks, impressions and positions over one calendar period against the days before, day by day; or, with page, the pages whose address holds those words. Every number comes back with its key in double square brackets: name a figure by that key, never type it.`,
      parametersJsonSchema: {
        type: "object",
        required: scope.period ? [] : ["period"],
        properties: {
          ...(scope.period ? {} : { period: PERIOD_ARG }),
          page: { type: "string", description: "Words in a page's address, to read the pages that match. Optional." },
        },
      },
    },
    read: async (ctx: ActionCtx, args: Record<string, unknown>, prefix: string) => {
      const period = periodOf(scope, args);
      if (!period) return { problem: "Say which calendar period to read." };
      const page = typeof args.page === "string" && args.page.trim() ? args.page.trim() : undefined;
      const answer = await ctx.runQuery(internal.assistantReads.searchConsoleInternal, { companyId: scope.companyId, website: scope.host, period, ...(page ? { page } : {}) }) as Record<string, unknown>;
      if (answer.ok === false) return { problem: String(answer.problem ?? "Search Console could not be read.") };
      return keyedRead(answer, `${prefix}.${period}.searchConsole${page ? ".pages" : ""}`, {
        source: "searchConsole",
        ...(typeof answer.from === "string" ? { from: answer.from } : {}),
        ...(typeof answer.to === "string" ? { to: answer.to } : {}),
      });
    },
  };
}
