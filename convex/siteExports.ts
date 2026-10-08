import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalQuery } from "./_generated/server";
import { getActiveCompanyId } from "./authz";
import { answerPlace } from "./seoAiEngines";
import { listHold, myRivals } from "./siteAccess";
import { holdQuestions } from "./holdLists";
import { citedPagesOf, QUESTIONS_FOR_CITED_PAGES } from "./siteFigures";
import { contentGapOf, type GapRow } from "./siteContentGap";
import { tenantAction } from "./tenantFunctions";
import { appError } from "./utils/appError";
import { answerStance, siteExportKindValidator, type SiteExportKind } from "./utils/siteShapes";
import { compareSortValues, ipSortKey, type SortValue } from "./utils/sortOrder";
import { sortDirectionArg } from "./siteListPages";
import { loadSite } from "./websiteSiteRows";
import { MAX_LIST } from "./websiteSiteRows";
import { yourPagesList, yourPagesSortValue } from "./yourPages";
import { readPageKinds } from "./pageKinds";
import { NOT_SORTED_KIND } from "./utils/pageKinds";
import { isTrackedHold } from "./utils/websitePairing";
import { readReferringDomains, type ReferringDomainRow } from "./siteReferringDomainParts";

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

/** Every question on the list, as Full answers offers (docs/plans/active/sites-audit-fixes-plan.md, 3.2). */
const QUESTIONS_READ = MAX_LIST;

/*
 * Rows one file holds at most is the platform's setting since 2026-09-28
 * (`rowsPerDownload`, `sharedLimits.ts`); its largest choice is every keyword
 * of a very large site, and about what the byte ceiling below lets through.
 */

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

/** How an answer treated the site, in the words of the answers file, by the one rule every screen reads (`answerStance`). */
const STANCE_WORDS = { WARNED_AGAINST: "warned against", RECOMMENDED: "recommended", NAMED: "named", NOT_NAMED: "not named" } as const;

/** Each table's columns, in the order the page shows them. Headings in English, like every CSV here. */
const HEADERS: Record<ExportKind, string[]> = {
  keywords: ["keyword", "position", "change", "status", "volume", "intent", "difficulty", "cpc_usd", "traffic", "page", "last_checked"],
  pages: ["page", "type", "keywords", "top_3", "best_position", "traffic", "traffic_value_usd", "page_rank", "linking_websites", "top_keyword", "last_checked"],
  // Then a position and traffic pair per competitor, named when the file is
  // read (`exportPage`), and the newest day a competitor was seen ranking.
  gap: ["keyword", "intent", "volume", "difficulty"],
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
  // Your pages: the company's classification (or Hakken's kind while it has none), and where each page was found.
  yourPages: ["page", "group", "sitemap_file", "crawled", "shown_by_google", "ranks", "clicks_90_days"],
};

/**
 * What each file can be ordered by: the same columns, read the same way, as
 * the table it downloads (docs/plans/active/sites-table-sorting-plan.md, S5),
 * so the file comes in the order on screen. A column a file does not know
 * leaves it in its own order.
 */
