import { v } from "convex/values";

import { superAdminQuery } from "./tenantFunctions";
import { aiEngineValidator, answerPlace } from "./seoAiEngines";
import { includesSearchTerm, normalizeSearchTerm } from "./adminQueryService";
import { appError } from "./utils/appError";
import { pairedOwnedHold } from "./utils/websitePairing";
import type { Id } from "./_generated/dataModel";

/**
 * What the AI engines said, for one of a company's websites.
 *
 * One row per answer: the question, the engine, the day, whether this website
 * was named and where, and everyone else who was. The last column is the
 * reason the feature sells.
 *
 * **Paged by answer, and read only for the page.** It used to read the
 * company's last five hundred cycle lines, then every AI pull they pointed at,
 * then up to 250 mention rows for each — as much as 125,000 documents to show
 * fifteen rows, re-run whenever any of them changed. It now reads `aiAnswers`,
 * one row per answer, newest first for each of the site's questions and
 * engines at this watcher's place, merges just enough of them to cut the page,
 * and reads the mention detail for those fifteen alone.
 *
 * **Still entered through the company's own hold.** The hold names the website,
 * the website names its questions, and the watcher's place picks their
 * answers — nothing starts from the shared answer table and walks outward to
 * find who asked. An answer names whoever it names; which client asked is the
 * one thing that never appears.
 */

const namedShape = v.object({
  text: v.string(),
  websiteId: v.union(v.id("websites"), v.null()),
  /** Set for a brand match; absent for a cited source. */
  variantKind: v.optional(v.union(v.literal("NAME"), v.literal("MISSPELLING"))),
  kind: v.union(v.literal("BRAND"), v.literal("SOURCE")),
  stance: v.optional(v.union(
    v.literal("RECOMMENDED"), v.literal("MENTIONED"), v.literal("WARNED_AGAINST"),
  )),
});

export const listCompanyWebsiteCitations = superAdminQuery({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    searchTerm: v.optional(v.string()),
    page: v.number(),
    pageSize: v.number(),
  },
  returns: v.object({
    data: v.array(v.object({
      _id: v.id("seoDataPulls"),
      prompt: v.string(),
      engine: aiEngineValidator,
      day: v.string(),
      /** Where this website was named, from 1, or null when it was not. */
      ourPosition: v.union(v.number(), v.null()),
      ourVariantKind: v.optional(v.union(v.literal("NAME"), v.literal("MISSPELLING"))),
      /** How the answer treated this website, when it was judged. */
      ourStance: v.optional(v.union(
        v.literal("RECOMMENDED"), v.literal("MENTIONED"), v.literal("WARNED_AGAINST"),
      )),
      /** Everyone else the answer named or cited, in order. */
      others: v.array(namedShape),
      status: v.string(),
    })),
    totalCount: v.number(),
    totalPages: v.number(),
  }),
  handler: async (ctx, args) => {
    const companyWebsite = await ctx.db.get(args.companyWebsiteId);
    if (!companyWebsite) throw appError("NOT_FOUND", "That website is no longer held by this company.");
    const pair = await pairedOwnedHold(ctx, companyWebsite);
    const watcherPlace = (pair ?? companyWebsite).locationCode;

    const questions = await ctx.db
      .query("websiteQuestions")
      .withIndex("by_website", (q) => q.eq("websiteId", companyWebsite.websiteId))
      .take(MAX_QUESTIONS);
    const asked = questions.flatMap((question) => question.engines.map((engine) => ({
      prompt: question.prompt,
      engine,
      place: answerPlace(engine, watcherPlace),
    })));

    // Enough of each question's newest answers to be sure of this page once
    // they are merged — or, when searching, a bounded recent window to search.
    const term = normalizeSearchTerm(args.searchTerm ?? "");
    const want = Math.min(term ? SEARCH_WINDOW : args.page * args.pageSize, MAX_PER_QUESTION);
    const perQuestion = await Promise.all(asked.map((key) =>
      ctx.db
        .query("aiAnswers")
        .withIndex("by_question", (q) =>
          q.eq("prompt", key.prompt).eq("engine", key.engine).eq("locationCode", key.place))
        .order("desc")
        .take(want)));
    let answers = perQuestion.flat()
      .sort((left, right) => right.day.localeCompare(left.day) || right._creationTime - left._creationTime);

    let totalCount: number;
    if (term) {
      // A search reads the names the answers put forward, from the websites
      // they matched — each looked up once, however many answers named it.
      const hosts = new Map<Id<"websites">, string>();
      const hostOf = async (websiteId: Id<"websites">) => {
        if (!hosts.has(websiteId)) hosts.set(websiteId, (await ctx.db.get(websiteId))?.displayHost ?? "");
        return hosts.get(websiteId)!;
      };
      const kept = [];
      for (const answer of answers) {
        if (includesSearchTerm(answer.prompt, term)) {
          kept.push(answer);
          continue;
        }
        for (const websiteId of answer.named) {
          if (includesSearchTerm(await hostOf(websiteId), term)) {
            kept.push(answer);
            break;
          }
        }
      }
      answers = kept;
      totalCount = kept.length;
    } else {
      // The whole count, from the summaries rather than from reading every
      // answer: each question's summary already knows how often it was asked.
      const summaries = await Promise.all(asked.map((key) =>
        ctx.db
          .query("websiteQuestionStats")
          .withIndex("by_key", (q) =>
            q.eq("websiteId", companyWebsite.websiteId).eq("prompt", key.prompt).eq("engine", key.engine)
              .eq("locationCode", key.place))
          .unique()));
      totalCount = Math.max(
        summaries.reduce((sum, summary) => sum + (summary?.asked ?? 0), 0),
        answers.length,
      );
    }

    const start = (args.page - 1) * args.pageSize;
    const pageAnswers = answers.slice(start, start + args.pageSize);

    const data = await Promise.all(pageAnswers.map(async (answer) => {
      const [pull, mentions] = await Promise.all([
        ctx.db.get(answer.pullId),
        ctx.db
          .query("aiCitations")
          .withIndex("by_pull", (q) => q.eq("pullId", answer.pullId))
          .take(MAX_MENTIONS),
      ]);

      const ours = mentions.find((row) =>
        row.kind === "BRAND" && row.mentionedWebsiteId === companyWebsite.websiteId);

      const others = [];
      const seen = new Set<string>();
      for (const row of mentions) {
        if (row.mentionedWebsiteId === companyWebsite.websiteId) continue;
        const key = `${row.kind}:${row.mentionedText.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        others.push({
          text: row.mentionedText,
          ...(row.stance ? { stance: row.stance } : {}),
          websiteId: row.mentionedWebsiteId ?? null,
          ...(row.variantKind ? { variantKind: row.variantKind } : {}),
          kind: row.kind,
        });
      }

      return {
        _id: answer.pullId,
        prompt: answer.prompt,
        engine: answer.engine,
        day: answer.day,
        ourPosition: ours?.position ?? null,
        ...(ours?.variantKind ? { ourVariantKind: ours.variantKind } : {}),
        ...(ours?.stance ? { ourStance: ours.stance } : {}),
        others,
        status: pull?.status ?? "READY",
      };
    }));

    return {
      data,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / args.pageSize)),
    };
  },
});

/** A site's questions read for its answers: the list at its ceiling on screen. */
const MAX_QUESTIONS = 200;

/** Answers read per question and engine: a page's worth, never the whole history. */
const MAX_PER_QUESTION = 300;

/** Recent answers per question searched when a search term is given. */
const SEARCH_WINDOW = 100;

/** Mentions read per answer. An engine names a handful, never hundreds. */
const MAX_MENTIONS = 250;
