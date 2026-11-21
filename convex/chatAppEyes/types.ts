import type { Id } from "../_generated/dataModel";
import type { SiteReader } from "../siteAccess";
import type { CalendarPeriod } from "../utils/calendarPeriods";

/**
 * Ask Hakken in ChatGPT and Claude, Option B: each screen's eye figures built
 * on the server (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md).
 *
 * - A read is one of the screens' own reader helpers, run in a query of its own
 *   for the pass's company (`chatAppEyeReads.eyeReadInternal`).
 * - A builder asks for the reads it needs and hands back what the screen hands
 *   its eye, or null when the screen would show nothing.
 */
export type EyeRead = (reader: SiteReader, args: Record<string, unknown>) => Promise<unknown>;
export type EyeReads = Record<string, EyeRead>;

export type EyeRun = (read: string, args: Record<string, unknown>) => Promise<unknown>;
/** What a builder is asked for: a website, the dates, and for a screen about one thing (a page, a keyword) its key. */
export type EyeAsk = { siteId: Id<"companyWebsites">; period: CalendarPeriod; key?: string };
export type EyeBuilder = (run: EyeRun, ask: EyeAsk) => Promise<unknown>;
export type EyeBuilders = Record<string, EyeBuilder>;
