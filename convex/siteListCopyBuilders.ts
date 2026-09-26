import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalQuery, type ActionCtx } from "./_generated/server";
import { myRivals, requireMySite } from "./siteAccess";
import { GAP_COPY_FIELDS, GAP_COPY_MAX } from "./siteCompetitors";
import { KEYWORD_COPY_FIELDS } from "./siteKeywordCopy";
import { PAGE_COPY_FIELDS } from "./siteKeywords";
import { LINK_COPY_FIELDS } from "./siteLinkLists";
import {
  copyRequestKey,
  dropCopyOf,
  gapCopyKey,
  keywordsCopyKey,
  linksCopyKey,
  pagesCopyKey,
  writeListCopy,
  type CopyKind,
} from "./siteListCopies";
import { claimSchedule, siteRebuildKey } from "./siteRankings";
import { REBUILD_WAIT_MS } from "./siteSummaries";
import { tenantMutation } from "./tenantFunctions";
import { appError } from "./utils/appError";

/**
 * Building the compact copies of Top pages, every link and the content gap
 * (docs/plans/active/sites-table-pages-plan.md §5.2). The keyword copy is
 * built by the site rebuild, which reads every keyword anyway
 * (`siteSummaries.ts`); these three read their own tables, a page at a time,
 * and write the copy through `writeListCopy`.
 *
 * One build of a list at a time, under the same turn the site rebuild takes
 * (`beginRebuild`), so two builds never write over each other.
 */

/** Rows read per page while building a copy. */
const BUILD_PAGE = 2_000;

type Page<Row> = { rows: Row[]; cursor: string; isDone: boolean };

export const pageRanksPage = internalQuery({
  args: { websiteId: v.id("websites"), locationCode: v.number(), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args): Promise<Page<Doc<"sitePageRanks">>> => {
    const result = await ctx.db
      .query("sitePageRanks")
      .withIndex("by_site_page", (q) => q.eq("websiteId", args.websiteId).eq("locationCode", args.locationCode))
      .paginate({ cursor: args.cursor, numItems: BUILD_PAGE });
    return { rows: result.page, cursor: result.continueCursor, isDone: result.isDone };
  },
});

export const everyLinkPage = internalQuery({
  args: { websiteId: v.id("websites"), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args): Promise<Page<Doc<"siteBacklinks">>> => {
    const result = await ctx.db
      .query("siteBacklinks")
      .withIndex("by_site_pass_rank", (q) => q.eq("websiteId", args.websiteId).eq("pass", "ALL"))
      .order("desc")
      .paginate({ cursor: args.cursor, numItems: BUILD_PAGE });
    return { rows: result.page, cursor: result.continueCursor, isDone: result.isDone };
  },
});

export const gapPage = internalQuery({
  args: { holdId: v.id("companyWebsites"), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args): Promise<Page<Doc<"siteContentGaps">>> => {
    const result = await ctx.db
      .query("siteContentGaps")
      .withIndex("by_hold_volume", (q) => q.eq("companyWebsiteId", args.holdId))
      .order("desc")
      .paginate({ cursor: args.cursor, numItems: BUILD_PAGE });
    return { rows: result.page, cursor: result.continueCursor, isDone: result.isDone };
  },
});

/** Every page of one of the readers above, until done or `limit` rows are in hand. */
async function readAll<Row>(read: (cursor: string | null) => Promise<Page<Row>>, limit = Number.POSITIVE_INFINITY): Promise<Row[]> {
  const rows: Row[] = [];
  let cursor: string | null = null;
  for (;;) {
    const page: Page<Row> = await read(cursor);
    rows.push(...page.rows);
    if (page.isDone || rows.length >= limit) return rows;
    cursor = page.cursor;
  }
}

async function buildPagesCopy(ctx: ActionCtx, key: string): Promise<void> {
  const [websiteId, place] = key.split(":");
  const rows = await readAll((cursor) => ctx.runQuery(internal.siteListCopyBuilders.pageRanksPage, {
    websiteId: websiteId as Id<"websites">, locationCode: Number(place), cursor,
  }));
  await writeListCopy(ctx, {
    kind: "pages",
    key,
    fields: PAGE_COPY_FIELDS,
    rows: rows.map((row) => [
      row._id, row.page, row.section, row.pageType ?? "UNJUDGED", row.keywords, row.traffic ?? null, row.topKeyword,
      row.bestPosition, row.referringDomains ?? null,
    ]),
  });
}

async function buildLinksCopy(ctx: ActionCtx, key: string): Promise<void> {
  const rows = await readAll((cursor) => ctx.runQuery(internal.siteListCopyBuilders.everyLinkPage, {
    websiteId: key as Id<"websites">, cursor,
  }));
  await writeListCopy(ctx, {
    kind: "links",
    key,
    fields: LINK_COPY_FIELDS,
    rows: rows.map((row) => [
      row._id, row.domainFrom, row.urlFrom, row.anchor ?? null, row.pageTo, row.dofollow, row.status, row.domainRank, row.firstSeen ?? null,
    ]),
  });
}

