import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

/**
 * The Pages screen's list, read where the pages are: searched, filtered by kind or tag, and paged. Moved out of
 * `wikiPages.ts` on 21 November 2026 when the tags came (wiki-sonae-catch-up-plan-2026-11-21.md), to keep that file
 * inside its size band (`code-ratchets.json`). Called by `wikiPages.listPages` and `wikiPages.listPagesForGlobal`.
 */
type WikiKind = Doc<"wikiPages">["kind"];
type WikiScope = Id<"companies"> | undefined;

export async function listPagesRows(
  ctx: QueryCtx,
  companyId: WikiScope,
  paginationOpts: { numItems: number; cursor: string | null },
  search?: string,
  kind?: WikiKind,
  tag?: string
) {
  const needle = search?.trim();
  // Filtered by tag (wiki-daily-checkup-plan.md, section 4): the tag rows
  // are the index, so a tag of a thousand pages pages like any other list.
  if (tag && !needle) {
    const tagged = await ctx.db
      .query("wikiPageTags")
      .withIndex("by_company_tag", (q) => q.eq("companyId", companyId).eq("tag", tag))
      .paginate(paginationOpts);
    const pages: Array<Doc<"wikiPages">> = [];
    for (const row of tagged.page) {
      const page = await ctx.db.get(row.pageId);
      if (page && page.companyId === companyId && (!kind || page.kind === kind)) pages.push(page);
    }
    return { ...tagged, page: pages.map(listRow) };
  }
  // Searched, filtered and paged where the pages are. This used to take five
  // hundred rows and sift them in the browser: a growing bill on every
  // keystroke, and page five hundred and one simply did not exist.
  //
  // Three shapes, each fully served by an index: search (kind is a filter
  // field on the search index), kind alone (the kind-subject index — sifting
  // a kind out of already-cut pages returned near-empty pages for the rare
  // kinds, which are exactly the ones worth filtering to), and the plain
  // newest-first list.
  const page = needle
    ? await ctx.db
      .query("wikiPages")
      .withSearchIndex("search_text", (q) => {
        const base = q.search("searchText", needle).eq("companyId", companyId);
        return kind ? base.eq("kind", kind) : base;
      })
      .paginate(paginationOpts)
    : kind
      ? await ctx.db
        .query("wikiPages")
        .withIndex("by_company_kind_subject", (q) => q.eq("companyId", companyId).eq("kind", kind))
        .paginate(paginationOpts)
      : await ctx.db
        .query("wikiPages")
        .withIndex("by_company_updated", (q) => q.eq("companyId", companyId))
        .order("desc")
        .paginate(paginationOpts);

  const rows = tag ? page.page.filter((row) => (row.tags ?? []).includes(tag)) : page.page;

  return {
    ...page,
    page: rows.map(listRow),
  };
}

export function listRow(page: Doc<"wikiPages">) {
  return {
    pageId: page._id,
    kind: page.kind,
    title: page.title,
    subjectKey: page.subjectKey,
    links: page.links,
    preview: page.content.slice(0, 160),
    rewriteCount: page.rewriteCount,
    pinnedCount: page.pinnedCorrections.length,
    // Denormalised in upsertSourceReceipt: counting per row here would be
    // an N+1 across the whole wiki on every keystroke of the search box.
    sourceCount: page.documentSourceCount ?? 0,
    lastRewriteSource: page.lastRewriteSource,
    updatedAt: page.updatedAt,
    // The loop's marks (closing-the-loop plan, phase 2).
    usageCount: page.usageCount ?? 0,
    lastUsedAt: page.lastUsedAt ?? null,
    createdAt: page.createdAt,
    tags: page.tags ?? [],
  };
}
