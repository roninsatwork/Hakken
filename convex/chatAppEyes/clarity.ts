import type { Id } from "../_generated/dataModel";
import { readClarityErrors, readClarityOverview, readClarityPage, readClarityPagesList } from "../clarityScreens";
import { findMySite, type SiteReader } from "../siteAccess";
import { PAGE_TYPES } from "../utils/siteShapes";
import { claritySeesWordsFrom, errorsSees, overviewSees, pageSees, pagesSees, type ClaritySeesWords } from "../utils/sees/eyeData/clarity";
import { englishDay } from "../utils/sees/eyeData/englishDays";
import { englishWords } from "../utils/sees/serverWords";
import type { EyeBuilders, EyeReads } from "./types";

/**
 * Microsoft Clarity's screens for a chat app's question, built as the screens build them
 * (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md, Option B). The pattern is
 * Google Analytics Overview's (`googleAnalytics.ts`): the screens' own reader
 * helpers as reads, the screen's own pure figures function, English words from
 * `messages/en.json` (`utils/sees/serverWords.ts`). Every screen as it opens:
 * every device, the table's first page by visits.
 */

/** The connection's parts the screens read: the website's own address (for visits between its pages) and Clarity's newest day. */
async function connectionForEye(reader: SiteReader, args: Record<string, unknown>) {
  const site = await findMySite(reader, args.siteId as Id<"companyWebsites">);
  if (!site) return null;
  const connection = await reader.db.query("clarityConnections").withIndex("by_hold", (q) => q.eq("companyWebsiteId", site.hold._id)).first();
  if (!connection) return null;
  return { host: site.website.displayHost ?? site.website.host, status: connection.status, newestDay: connection.newestDay ?? null };
}

export const CLARITY_EYE_READS: EyeReads = {
  "clarity.connection": connectionForEye,
  "clarity.overview": (reader, args) => readClarityOverview(reader, args as never),
  "clarity.errors": (reader, args) => readClarityErrors(reader, args as never),
  "clarity.pagesList": (reader, args) => readClarityPagesList(reader, args as never),
  "clarity.page": (reader, args) => readClarityPage(reader, args as never),
};

type Connection = NonNullable<Awaited<ReturnType<typeof connectionForEye>>>;
type PagesList = Awaited<ReturnType<typeof readClarityPagesList>>;

const PAGE_TYPE_LIST: readonly string[] = PAGE_TYPES;

/**
 * The English words a Clarity screen names its figures in. A page group carries its classification's name; one without
 * is Hakken's own page type, named as the screens name it (`usePageKinds`).
 */
function englishFor(connection: Connection, period: string): ClaritySeesWords {
  const sites = englishWords("sites.common");
  return claritySeesWordsFrom(
    { common: englishWords("clarity.common"), sources: englishWords("clarity.sources"), devices: englishWords("clarity.devices"), periods: englishWords("common.periods") },
    period,
    { host: connection.host, day: englishDay, kindName: (kind) => (PAGE_TYPE_LIST.includes(kind) ? sites(`pageTypes.${kind}`) : "–") },
  );
}

/** A page as Clarity keeps it, by its path: "/door-handles", whether a chat app names the path or the whole address. */
function pathOf(key: string): string {
  const asked = key.trim();
  try {
    return new URL(asked).pathname;
  } catch {
    return asked;
  }
}

export const CLARITY_EYES: EyeBuilders = {
  /** Overview (`clarity/[siteId]/page.tsx`). */
  "clarity.overview": async (run, { siteId, period }) => {
    const connection = await run("clarity.connection", { siteId }) as Connection | null;
    if (!connection?.newestDay) return null;
    const data = await run("clarity.overview", { siteId, period }) as Awaited<ReturnType<typeof readClarityOverview>>;
    return overviewSees(data, englishFor(connection, period));
  },
  /** Errors (`errors/page.tsx`). */
  "clarity.errors": async (run, { siteId, period }) => {
    const connection = await run("clarity.connection", { siteId }) as Connection | null;
    if (!connection?.newestDay) return null;
    const data = await run("clarity.errors", { siteId, period }) as Awaited<ReturnType<typeof readClarityErrors>>;
    return errorsSees(data, englishFor(connection, period));
  },
  /** Pages (`pages/page.tsx`): the table's first page as it opens, 25 rows, the most visits first. */
  "clarity.pages": async (run, { siteId, period }) => {
    const connection = await run("clarity.connection", { siteId }) as Connection | null;
    if (!connection?.newestDay) return null;
    const answer = await run("clarity.pagesList", { siteId, period, sort: "visits", direction: "desc", page: 1, rows: 25 }) as PagesList | null;
    // A list still being built shows as loading (`useSiteListPage`), with no eye.
    if (!answer || answer.preparing) return null;
    return pagesSees(answer, englishFor(connection, period));
  },
  /** A page's own screen (`pages/page/page.tsx`), its path as `ask.key`. */
  "clarity.page": async (run, { siteId, period, key }) => {
    if (!key) return null;
    const connection = await run("clarity.connection", { siteId }) as Connection | null;
    if (!connection?.newestDay) return null;
    const page = pathOf(key);
    const data = await run("clarity.page", { siteId, period, page }) as Awaited<ReturnType<typeof readClarityPage>>;
    return pageSees(data, page, englishFor(connection, period));
  },
};