async function buildGapCopy(ctx: ActionCtx, key: string): Promise<void> {
  const read = await readAll((cursor) => ctx.runQuery(internal.siteListCopyBuilders.gapPage, {
    holdId: key as Id<"companyWebsites">, cursor,
  }), GAP_COPY_MAX + 1);
  const cut = read.length > GAP_COPY_MAX ? GAP_COPY_MAX : null;
  const rows = read.slice(0, GAP_COPY_MAX);
  const rivalIds: string[] = [];
  const rivalIndex = new Map<string, number>();
  const indexOf = (websiteId: string) => {
    let index = rivalIndex.get(websiteId);
    if (index === undefined) {
      index = rivalIds.length;
      rivalIds.push(websiteId);
      rivalIndex.set(websiteId, index);
    }
    return index;
  };
  await writeListCopy(ctx, {
    kind: "gap",
    key,
    fields: GAP_COPY_FIELDS,
    rows: rows.map((row) => [
      row._id,
      row.keyword,
      row.volumeKnown ? row.volume : null,
      row.intent,
      row.rivals.flatMap((rival) => [indexOf(rival.websiteId), rival.position]),
      new Date(row.updatedAt).toISOString().slice(0, 10),
    ]),
    cut,
    meta: { rivalIds: JSON.stringify(rivalIds) },
  });
}

const kindValidator = v.union(v.literal("keywords"), v.literal("pages"), v.literal("links"), v.literal("gap"));

/** Build one list's copy, taking its turn: a build already running is waited for, then this runs after it. */
export const buildListCopy = internalAction({
  args: { kind: kindValidator, key: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    if (args.kind === "keywords") {
      // The site rebuild writes this one; asked here, it is asked of that.
      const [websiteId, place] = args.key.split(":");
      await ctx.scheduler.runAfter(0, internal.siteSummaries.rebuildSite, { websiteId: websiteId as Id<"websites">, locationCode: Number(place) });
      return null;
    }
    const turn = copyRequestKey(args.kind, args.key);
    if (!(await ctx.runMutation(internal.siteSummaries.beginRebuild, { key: turn }))) {
      await ctx.scheduler.runAfter(REBUILD_WAIT_MS, internal.siteListCopyBuilders.buildListCopy, args);
      return null;
    }
    try {
      // Asked for before its website or hold was deleted: remove the copy, write none.
      if (!(await ctx.runQuery(internal.siteListCopies.copyOwnerExists, args))) {
        await dropCopyOf(ctx, args.kind, args.key);
        return null;
      }
      if (args.kind === "pages") await buildPagesCopy(ctx, args.key);
      else if (args.kind === "links") await buildLinksCopy(ctx, args.key);
      else await buildGapCopy(ctx, args.key);
    } finally {
      await ctx.runMutation(internal.siteSummaries.endRebuild, { key: turn });
    }
    return null;
  },
});

/** The layout each copy is read in: a copy in any other is as good as none. */
const FIELDS: Record<CopyKind, readonly string[]> = {
  keywords: KEYWORD_COPY_FIELDS,
  pages: PAGE_COPY_FIELDS,
  links: LINK_COPY_FIELDS,
  gap: GAP_COPY_FIELDS,
};

/**
 * Build a list's copy now, when a table finds it has none yet — a site added
 * since, or a copy in an older layout. Asked once however many readers ask:
 * the request is claimed as the builds are, and a copy that is there already
 * is left alone.
 */
export const ensureSiteListCopy = tenantMutation({
  args: {
    siteId: v.id("companyWebsites"),
    list: kindValidator,
    /** For a competitor's shared searches: its keywords, from the site's place. */
    rivalId: v.optional(v.id("companyWebsites")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    let websiteId = site.website._id;
    if (args.rivalId) {
      const rival = (await myRivals(ctx, site)).find((entry) => entry.hold._id === args.rivalId);
      if (!rival) throw appError("NOT_FOUND", "That website is not one beside this one.");
      websiteId = rival.website._id;
    }
    const key = args.list === "keywords" ? keywordsCopyKey(websiteId, site.place)
      : args.list === "pages" ? pagesCopyKey(websiteId, site.place)
        : args.list === "links" ? linksCopyKey(websiteId)
          : gapCopyKey(args.siteId);
    const header = await ctx.db
      .query("siteListCopies")
      .withIndex("by_kind_key", (q) => q.eq("kind", args.list).eq("key", key))
      .unique();
    if (header && header.fields.join("\u0000") === FIELDS[args.list].join("\u0000")) return null;
    if (args.list === "keywords") {
      if (await claimSchedule(ctx, siteRebuildKey(websiteId, site.place))) {
        await ctx.scheduler.runAfter(0, internal.siteSummaries.rebuildSite, { websiteId, locationCode: site.place });
      }
      return null;
    }
    if (await claimSchedule(ctx, copyRequestKey(args.list, key))) {
      await ctx.scheduler.runAfter(0, internal.siteListCopyBuilders.buildListCopy, { kind: args.list, key });
    }
    return null;
  },
});
