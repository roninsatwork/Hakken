import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { isKnowledgeArticlePage } from "./utils/knowledgePageGuard";
import { contradictionKey, findContradictions, settleOne, staffActive, type ClusterPage } from "./wikiCheckupSettle";

/**
 * Disagreements settled as a document comes in (wiki-sonae-catch-up-plan-2026-11-21.md, 2.3; Anthony, 2026-11-21: "yes",
 * to going beyond Sonae, which checks only nightly). Once a new or changed document has taught its pages, each is read
 * beside the pages it links to. A claim that now disagrees with another page is settled then, by the nightly check-up's
 * own fixed rules (`settleOne`: a pinned correction wins, a sourced claim beats an unsourced one, the newer source wins),
 * or raised as an open question when the self-correcting switch is off. So a newer document that replaces an older fact
 * replaces it the same minute.
 *
 * Capped per document (`WIKI_SETTLE_ON_ARRIVAL_PAGES` pages, `WIKI_SETTLE_ON_ARRIVAL_FINDINGS` disagreements each), so a
 * large upload can't run up the model bill: what's over the cap waits for the night. Pages checked here are stamped, so
 * the night doesn't check them again straight away. A fact that goes stale only with time has no document arriving to
 * notice it: the nightly check-up keeps looking for those.
 */

/** The most pages one document's arrival checks: its newest-written topic pages. */
export const WIKI_SETTLE_ON_ARRIVAL_PAGES = 3;
/** The most disagreements settled or raised for each of those pages. */
export const WIKI_SETTLE_ON_ARRIVAL_FINDINGS = 2;
/** The most linked pages read beside each one. */
const NEIGHBOURS = 5;

const TOPIC_KINDS = new Set(["PRODUCT", "POLICY", "ISSUE", "CLIENT"]);
const isTopicPage = (page: Doc<"wikiPages">) =>
  TOPIC_KINDS.has(page.kind) && !page.subjectKey.endsWith("-index") && !isKnowledgeArticlePage(page);
const asCluster = (page: Doc<"wikiPages">): ClusterPage => ({ kind: page.kind, subjectKey: page.subjectKey, excerpt: page.content.slice(0, 700) });

/** The topic pages a document taught, newest-written first, with the pages each links to. */
export const pagesTaughtByInternal = internalQuery({
  args: { companyId: v.optional(v.id("companies")), documentId: v.string(), limit: v.number() },
  handler: async (ctx, args): Promise<Array<{ page: Doc<"wikiPages">; neighbours: Array<Doc<"wikiPages">> }>> => {
    const receipts = await ctx.db
      .query("wikiPageSources")
      .withIndex("by_company_ref", (q) => q.eq("companyId", args.companyId).eq("kind", "DOCUMENT").eq("ref", args.documentId))
      .take(60);
    const pages = (await Promise.all([...new Set(receipts.map((row) => row.pageId))].map((id) => ctx.db.get(id))))
      .filter((page): page is Doc<"wikiPages"> => Boolean(page) && page!.companyId === args.companyId && isTopicPage(page!))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, args.limit);
    const out: Array<{ page: Doc<"wikiPages">; neighbours: Array<Doc<"wikiPages">> }> = [];
    for (const page of pages) {
      const neighbours: Array<Doc<"wikiPages">> = [];
      for (const link of page.links) {
        if (neighbours.length >= NEIGHBOURS) break;
        const at = link.indexOf(":");
        if (at <= 0) continue;
        const kind = link.slice(0, at) as Doc<"wikiPages">["kind"];
        if (!TOPIC_KINDS.has(kind)) continue;
        const neighbour = await ctx.db
          .query("wikiPages")
          .withIndex("by_company_kind_subject", (q) => q.eq("companyId", args.companyId).eq("kind", kind).eq("subjectKey", link.slice(at + 1)))
          .first();
        if (neighbour && neighbour._id !== page._id && isTopicPage(neighbour)) neighbours.push(neighbour);
      }
      out.push({ page, neighbours });
    }
    return out;
  },
});

/** A document has been read (or a changed one followed): settle what it now disagrees with. */
export const settleDocumentPagesInternal = internalAction({
  args: { companyId: v.optional(v.id("companies")), documentId: v.string() },
  returns: v.object({ checked: v.number(), settled: v.number(), raised: v.number() }),
  handler: async (ctx, args): Promise<{ checked: number; settled: number; raised: number }> => {
    const tally = { checked: 0, settled: 0, raised: 0 };
    // The nightly check-up's switches stand here too: either stood down, nothing is checked.
    if (!(await staffActive(ctx, "WIKI_CHECKUP")) || !(await staffActive(ctx, "WIKI_CONTRADICTION_FINDER"))) return tally;
    const taught = await ctx.runQuery(internal.wikiSettleOnArrival.pagesTaughtByInternal, {
      ...(args.companyId ? { companyId: args.companyId } : {}),
      documentId: args.documentId,
      limit: WIKI_SETTLE_ON_ARRIVAL_PAGES,
    });
    if (taught.length === 0) return tally;
    const autonomous = await ctx.runQuery(internal.wikiCheckup.isAutonomousWikiInternal, {});
    const step = { ctx, companyId: args.companyId };
    const byKey = new Map<string, Doc<"wikiPages">>();
    for (const { page, neighbours } of taught) for (const one of [page, ...neighbours]) byKey.set(`${one.kind}:${one.subjectKey}`, one);
    const checked: Array<Id<"wikiPages">> = [];
    for (const { page, neighbours } of taught) {
      if (neighbours.length === 0) continue;
      checked.push(page._id);
      tally.checked += 1;
      try {
        const findings = await findContradictions(step, [asCluster(page), ...neighbours.map(asCluster)], WIKI_SETTLE_ON_ARRIVAL_FINDINGS);
        for (const finding of findings) {
          if (!autonomous) {
            const raised = await ctx.runMutation(internal.wikiQuestions.raiseQuestionInternal, {
              ...(args.companyId ? { companyId: args.companyId } : {}),
              kind: "CONTRADICTION",
              pageKeyA: finding.pageA,
              claimA: finding.claimA,
              pageKeyB: finding.pageB,
              claimB: finding.claimB,
              dedupeKey: contradictionKey(finding),
            });
            if (raised) tally.raised += 1;
            continue;
          }
          const pageA = byKey.get(finding.pageA);
          const pageB = byKey.get(finding.pageB);
          if (!pageA || !pageB) continue;
          const outcome = await settleOne(step, { page: pageA, claim: finding.claimA }, { page: pageB, claim: finding.claimB });
          if (outcome === "SETTLED" || outcome === "KEPT_BOTH") tally.settled += 1;
        }
      } catch (error) {
        console.error("Checking a newly taught page against its neighbours failed; the nightly check-up looks again", error);
      }
    }
    if (checked.length > 0) await ctx.runMutation(internal.wikiCheckup.stampRotaInternal, { pageIds: checked, rota: "CONTRADICTIONS" });
    return tally;
  },
});