type ExportRow = Doc<"siteKeywordRanks"> | Doc<"sitePageRanks"> | GapRow | Doc<"siteBacklinks">
  | ReferringDomainRow | Doc<"siteAnchors"> | Doc<"siteReferringIps"> | Doc<"sitePaidKeywords">;
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
    keyword: (row: GapRow) => row.keyword,
    volume: (row: GapRow) => row.volume,
    kd: (row: GapRow) => row.difficulty,
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
    domain: (row: ReferringDomainRow) => row.domain,
    rank: (row: ReferringDomainRow) => row.rank,
    backlinks: (row: ReferringDomainRow) => row.backlinks,
    spam: (row: ReferringDomainRow) => row.spamScore,
    firstSeen: (row: ReferringDomainRow) => row.firstSeen,
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
  // A competitor's own column of the content gap, `position:<its website>` or `traffic:<its website>`.
  const [column, rivalId] = sort?.split(":") ?? [];
  if (kind === "gap" && rivalId && (column === "position" || column === "traffic")) {
    const rival = (row as GapRow).rivals.find((entry) => entry.websiteId === rivalId);
    return (column === "position" ? rival?.position : rival?.traffic) ?? null;
  }
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
    const { rowsPerDownload } = await ctx.runQuery(internal.sharedLimits.getSharedLimits, {});
    const encoder = new TextEncoder();
    let header = line(HEADERS[args.kind]);
    const kept: ExportLine[] = [];
    let size = encoder.encode(header).length;
    let cursor: string | null = null;
    let host = "site";
    let complete = true;
    for (;;) {
      const page: { host: string; lines: ExportLine[]; cursor: string; isDone: boolean; cut?: boolean; header?: string[] } = await ctx.runQuery(
        internal.siteExports.exportPage,
        { siteId: args.siteId, companyId, kind: args.kind, cursor, ...(args.sort ? { sort: args.sort } : {}) },
      );
      host = page.host;
      if (page.header) {
        // Columns only the file's first page could name: the content gap's competitors.
        size += encoder.encode(line(page.header)).length - encoder.encode(header).length;
        header = line(page.header);
      }
      if (page.cut) complete = false;
      for (const next of page.lines) {
        const bytes = encoder.encode(next.line).length + 1;
        if (kept.length >= rowsPerDownload || size + bytes > MAX_EXPORT_BYTES) {
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
  returns: v.object({
    host: v.string(),
    lines: v.array(exportLine),
    cursor: v.string(),
    isDone: v.boolean(),
    /** The list was longer than it reads, and the file says so. */
    cut: v.optional(v.boolean()),
    /** The file's headings, when they depend on the site: the content gap's competitors. */
    header: v.optional(v.array(v.string())),
  }),
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
      sort = args.sort,
    ) => ({
      host,
      lines: result.page.map((row) => ({ line: toLine(row), group: "", order: exportValue(args.kind, sort, row), name: nameOf(row) })),
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
        const stance = STANCE_WORDS[answerStance(answer, websiteId)];
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
      case "pages": {
        // The page's type as the screen shows it: the company's own classification by name once it has any, Not sorted in words.
        const pageKinds = await readPageKinds(ctx, site.hold._id);
        const typeOf = (row: Doc<"sitePageRanks">) => {
          if (!pageKinds) return row.pageType;
          const kind = pageKinds.kindOf(row.page);
          return kind === NOT_SORTED_KIND ? "Not sorted" : pageKinds.nameOf(kind);
        };
        return done(await ctx.db.query("sitePageRanks")
          .withIndex("by_site_keywords", (q) => q.eq("websiteId", websiteId).eq("locationCode", place))
          .order("desc").paginate(page), (row: Doc<"sitePageRanks">) => line([
          row.page, typeOf(row), row.keywords, row.top3, row.bestPosition,
          row.traffic === undefined ? null : Math.round(row.traffic),
          row.trafficValue === undefined ? null : Math.round(row.trafficValue),
          row.pageRank, row.referringDomains, row.topKeyword, row.day,
        ]), (row) => row.page);
      }
      case "gap": {
        // A position and traffic pair per competitor tracked, as the page's
        // columns, worked out when read as the page works it out
        // (`siteContentGap.ts`); none for a competitor, whose page has none.
        const rivals = isTrackedHold(site.hold) ? [] : await myRivals(ctx, site);
        const competitors = rivals.map((rival) => rival.website);
        const gap = rivals.length === 0 ? null : await contentGapOf(ctx, { websiteId, place }, competitors.map((website) => website._id));
        // The page names a competitor's column by its Sites page; its rows, by its website.
        const [column, rivalSiteId] = args.sort?.split(":") ?? [];
        const rivalWebsite = rivals.find((rival) => rival.hold._id === rivalSiteId)?.website._id;
        const sort = rivalWebsite ? `${column}:${rivalWebsite}` : args.sort;
        return {
          host,
          header: [...HEADERS.gap, ...competitors.flatMap((website) => [`${website.displayHost}_position`, `${website.displayHost}_traffic`]), "last_checked"],
          lines: (gap?.rows ?? []).map((row) => {
            const ranking = new Map(row.rivals.map((rival) => [rival.websiteId, rival]));
            return {
              line: line([
                row.keyword, row.intent, row.volume, row.difficulty,
                ...competitors.flatMap((website) => {
                  const rival = ranking.get(website._id);
                  return [rival?.position, rival?.traffic === null || rival?.traffic === undefined ? null : Math.round(rival.traffic)];
                }),
                row.day,
              ]),
              group: "",
              order: exportValue("gap", sort, row),
              name: row.keyword,
            };
          }),
          cursor: "",
          isDone: true,
          ...(gap?.cut ? { cut: true } : {}),
        };
      }
      case "cited": {
        // A bounded list added up from the site's own questions (D17), whole in one page.
        const coverage = { cut: false };
        const cited = await citedPagesOf(ctx, websiteId, listHold(site), place, QUESTIONS_FOR_CITED_PAGES, coverage);
        const order = (row: (typeof cited)[number]): SortValue =>
          args.sort === "page" ? row.page : args.sort === "engines" ? row.engines.length : args.sort === "times" ? row.times : args.sort === "last" ? row.lastDay : null;
        return {
          host,
          lines: cited.map((row) => ({ line: line([row.page, row.times, row.engines.join(" "), row.firstDay, row.lastDay]), group: "", order: order(row) ?? null, name: row.page })),
          cursor: "",
          isDone: true,
          ...(coverage.cut ? { cut: true } : {}),
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
      case "domains": {
        // Every check's list packed (`siteReferringDomainParts.ts`), strongest first: a page of it from where the last stopped.
        const every = await readReferringDomains(ctx, websiteId);
        const from = Number(page.cursor ?? 0) || 0;
        const rows = every.slice(from, from + page.numItems);
        return done({ page: rows, continueCursor: String(from + rows.length), isDone: from + rows.length >= every.length }, (row: ReferringDomainRow) => line([
          row.domain, row.rank, row.backlinks, row.referringPages, row.spamScore, row.firstSeen, row.lostDate, row.status, row.day,
        ]), (row) => row.domain);
      }
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
      case "yourPages": {
        // The company's own website's every page once, whole in one page, from its compact copy (`yourPages.ts`).
        const list = isTrackedHold(site.hold) ? null : await yourPagesList(ctx, site.hold._id);
        return {
          host,
          lines: (list?.rows ?? []).map((row) => ({
            line: line([
              row.page, list?.groupBy === "CLASSIFICATION" ? (row.group ?? "Not sorted") : row.kind,
              row.file, row.crawled, row.shown, row.ranks, row.clicks,
            ]),
            group: "",
            order: yourPagesSortValue(args.sort, row) ?? null,
            name: row.page,
          })),
          cursor: "",
          isDone: true,
        };
      }
      case "paid":
        return done(await ctx.db.query("sitePaidKeywords")
          .withIndex("by_site_traffic", (q) => q.eq("websiteId", websiteId).eq("locationCode", place))
          .order("desc").paginate(page), (row: Doc<"sitePaidKeywords">) => line([
          row.keyword, row.position, row.volume, cents(row.cpc),
          row.traffic === undefined ? null : Math.round(row.traffic), row.trafficCost === undefined ? null : Math.round(row.trafficCost), row.page, row.day,
        ]), (row) => row.keyword);
    }
  },
});
