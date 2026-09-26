import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalQuery } from "./_generated/server";
import { getActiveCompanyId } from "./authz";
import { answerPlace } from "./seoAiEngines";
import { listHold } from "./siteAccess";
import { holdQuestions } from "./holdLists";
import { citedPagesOf, QUESTIONS_FOR_CITED_PAGES } from "./siteFigures";
import { tenantAction } from "./tenantFunctions";
import { appError } from "./utils/appError";
import { siteExportKindValidator, type SiteExportKind } from "./utils/siteShapes";
import { compareSortValues, ipSortKey, type SortValue } from "./utils/sortOrder";
import { sortDirectionArg } from "./siteListPages";
import { loadSite } from "./websiteSiteRows";

/**
 * Downloading a whole Sites table as CSV (docs/plans/active/user-sites-plan.md,
 * "Tables" and "Speed": "Large exports are made on the server and handed over
 * when ready, never built in the browser").
 *
 * The file is built here, on the server, a page at a time from the table's
 * own index, and handed back as text for the page to save — never assembled
 * in the browser, and never stored: a file the platform makes on request is
 * not an upload, and the storage gateway (`uploadReservations.ts`) is for
 * uploads. Only a hold of the caller's company, like every Sites read.
 */

/** Rows read per page while building a file. */
const EXPORT_PAGE = 1_000;

/** Answers read per page: each carries its whole text, so fewer at a time. */
const ANSWERS_PAGE = 200;

/** The site's questions, capped on its record. */
const QUESTIONS_READ = 200;

/** Rows one file holds at most: every keyword of a very large site. */
const MAX_EXPORT_ROWS = 50_000;

/** Bytes one file holds at most, well under what a function may return. */
const MAX_EXPORT_BYTES = 6_000_000;

type ExportKind = SiteExportKind;
const exportKindValidator = siteExportKindValidator;

/**
 * A CSV cell: quoted when it needs to be, and text that begins like a
 * spreadsheet formula made harmless with a leading apostrophe — anchors,
 * keywords and answers come from other people's websites (see `toCsv` in the
 * Sites screens, which does the same).
 */
