import { v } from "convex/values";
import { deletePullAnswers } from "./seoPullAnswers";

import { internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { purgeHoldDataLimits } from "./companyDataLimits";
import { citedPageOf, recountCitedPages, type CitedPage } from "./siteRankings";
import { purgeHoldMoves } from "./websiteMoves";
import type { Id } from "./_generated/dataModel";

/**
 * Rows removed per pass, so one purge is one bounded transaction and chains
 * itself for the rest. The same number the rest of the websites code uses.
 */
const ENTRY_PURGE_BATCH = 100;

/**
 * Removing a company's holdings, in bounded passes.
 *
 * Split out of `websites.ts` when that file crossed the thousand-line ceiling
 * the module-size guard sets. These are the natural piece to move: they are
 * the retention path rather than the read-and-write path, they are called only
 * by the purge job, and — the constraint that decided it — none of them reads
 * the shared `websites` table, so the tenancy guard's list of two files that
 * may still stands untouched.
 */

export const purgeWebsiteHoldingsInternal = internalMutation({
  args: { websiteId: v.id("websites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owners = await ctx.db
      .query("companyWebsites")
      .withIndex("by_website", (q) => q.eq("websiteId", args.websiteId))
      .take(ENTRY_PURGE_BATCH);

    let holdsLeft = false;
    for (const owner of owners) {
      // What discovery found for this company's hold goes with the hold,
      // dated history included. A hold is only deleted once both are clear,
      // so a large list is finished on the next pass rather than orphaned.
      const cleared = await purgeHoldDiscoveries(ctx, owner._id);
      if (!cleared) {
        holdsLeft = true;
        continue;
      }
      await purgeHoldMoves(ctx, owner._id);
      await purgeHoldDataLimits(ctx, owner._id);
      await ctx.db.delete(owner._id);
    }

    /*
      Anything watched *against* the deleted host loses its pairing, not its
      place on the list.

      The site it was being compared with is gone, so the pairing is meaningless
      and would dangle at a website id that resolves to nothing. The attachment
      itself is still something this company chose and pays for, so clearing the
      pairing is the honest half-measure: it then follows the company schedule,
      exactly as an unpaired tracked site does.
    */
    const paired = await ctx.db
      .query("companyWebsites")
      .withIndex("by_against", (q) => q.eq("againstWebsiteId", args.websiteId))
      .take(ENTRY_PURGE_BATCH);
    for (const row of paired) {
      await ctx.db.patch(row._id, { againstWebsiteId: undefined });
    }

    /*
      Both directions of the competition graph.

      An edge names two hosts, so deleting one host has to clear the edges it
      points at *and* the edges pointing at it — otherwise a deleted site stays
      on somebody else's rival list as an id that resolves to nothing.
    */
    const asRival = await ctx.db
      .query("websiteRivals")
      .withIndex("by_rival", (q) => q.eq("rivalWebsiteId", args.websiteId))
      .take(ENTRY_PURGE_BATCH);
    for (const edge of asRival) await ctx.db.delete(edge._id);

    if (holdsLeft
      || owners.length === ENTRY_PURGE_BATCH
      || asRival.length === ENTRY_PURGE_BATCH
      || paired.length === ENTRY_PURGE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.websitePurge.purgeWebsiteHoldingsInternal, {
        websiteId: args.websiteId,
      });
    }
    return null;
  },
});

/**
 * A hold's discovered competitors, their dated history and the content gap
 * worked out from its rivals; true once none are left.
 */
async function purgeHoldDiscoveries(ctx: MutationCtx, companyWebsiteId: Id<"companyWebsites">): Promise<boolean> {
  const found = await ctx.db
    .query("discoveredCompetitors")
    .withIndex("by_company_website", (q) => q.eq("companyWebsiteId", companyWebsiteId))
    .take(ENTRY_PURGE_BATCH);
  for (const row of found) await ctx.db.delete(row._id);
  const dated = await ctx.db
    .query("discoveredCompetitorDays")
    .withIndex("by_company_website_day", (q) => q.eq("companyWebsiteId", companyWebsiteId))
    .take(ENTRY_PURGE_BATCH);
  for (const row of dated) await ctx.db.delete(row._id);
  const gaps = await ctx.db
    .query("siteContentGaps")
    .withIndex("by_hold_keyword", (q) => q.eq("companyWebsiteId", companyWebsiteId))
    .take(ENTRY_PURGE_BATCH);
  for (const row of gaps) await ctx.db.delete(row._id);
  return found.length < ENTRY_PURGE_BATCH && dated.length < ENTRY_PURGE_BATCH && gaps.length < ENTRY_PURGE_BATCH;
}

/**
 * Everything collected about the host, cleared when the host goes.
 *
 * Anthony, 2026-09-23: deleting a website should take all the data we store
 * for it. It used to take the record, its lists and everyone's holds, and
 * leave its rankings, metrics, summaries, AI mentions and DataForSEO answers
 * behind, pointing at a website that no longer existed. A stored answer can be
 * several rows of most of a megabyte, so pulls go a few at a time and stop
 * when a pass has read enough answers; everything else in batches.
 */
export const purgeWebsiteCollectedDataInternal = internalMutation({
  args: { websiteId: v.id("websites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    let more = false;

    const pulls = await ctx.db
      .query("seoDataPulls")
      .withIndex("by_website_submitted", (q) => q.eq("websiteId", args.websiteId))
      .take(PULL_PURGE_BATCH);
    let answerRows = 0;
    for (const pull of pulls) {
      if (answerRows >= ANSWER_ROWS_PER_PASS) {
        more = true;
        break;
      }
      const lines = await ctx.db
        .query("seoCycleLines")
        .withIndex("by_pull", (q) => q.eq("pullId", pull._id))
        .take(ENTRY_PURGE_BATCH);
      for (const line of lines) await ctx.db.delete(line._id);
      if (lines.length === ENTRY_PURGE_BATCH) {
        more = true;
        continue;
      }
      // The AI answer screen's row for it, or the answer stays listed after
      // the call behind it has gone. One per call; a handful at most.
      const answers = await ctx.db
        .query("aiAnswers")
        .withIndex("by_pull", (q) => q.eq("pullId", pull._id))
        .take(ENTRY_PURGE_BATCH);
      for (const answer of answers) await ctx.db.delete(answer._id);
      // Its words and its results page, kept for the Sites screens.
      for (const row of await ctx.db.query("aiAnswerTexts").withIndex("by_pull", (q) => q.eq("pullId", pull._id)).take(ENTRY_PURGE_BATCH)) {
        await ctx.db.delete(row._id);
      }
      for (const row of await ctx.db.query("siteSerpPages").withIndex("by_pull", (q) => q.eq("pullId", pull._id)).take(ENTRY_PURGE_BATCH)) {
        await ctx.db.delete(row._id);
      }
      // Its stored answer, kept apart from it since 2026-09-25.
      answerRows += await deletePullAnswers(ctx, pull._id);
      await ctx.db.delete(pull._id);
    }
    if (pulls.length === PULL_PURGE_BATCH) more = true;

    const byWebsite = async (rows: Array<{ _id: Id<"seoKeywordPositions"> | Id<"seoWebsiteMetrics"> | Id<"websiteSearchStats"> | Id<"websiteQuestionStats"> | Id<"aiCitations"> | Id<"siteKeywordRanks"> | Id<"sitePageRanks"> | Id<"siteSections"> | Id<"siteDaySummaries"> | Id<"siteCitedPages"> | Id<"sitePageTypes"> | Id<"siteBacklinks"> | Id<"siteReferringDomains"> | Id<"siteAnchors"> | Id<"siteReferringIps"> | Id<"siteLinkDays"> | Id<"siteReferringSubnets"> | Id<"sitePaidKeywords"> | Id<"siteCrawls"> | Id<"siteRivalAiDays"> | Id<"siteKeywordFeatures"> | Id<"siteCrawlPages"> | Id<"siteCrawlLinks"> }>) => {
      for (const row of rows) await ctx.db.delete(row._id);
      if (rows.length === ENTRY_PURGE_BATCH) more = true;
    };
    await byWebsite(await ctx.db.query("seoKeywordPositions")
      .withIndex("by_website_day", (q) => q.eq("websiteId", args.websiteId)).take(ENTRY_PURGE_BATCH));
    await byWebsite(await ctx.db.query("seoWebsiteMetrics")
      .withIndex("by_website_day", (q) => q.eq("websiteId", args.websiteId)).take(ENTRY_PURGE_BATCH));
    await byWebsite(await ctx.db.query("websiteSearchStats")
      .withIndex("by_website_place", (q) => q.eq("websiteId", args.websiteId)).take(ENTRY_PURGE_BATCH));
    await byWebsite(await ctx.db.query("websiteQuestionStats")
      .withIndex("by_website_place", (q) => q.eq("websiteId", args.websiteId)).take(ENTRY_PURGE_BATCH));
    // Its mentions in AI answers, wherever they were asked — and its name
    // taken out of those answers' lists of who they named, so nothing is left
    // pointing at a website that no longer exists.
    const mentions = await ctx.db.query("aiCitations")
      .withIndex("by_website_day", (q) => q.eq("mentionedWebsiteId", args.websiteId)).take(ENTRY_PURGE_BATCH);
    for (const mention of mentions) {
      if (mention.kind !== "BRAND") continue;
      const answer = await ctx.db.query("aiAnswers").withIndex("by_pull", (q) => q.eq("pullId", mention.pullId)).first();
      if (!answer) continue;
      const without = (ids: Id<"websites">[]) => ids.filter((id) => id !== args.websiteId);
      await ctx.db.patch(answer._id, {
        named: without(answer.named),
        recommended: without(answer.recommended),
        warnedAgainst: without(answer.warnedAgainst),
      });
    }
    await byWebsite(mentions);
    // What the Sites screens worked out from all of the above.
    await byWebsite(await ctx.db.query("siteKeywordRanks")
      .withIndex("by_site_keyword", (q) => q.eq("websiteId", args.websiteId)).take(ENTRY_PURGE_BATCH));
    await byWebsite(await ctx.db.query("sitePageRanks")
      .withIndex("by_site_page", (q) => q.eq("websiteId", args.websiteId)).take(ENTRY_PURGE_BATCH));
    await byWebsite(await ctx.db.query("siteSections")
      .withIndex("by_site_section", (q) => q.eq("websiteId", args.websiteId)).take(ENTRY_PURGE_BATCH));
    await byWebsite(await ctx.db.query("siteDaySummaries")
      .withIndex("by_site_day", (q) => q.eq("websiteId", args.websiteId)).take(ENTRY_PURGE_BATCH));
    await byWebsite(await ctx.db.query("siteCitedPages")
      .withIndex("by_site_url", (q) => q.eq("websiteId", args.websiteId)).take(ENTRY_PURGE_BATCH));
    // How often its questions' answers named others, and others' answers named it.
    await byWebsite(await ctx.db.query("siteRivalAiDays")
      .withIndex("by_asker_day", (q) => q.eq("askerWebsiteId", args.websiteId)).take(ENTRY_PURGE_BATCH));
    await byWebsite(await ctx.db.query("siteRivalAiDays")
      .withIndex("by_site", (q) => q.eq("websiteId", args.websiteId)).take(ENTRY_PURGE_BATCH));
    await byWebsite(await ctx.db.query("siteCrawlPages")
      .withIndex("by_site", (q) => q.eq("websiteId", args.websiteId)).take(ENTRY_PURGE_BATCH));
    await byWebsite(await ctx.db.query("siteCrawlLinks")
      .withIndex("by_site", (q) => q.eq("websiteId", args.websiteId)).take(ENTRY_PURGE_BATCH));
    await byWebsite(await ctx.db.query("siteKeywordFeatures")
      .withIndex("by_site_day", (q) => q.eq("websiteId", args.websiteId)).take(ENTRY_PURGE_BATCH));
    await byWebsite(await ctx.db.query("sitePageTypes")
      .withIndex("by_site_page", (q) => q.eq("websiteId", args.websiteId)).take(ENTRY_PURGE_BATCH));
    // Its links, linking websites, anchors, servers and link history (Phase 4).
    await byWebsite(await ctx.db.query("siteBacklinks")
      .withIndex("by_site_pass_rank", (q) => q.eq("websiteId", args.websiteId)).take(ENTRY_PURGE_BATCH));
    await byWebsite(await ctx.db.query("siteReferringDomains")
      .withIndex("by_site_rank", (q) => q.eq("websiteId", args.websiteId)).take(ENTRY_PURGE_BATCH));
    await byWebsite(await ctx.db.query("siteAnchors")
      .withIndex("by_site_backlinks", (q) => q.eq("websiteId", args.websiteId)).take(ENTRY_PURGE_BATCH));
    await byWebsite(await ctx.db.query("siteReferringIps")
      .withIndex("by_site_backlinks", (q) => q.eq("websiteId", args.websiteId)).take(ENTRY_PURGE_BATCH));
    await byWebsite(await ctx.db.query("siteLinkDays")
      .withIndex("by_site_day", (q) => q.eq("websiteId", args.websiteId)).take(ENTRY_PURGE_BATCH));
    await byWebsite(await ctx.db.query("siteReferringSubnets")
      .withIndex("by_site_domains", (q) => q.eq("websiteId", args.websiteId)).take(ENTRY_PURGE_BATCH));
    await byWebsite(await ctx.db.query("sitePaidKeywords")
      .withIndex("by_site_traffic", (q) => q.eq("websiteId", args.websiteId)).take(ENTRY_PURGE_BATCH));
    await byWebsite(await ctx.db.query("siteCrawls")
      .withIndex("by_site_day", (q) => q.eq("websiteId", args.websiteId)).take(ENTRY_PURGE_BATCH));

    if (more) {
      await ctx.scheduler.runAfter(0, internal.websitePurge.purgeWebsiteCollectedDataInternal, {
        websiteId: args.websiteId,
      });
    }
    return null;
  },
});

/** DataForSEO calls removed per pass. */
const PULL_PURGE_BATCH = 8;

/**
 * Answer rows a pass reads to delete before it takes no more calls. Each is
 * up to 900 KB and an answer up to four of them (`seoPullAnswers.ts`), so a
 * pass stops by eleven — well inside the sixteen megabytes a function may read.
 */
const ANSWER_ROWS_PER_PASS = 8;

/**
 * The host's own lists, cleared when the host goes.
 *
 * Replaces the per-company-website competitor purge. These hang off the
 * website rather than off anybody's hold on it, so they are the website's to
 * take with it, and nothing scoped to a company needs clearing separately.
 */
export const purgeWebsiteListsInternal = internalMutation({
  args: { websiteId: v.id("websites") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const questions = await ctx.db
      .query("websiteQuestions")
      .withIndex("by_website", (q) => q.eq("websiteId", args.websiteId))
      .take(ENTRY_PURGE_BATCH);
    for (const row of questions) {
      // A question no other website asks takes its answers with it.
      const askers = await ctx.db
        .query("websiteQuestions")
        .withIndex("by_prompt", (q) => q.eq("prompt", row.prompt))
        .take(2);
      if (askers.every((asker) => asker.websiteId === args.websiteId)) {
        await ctx.scheduler.runAfter(0, internal.websitePurge.purgeQuestionAnswersInternal, { prompt: row.prompt });
      }
      await ctx.db.delete(row._id);
    }

    const keywords = await ctx.db
      .query("websiteKeywords")
      .withIndex("by_website", (q) => q.eq("websiteId", args.websiteId))
      .take(ENTRY_PURGE_BATCH);
    for (const row of keywords) {
      // A search no other website tracks takes its results pages with it.
      const trackers = await ctx.db
        .query("websiteKeywords")
        .withIndex("by_keyword", (q) => q.eq("keyword", row.keyword))
        .take(2);
      if (trackers.every((tracker) => tracker.websiteId === args.websiteId)) {
        await ctx.scheduler.runAfter(0, internal.websitePurge.purgeSearchResultsInternal, { keyword: row.keyword });
      }
      await ctx.db.delete(row._id);
    }

    const rivals = await ctx.db
      .query("websiteRivals")
      .withIndex("by_website", (q) => q.eq("websiteId", args.websiteId))
      .take(ENTRY_PURGE_BATCH);
    for (const row of rivals) await ctx.db.delete(row._id);

    if (questions.length === ENTRY_PURGE_BATCH
      || keywords.length === ENTRY_PURGE_BATCH
      || rivals.length === ENTRY_PURGE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.websitePurge.purgeWebsiteListsInternal, {
        websiteId: args.websiteId,
      });
    }
    return null;
  },
});

/**
 * The shared purchases a deleted website leaves behind: the answers to its
 * questions and the Google results pages for its searches.
 *
 * They are bought once for every website asking the same question or tracking
 * the same search, so they are saved without a website, and the purges by
 * website never reach them. Anthony, 2026-09-24: "delete everything about the
 * website". So a question no other website asks goes with every answer to it,
 * and a search no other website tracks goes with every results page — each
 * purchase with everything it filed. One another website still asks or tracks
 * stays: those answers are that website's too, and deleting them would wipe
 * another client's history. Checked again on every pass, so a question asked
 * afresh in the meantime keeps what is left.
 */
export const purgeQuestionAnswersInternal = internalMutation({
  args: { prompt: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const asked = await ctx.db
      .query("websiteQuestions")
      .withIndex("by_prompt", (q) => q.eq("prompt", args.prompt))
      .first();
    if (asked) return null;

    let more = false;
    const cited: CitedPage[] = [];
    const answers = await ctx.db
      .query("aiAnswers")
      .withIndex("by_question", (q) => q.eq("prompt", args.prompt))
      .take(SHARED_PURCHASES_BATCH);
    for (const answer of answers) {
      if (await purgePurchase(ctx, answer.pullId, cited)) more = true;
    }
    if (answers.length === SHARED_PURCHASES_BATCH) more = true;

    // What was filed for the question beside its answers: the words of an
    // answer that named nobody, and the searches the engines ran.
    const texts = await ctx.db
      .query("aiAnswerTexts")
      .withIndex("by_prompt_day", (q) => q.eq("prompt", args.prompt))
      .take(ENTRY_PURGE_BATCH);
    for (const row of texts) await ctx.db.delete(row._id);
    const searches = await ctx.db
      .query("promptFanOutQueries")
      .withIndex("by_prompt", (q) => q.eq("prompt", args.prompt))
      .take(ENTRY_PURGE_BATCH);
    for (const row of searches) await ctx.db.delete(row._id);
    const searchDays = await ctx.db
      .query("promptFanOutDays")
      .withIndex("by_prompt_day", (q) => q.eq("prompt", args.prompt))
      .take(ENTRY_PURGE_BATCH);
    for (const row of searchDays) await ctx.db.delete(row._id);
    if (texts.length === ENTRY_PURGE_BATCH || searches.length === ENTRY_PURGE_BATCH || searchDays.length === ENTRY_PURGE_BATCH) {
      more = true;
    }

    // Pages those answers cited, counted again without them.
    await recountCitedPages(ctx, cited);
    if (more) {
      await ctx.scheduler.runAfter(0, internal.websitePurge.purgeQuestionAnswersInternal, { prompt: args.prompt });
    }
    return null;
  },
});

/** The Google results pages for a search no website tracks any more, and the purchases behind them. */
export const purgeSearchResultsInternal = internalMutation({
  args: { keyword: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const tracked = await ctx.db
      .query("websiteKeywords")
      .withIndex("by_keyword", (q) => q.eq("keyword", args.keyword))
      .first();
    if (tracked) return null;

    let more = false;
    const pages = await ctx.db
      .query("siteSerpPages")
      .withIndex("by_keyword_place_day", (q) => q.eq("keyword", args.keyword))
      .take(SHARED_PURCHASES_BATCH);
    for (const page of pages) {
      if (await purgePurchase(ctx, page.pullId, [])) more = true;
    }
    if (pages.length === SHARED_PURCHASES_BATCH || more) {
      await ctx.scheduler.runAfter(0, internal.websitePurge.purgeSearchResultsInternal, { keyword: args.keyword });
    }
    return null;
  },
});

/**
 * One shared purchase and everything it filed, the rows it is found by last:
 * true when it needs another pass. The pages its answer cited are added to
 * `cited`, to be counted again once it has gone.
 */
async function purgePurchase(
  ctx: MutationCtx,
  pullId: Id<"seoDataPulls">,
  cited: CitedPage[],
): Promise<boolean> {
  const citations = await ctx.db.query("aiCitations").withIndex("by_pull", (q) => q.eq("pullId", pullId)).take(ENTRY_PURGE_BATCH);
  for (const row of citations) {
    const page = citedPageOf(row);
    if (page) cited.push(page);
    await ctx.db.delete(row._id);
  }
  const texts = await ctx.db.query("aiAnswerTexts").withIndex("by_pull", (q) => q.eq("pullId", pullId)).take(ENTRY_PURGE_BATCH);
  for (const row of texts) await ctx.db.delete(row._id);
  const searchDays = await ctx.db.query("promptFanOutDays").withIndex("by_pull_query", (q) => q.eq("pullId", pullId)).take(ENTRY_PURGE_BATCH);
  for (const row of searchDays) await ctx.db.delete(row._id);
  const positions = await ctx.db.query("seoKeywordPositions").withIndex("by_pull", (q) => q.eq("pullId", pullId)).take(ENTRY_PURGE_BATCH);
  for (const row of positions) await ctx.db.delete(row._id);
  const lines = await ctx.db.query("seoCycleLines").withIndex("by_pull", (q) => q.eq("pullId", pullId)).take(ENTRY_PURGE_BATCH);
  for (const row of lines) await ctx.db.delete(row._id);
  if ([citations, texts, searchDays, positions, lines].some((rows) => rows.length === ENTRY_PURGE_BATCH)) return true;

  // Last, the rows the purchase is found by, and the purchase itself.
  for (const row of await ctx.db.query("aiAnswers").withIndex("by_pull", (q) => q.eq("pullId", pullId)).take(ENTRY_PURGE_BATCH)) {
    await ctx.db.delete(row._id);
  }
  for (const row of await ctx.db.query("siteSerpPages").withIndex("by_pull", (q) => q.eq("pullId", pullId)).take(ENTRY_PURGE_BATCH)) {
    await ctx.db.delete(row._id);
  }
  if (await ctx.db.get(pullId)) await ctx.db.delete(pullId);
  return false;
}

/** Shared purchases taken per pass: each carries its citations, words and searches. */
const SHARED_PURCHASES_BATCH = 10;

/**
 * A deleted company's holds. The hosts and everything on them survive it.
 *
 * Only the holds now. It used to take the company's competitor rows too,
 * because a rival was a per-client row; rivalry is a fact about a market and
 * lives on the host, so it outlives whoever was watching — ready for the next
 * company that attaches, which is the point of the lists having moved.
 */
export const purgeCompanyWebsitesInternal = internalMutation({
  args: { companyId: v.id("companies") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owned = await ctx.db
      .query("companyWebsites")
      .withIndex("by_company", (q) => q.eq("companyId", args.companyId))
      .take(ENTRY_PURGE_BATCH);
    for (const row of owned) {
      await purgeHoldMoves(ctx, row._id);
      await purgeHoldDataLimits(ctx, row._id);
      await ctx.db.delete(row._id);
    }
    // How much it collected per website goes with it.
    for (const row of await ctx.db.query("companyDataLimits").withIndex("by_company", (q) => q.eq("companyId", args.companyId)).take(5)) {
      await ctx.db.delete(row._id);
    }

    if (owned.length === ENTRY_PURGE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.websitePurge.purgeCompanyWebsitesInternal, {
        companyId: args.companyId,
      });
    }
    return null;
  },
});

// ---------------------------------------------------------------------------
// Writing — the names a site goes by, and where a company watches it from
// ---------------------------------------------------------------------------

/**
 * Set the names this website is known by.
 *
 * **Super admin only, and deliberately so.** The list sits on the shared
 * `websites` row, so one operator editing it changes what every company
 * tracking that host sees. Anthony, 2026-09-21: *"let's make it super admin for
 * now as I don't fully understand it yet."* Every edit is audited, including
 * what the list was before, because a shared record that someone blanked needs
 * to be recoverable from the trail rather than from memory.
 *
 * It is on the website rather than on a company's hold of it because two
 * companies would not disagree: anyone tracking a host writes down the same
 * names for it. The dedupe rule's test is disagreement, not ownership.
 */
