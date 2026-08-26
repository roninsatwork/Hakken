import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import schema from "../schema";

/**
 * What the wiki surfaces hand back.
 *
 * `wikiPages.ts` sits at the top of its frozen size band, and three of these
 * were already written out inside it. They move here whole rather than being
 * rewritten, so the page detail shape keeps the reasoning that goes with it:
 * two fields are omitted deliberately, and the note saying why is the point.
 *
 * The company and platform doors are the same read behind different walls, so
 * each shape is declared once and named by both.
 */

export const wikiKindShape = schema.tables.wikiPages.validator.fields.kind;

export const wikiMapRowValidator = v.object({
  pageId: v.id("wikiPages"),
  kind: wikiKindShape,
  title: v.string(),
  subjectKey: v.string(),
  links: v.array(v.string()),
  usageCount: v.number(),
  updatedAt: v.number(),
});

/** The receipts a page's source list shows. */
export const wikiPageSourceValidator = v.object({
  kind: v.union(
    v.literal("DOCUMENT"),
    v.literal("PHONE_CALL"),
    v.literal("EMAIL"),
    v.literal("HUMAN"),
    v.literal("CHAT")
  ),
  ref: v.string(),
  label: v.string(),
  addedAt: v.number(),
});

/**
 * One page in full, as its own screen reads it: the prose, its pinned
 * corrections, its receipts, its history, and the links in both directions
 * with the sentence that makes each one.
 *
 * `searchText` — the title, key and body concatenated for the search index —
 * never leaves: it is a duplicate of what is already here, and shipping it
 * would double the size of every page read for nothing. Neither does
 * `lastTendedAt`, which is the nightly pass's note to itself.
 */
export const wikiPageDetailValidator = v.object({
  pageId: v.id("wikiPages"),
  kind: wikiKindShape,
  title: v.string(),
  subjectKey: v.string(),
  content: v.string(),
  pinnedCorrections: v.array(v.object({ text: v.string(), pinnedAt: v.number() })),
  sources: v.array(wikiPageSourceValidator),
  revisions: v.array(
    v.object({ content: v.string(), source: v.string(), createdAt: v.number() })
  ),
  resolvedLinks: v.array(
    v.object({
      key: v.string(),
      slug: v.string(),
      pageId: v.id("wikiPages"),
      title: v.string(),
      excerpt: v.string(),
    })
  ),
  backlinks: v.array(
    v.object({
      pageId: v.id("wikiPages"),
      title: v.string(),
      subjectKey: v.string(),
      kind: wikiKindShape,
      quote: v.string(),
    })
  ),
  lastVerifiedAt: v.union(v.number(), v.null()),
  openQuestionCount: v.number(),
  lastRewriteSource: v.string(),
  updatedAt: v.number(),
  createdAt: v.number(),
  usageCount: v.number(),
  lastUsedAt: v.union(v.number(), v.null()),
});

export const wikiSearchHitsShape = v.array(v.object({
  pageId: v.id("wikiPages"),
  title: v.string(),
  kind: wikiKindShape,
  subjectKey: v.string(),
  snippet: v.string(),
}));

export const wikiExportShape = v.array(v.object({
  kind: wikiKindShape,
  subjectKey: v.string(),
  title: v.string(),
  content: v.string(),
  pinnedCorrections: v.array(v.string()),
  sources: v.array(v.string()),
  updatedAt: v.number(),
}));

export const wikiPageListShape = paginationResultValidator(v.object({
  pageId: v.id("wikiPages"),
  kind: wikiKindShape,
  title: v.string(),
  subjectKey: v.string(),
  links: v.array(v.string()),
  preview: v.string(),
  rewriteCount: v.number(),
  pinnedCount: v.number(),
  sourceCount: v.number(),
  lastRewriteSource: v.string(),
  updatedAt: v.number(),
  usageCount: v.number(),
  lastUsedAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
}));

export const wikiMapShape = v.array(wikiMapRowValidator);

export const wikiPageDetailOrNullShape = v.union(v.null(), wikiPageDetailValidator);

export const wikiClearShape = v.object({ deleted: v.number(), remaining: v.number() });