function cell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" && /^[=+\-@\t\r]/.test(value) ? `'${value}` : String(value);
  // Quoted on a carriage return too, which some spreadsheets read as a new
  // row, and on a semicolon, which a spreadsheet set to Italian splits on —
  // either could otherwise start a cell with a formula mid-line.
  return /[",;\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const line = (values: Array<string | number | boolean | null | undefined>) => values.map(cell).join(",");

/** Dollars to the cent: DataForSEO's prices arrive with float noise (14.960000038146973). */
const cents = (value: number | null | undefined) => (value === null || value === undefined ? null : Math.round(value * 100) / 100);

/** Each table's columns, in the order the page shows them. Headings in English, like every CSV here. */
const HEADERS: Record<ExportKind, string[]> = {
  keywords: ["keyword", "position", "change", "status", "volume", "intent", "difficulty", "cpc_usd", "traffic", "page", "last_checked"],
  pages: ["page", "type", "keywords", "top_3", "best_position", "traffic", "traffic_value_usd", "page_rank", "linking_websites", "top_keyword", "last_checked"],
  gap: ["keyword", "volume", "intent", "competitors_ranking", "best_competitor_position", "last_checked"],
  cited: ["page", "times_cited", "engines", "first_cited", "last_cited"],
  backlinks: ["linking_website", "linking_page", "anchor", "linked_page", "followed", "domain_rank", "first_seen", "last_seen", "status", "last_checked"],
  // Every link, with everything kept about it (2026-09-24, "store whatever
  // we can"), so the whole of it can be read before anyone decides what the
  // page should show.
  links: [
    "linking_website", "linking_page", "anchor", "linked_page", "followed", "rel", "where_on_page", "site_type",
    "link_rank", "link_spam_score", "domain_rank", "page_rank", "same_link_on_page", "through_redirect", "language",
    "country", "first_seen", "previously_seen", "last_seen", "status", "last_checked",
  ],
  broken: ["linking_website", "linking_page", "broken_page", "answer", "anchor", "domain_rank", "first_seen", "last_checked"],
  domains: ["website", "rank", "links", "pages_linking", "spam_score", "first_seen", "lost", "status", "last_checked"],
  anchors: ["anchor", "links", "linking_websites", "rank", "first_seen", "status", "last_checked"],
  ips: ["address", "network", "linking_websites", "links", "rank", "first_seen", "status", "last_checked"],
  paid: ["keyword", "advert_position", "volume", "cpc_usd", "visits", "estimated_cost_usd", "landing_page", "last_checked"],
  answers: ["day", "engine", "question", "this_website", "answer", "sources"],
};

/**
 * What each file can be ordered by: the same columns, read the same way, as
 * the table it downloads (docs/plans/active/sites-table-sorting-plan.md, S5),
 * so the file comes in the order on screen. A column a file does not know
 * leaves it in its own order.
 */
type ExportRow = Doc<"siteKeywordRanks"> | Doc<"sitePageRanks"> | Doc<"siteContentGaps"> | Doc<"siteBacklinks">
  | Doc<"siteReferringDomains"> | Doc<"siteAnchors"> | Doc<"siteReferringIps"> | Doc<"sitePaidKeywords">;
const EXPORT_SORTS: Partial<Record<ExportKind, Record<string, (row: never) => SortValue>>> = {
  keywords: {
    keyword: (row: Doc<"siteKeywordRanks">) => row.keyword,
    position: (row: Doc<"siteKeywordRanks">) => row.position,
    change: (row: Doc<"siteKeywordRanks">) => row.change,
    volume: (row: Doc<"siteKeywordRanks">) => (row.volumeKnown ? row.volume : null),
    cpc: (row: Doc<"siteKeywordRanks">) => row.cpc,
    traffic: (row: Doc<"siteKeywordRanks">) => row.traffic,
    lastSeen: (row: Doc<"siteKeywordRanks">) => row.day,
  },
  pages: {
    page: (row: Doc<"sitePageRanks">) => row.page,
    traffic: (row: Doc<"sitePageRanks">) => row.traffic,
    keywords: (row: Doc<"sitePageRanks">) => row.keywords,
    best: (row: Doc<"sitePageRanks">) => row.bestPosition,
    linking: (row: Doc<"sitePageRanks">) => row.referringDomains,
  },
  gap: {
    keyword: (row: Doc<"siteContentGaps">) => row.keyword,
    volume: (row: Doc<"siteContentGaps">) => (row.volumeKnown ? row.volume : null),
    rivals: (row: Doc<"siteContentGaps">) => row.rivalsRanking,
    best: (row: Doc<"siteContentGaps">) => row.bestRivalPosition,
  },
  backlinks: {
    from: (row: Doc<"siteBacklinks">) => row.domainFrom,
    domainRank: (row: Doc<"siteBacklinks">) => row.domainRank,
    firstSeen: (row: Doc<"siteBacklinks">) => row.firstSeen,
  },
  links: {
    from: (row: Doc<"siteBacklinks">) => row.domainFrom,
    domainRank: (row: Doc<"siteBacklinks">) => row.domainRank,
    firstSeen: (row: Doc<"siteBacklinks">) => row.firstSeen,
  },
  broken: {
    from: (row: Doc<"siteBacklinks">) => row.domainFrom,
    code: (row: Doc<"siteBacklinks">) => row.statusCode,
    domainRank: (row: Doc<"siteBacklinks">) => row.domainRank,
  },
  domains: {
    domain: (row: Doc<"siteReferringDomains">) => row.domain,
    rank: (row: Doc<"siteReferringDomains">) => row.rank,
    backlinks: (row: Doc<"siteReferringDomains">) => row.backlinks,
    spam: (row: Doc<"siteReferringDomains">) => row.spamScore,
    firstSeen: (row: Doc<"siteReferringDomains">) => row.firstSeen,
  },
  anchors: {
    anchor: (row: Doc<"siteAnchors">) => row.anchor,
    backlinks: (row: Doc<"siteAnchors">) => row.backlinks,
    domains: (row: Doc<"siteAnchors">) => row.referringDomains,
    firstSeen: (row: Doc<"siteAnchors">) => row.firstSeen,
  },
  ips: {
    ip: (row: Doc<"siteReferringIps">) => ipSortKey(row.ip),
    domains: (row: Doc<"siteReferringIps">) => row.referringDomains,
    backlinks: (row: Doc<"siteReferringIps">) => row.backlinks,
  },
  paid: {
    keyword: (row: Doc<"sitePaidKeywords">) => row.keyword,
    position: (row: Doc<"sitePaidKeywords">) => row.position,
    volume: (row: Doc<"sitePaidKeywords">) => row.volume,
    cpc: (row: Doc<"sitePaidKeywords">) => row.cpc,
    traffic: (row: Doc<"sitePaidKeywords">) => row.traffic,
    cost: (row: Doc<"sitePaidKeywords">) => row.trafficCost,
  },
};

/** The column a file is ordered by, when its table knows it: the answers and cited pages are ordered where they are read. */
function exportValue(kind: ExportKind, sort: string | undefined, row: ExportRow): number | string | null {
  const read = sort ? EXPORT_SORTS[kind]?.[sort] : undefined;
  return (read ? (read as (row: ExportRow) => SortValue)(row) : null) ?? null;
}

/**
 * A line of a file with what orders it: a group kept together whatever the
 * order (the question an answer is to), the column's value, and a name for
 * ties — the table's own rule (`convex/utils/sortOrder.ts`).
 */
const exportLine = v.object({ line: v.string(), group: v.string(), order: v.union(v.number(), v.string(), v.null()), name: v.string() });
type ExportLine = { line: string; group: string; order: number | string | null; name: string };

/**
 * One of the site's tables, whole, as CSV text: built here, a page at a time
 * from the table's own index, then put in the order the table is in on
 * screen, and returned for the page to save. A table longer than one file
 * holds is cut as it always was, then ordered. Only a hold of the caller's
 * company — the same rule as every Sites read.
 */
export const exportSiteTable = tenantAction({
  args: { siteId: v.id("companyWebsites"), kind: exportKindValidator, sort: v.optional(v.string()), direction: sortDirectionArg },
  returns: v.object({ fileName: v.string(), csv: v.string(), rows: v.number(), complete: v.boolean() }),
  handler: async (ctx, args): Promise<{ fileName: string; csv: string; rows: number; complete: boolean }> => {
    const companyId = getActiveCompanyId(ctx.user);
    if (!companyId) throw appError("NOT_FOUND", "That website is not one your company holds.");
    const encoder = new TextEncoder();
    const header = line(HEADERS[args.kind]);
    const kept: ExportLine[] = [];
    let size = encoder.encode(header).length;
    let cursor: string | null = null;
    let host = "site";
    let complete = true;
    for (;;) {
      const page: { host: string; lines: ExportLine[]; cursor: string; isDone: boolean } = await ctx.runQuery(
        internal.siteExports.exportPage,
        { siteId: args.siteId, companyId, kind: args.kind, cursor, ...(args.sort ? { sort: args.sort } : {}) },
      );
      host = page.host;
      for (const next of page.lines) {
        const bytes = encoder.encode(next.line).length + 1;
        if (kept.length >= MAX_EXPORT_ROWS || size + bytes > MAX_EXPORT_BYTES) {
          complete = false;
          break;
        }
        kept.push(next);
        size += bytes;
      }
      if (!complete || page.isDone) break;
      cursor = page.cursor;
    }
    if (args.sort) {
      const direction = args.direction ?? "desc";
      kept.sort((left, right) => left.group.localeCompare(right.group)
        || compareSortValues(left.order, right.order, direction)
        || left.name.localeCompare(right.name));
    }
    return {
      fileName: `${host}-${args.kind}-${new Date().toISOString().slice(0, 10)}.csv`,
      csv: [header, ...kept.map((entry) => entry.line)].join("\n"),
      rows: kept.length,
      complete,
    };
  },
});

/** One page of a table as CSV lines, read from the index the page itself reads. */
export const exportPage = internalQuery({
  args: {
    siteId: v.id("companyWebsites"),
    companyId: v.id("companies"),
    kind: exportKindValidator,
    cursor: v.union(v.string(), v.null()),
    /** The table's column the file will be ordered by: each line carries its value. */
    sort: v.optional(v.string()),
  },
  returns: v.object({ host: v.string(), lines: v.array(exportLine), cursor: v.string(), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const site = await loadSite(ctx, args.siteId);
    if (!site || site.hold.companyId !== args.companyId) throw appError("NOT_FOUND", "That website is not one your company holds.");
    const job = { kind: args.kind, siteId: args.siteId };
    const host = site.website.host;
    const websiteId = site.website._id;
    const place = site.place;
    const page = { cursor: args.cursor, numItems: EXPORT_PAGE };
    const done = <Row extends ExportRow>(
      result: { page: Row[]; continueCursor: string; isDone: boolean },
      toLine: (row: Row) => string,
      nameOf: (row: Row) => string,
    ) => ({
      host,
      lines: result.page.map((row) => ({ line: toLine(row), group: "", order: exportValue(args.kind, args.sort, row), name: nameOf(row) })),
      cursor: result.continueCursor,
      isDone: result.isDone,
    });

    // Every answer to the site's questions, one question after another: the
    // cursor carries which question it is on and where in its answers.
    if (job.kind === "answers") {
      const questions = (await holdQuestions(ctx, listHold(site), QUESTIONS_READ))
        .sort((left, right) => left.prompt.localeCompare(right.prompt));
      const [at, inner] = args.cursor ? [Number(args.cursor.split("|")[0]), args.cursor.slice(args.cursor.indexOf("|") + 1) || null] : [0, null];
      const question = questions[at];
      if (!question) return { host, lines: [], cursor: "", isDone: true };
      const places = question.engines.map((engine) => ({ engine, place: answerPlace(engine, place) }));
      const result = await ctx.db
        .query("aiAnswerTexts")
        .withIndex("by_prompt_day", (q) => q.eq("prompt", question.prompt))
        .paginate({ cursor: inner, numItems: ANSWERS_PAGE });
      const lines: ExportLine[] = [];
      for (const row of result.page) {
        if (!places.some((entry) => entry.engine === row.engine && entry.place === row.locationCode)) continue;
        const answer = await ctx.db.query("aiAnswers").withIndex("by_pull", (q) => q.eq("pullId", row.pullId)).first();
        const stance = answer?.recommended.includes(websiteId) ? "recommended"
          : answer?.warnedAgainst.includes(websiteId) ? "warned against"
            : answer?.named.includes(websiteId) ? "named" : "not named";
        lines.push({ line: line([row.day, row.engine, row.prompt, stance, row.text, row.sources.join(" ")]), group: row.prompt, order: row.day, name: row.engine });
      }
      const lastQuestion = at >= questions.length - 1;
      return {
        host,
        lines,
        cursor: result.isDone ? `${at + 1}|` : `${at}|${result.continueCursor}`,
        isDone: result.isDone && lastQuestion,
      };
    }

    switch (job.kind) {
      case "keywords":
        return done(await ctx.db.query("siteKeywordRanks")
          .withIndex("by_site_band_position", (q) => q.eq("websiteId", websiteId).eq("locationCode", place).lt("band", "zz_none"))
          .paginate(page), (row: Doc<"siteKeywordRanks">) => line([
          row.keyword, row.position, row.change, row.status, row.volumeKnown ? row.volume : null, row.intent,
          row.difficulty, cents(row.cpc), row.traffic === undefined ? null : Math.round(row.traffic), row.page, row.day,
        ]), (row) => row.keyword);
      case "pages":
        return done(await ctx.db.query("sitePageRanks")
          .withIndex("by_site_keywords", (q) => q.eq("websiteId", websiteId).eq("locationCode", place))
          .order("desc").paginate(page), (row: Doc<"sitePageRanks">) => line([
          row.page, row.pageType, row.keywords, row.top3, row.bestPosition,
          row.traffic === undefined ? null : Math.round(row.traffic),
          row.trafficValue === undefined ? null : Math.round(row.trafficValue),
          row.pageRank, row.referringDomains, row.topKeyword, row.day,
        ]), (row) => row.page);
      case "gap":
        return done(await ctx.db.query("siteContentGaps")
          .withIndex("by_hold_volume", (q) => q.eq("companyWebsiteId", job.siteId))
          .order("desc").paginate(page), (row: Doc<"siteContentGaps">) => line([
          row.keyword, row.volumeKnown ? row.volume : null, row.intent, row.rivalsRanking, row.bestRivalPosition,
          new Date(row.updatedAt).toISOString().slice(0, 10),
        ]), (row) => row.keyword);
      case "cited": {
        // A bounded list added up from the site's own questions (D17), whole in one page.
        const cited = await citedPagesOf(ctx, websiteId, listHold(site), place, QUESTIONS_FOR_CITED_PAGES);
        const order = (row: (typeof cited)[number]): SortValue =>
          args.sort === "page" ? row.page : args.sort === "engines" ? row.engines.length : args.sort === "times" ? row.times : args.sort === "last" ? row.lastDay : null;
        return {
          host,
          lines: cited.map((row) => ({ line: line([row.page, row.times, row.engines.join(" "), row.firstDay, row.lastDay]), group: "", order: order(row) ?? null, name: row.page })),
          cursor: "",
          isDone: true,
        };
      }
      case "backlinks":
      case "broken":
        return done(await ctx.db.query("siteBacklinks")
          .withIndex("by_site_pass_rank", (q) => q.eq("websiteId", websiteId).eq("pass", job.kind === "broken" ? "BROKEN" : "ONE_PER_DOMAIN"))
          .order("desc").paginate(page), (row: Doc<"siteBacklinks">) => job.kind === "broken"
          ? line([row.domainFrom, row.urlFrom, row.pageTo, row.statusCode, row.anchor, row.domainRank, row.firstSeen, row.day])
          : line([row.domainFrom, row.urlFrom, row.anchor, row.pageTo, row.dofollow, row.domainRank, row.firstSeen, row.lastSeen, row.status, row.day]),
        (row) => row.urlFrom);
      case "links":
        return done(await ctx.db.query("siteBacklinks")
          .withIndex("by_site_pass_rank", (q) => q.eq("websiteId", websiteId).eq("pass", "ALL"))
          .order("desc").paginate(page), (row: Doc<"siteBacklinks">) => line([
          row.domainFrom, row.urlFrom, row.anchor, row.pageTo, row.dofollow, row.attributes?.join(" "), row.location,
          row.platformTypes?.join(" "), row.linkRank, row.spamScore, row.domainRank, row.pageRank, row.linksOnPage,
          row.indirect, row.language, row.country, row.firstSeen, row.previousSeen, row.lastSeen, row.status, row.day,
        ]), (row) => row.urlFrom);
      case "domains":
        return done(await ctx.db.query("siteReferringDomains")
          .withIndex("by_site_rank", (q) => q.eq("websiteId", websiteId))
          .order("desc").paginate(page), (row: Doc<"siteReferringDomains">) => line([
          row.domain, row.rank, row.backlinks, row.referringPages, row.spamScore, row.firstSeen, row.lostDate, row.status, row.day,
        ]), (row) => row.domain);
      case "anchors":
        return done(await ctx.db.query("siteAnchors")
          .withIndex("by_site_backlinks", (q) => q.eq("websiteId", websiteId))
          .order("desc").paginate(page), (row: Doc<"siteAnchors">) => line([
          row.anchor, row.backlinks, row.referringDomains, row.rank, row.firstSeen, row.status, row.day,
        ]), (row) => row.anchor);
      case "ips":
        return done(await ctx.db.query("siteReferringIps")
          .withIndex("by_site_backlinks", (q) => q.eq("websiteId", websiteId))
          .order("desc").paginate(page), (row: Doc<"siteReferringIps">) => line([
          row.ip, row.subnet, row.referringDomains, row.backlinks, row.rank, row.firstSeen, row.status, row.day,
        ]), (row) => row.ip);
      case "paid":
        return done(await ctx.db.query("sitePaidKeywords")
          .withIndex("by_site_traffic", (q) => q.eq("websiteId", websiteId).eq("locationCode", place))
          .order("desc").paginate(page), (row: Doc<"sitePaidKeywords">) => line([
          row.keyword, row.position, row.volume, cents(row.cpc), Math.round(row.traffic), Math.round(row.trafficCost), row.page, row.day,
        ]), (row) => row.keyword);
    }
  },
});
