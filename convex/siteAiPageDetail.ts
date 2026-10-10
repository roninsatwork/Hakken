import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { tenantQuery } from "./tenantFunctions";
import { myRivals, requireMySite } from "./siteAccess";
import { appAnswers } from "./siteAiApps";
import { citedSourcesOf } from "./siteAnswers";
import { questionsOf, readings } from "./siteBrandRadar";
import { siteKindOf } from "./utils/siteKinds";
import { hostOfUrl, isOnHost, pageKeyOfUrl, pathOfUrl } from "./utils/urlParts";
import { seen, seenValidator, toRecord, type SeenPhrase, type SeenStep } from "./utils/hakkenSees";

/**
 * Discovery → One page (docs/plans/active/discovery-detail-and-hakken-sees-
 * plan.md §3, DS2–DS3; drawn as "Detail · One page"): a page the ChatGPT app
 * read while answering the website's questions, or Google's AI answers quote
 * — every answer that read it and whether it cited it, the pages cited in its
 * place, and the Brand radar questions it is quoted for. Worked out from each
 * question's newest answers read from the app (`appAnswers`, as Read but not
 * cited reads them) and the Brand radar readings; nothing bought or stored.
 */

const whoseValidator = v.union(v.literal("YOURS"), v.literal("RIVAL"), v.literal("OTHER"));
type Whose = typeof whoseValidator.type;

export const aiPageDetail = tenantQuery({
  args: { siteId: v.id("companyWebsites"), url: v.string() },
  returns: v.object({
    url: v.string(),
    host: v.string(),
    path: v.string(),
    whose: whoseValidator,
    read: v.number(),
    cited: v.number(),
    answers: v.array(v.object({ question: v.string(), day: v.string(), answerId: v.id("aiAnswerTexts"), cited: v.boolean() })),
    instead: v.array(v.object({ url: v.string(), host: v.string(), whose: whoseValidator, times: v.number(), wins: v.union(v.number(), v.null()) })),
    questions: v.array(v.object({ question: v.string(), volume: v.number(), you: v.union(v.number(), v.null()) })),
    seen: seenValidator,
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const key = pageKeyOfUrl(args.url);
    const own = site.website.host;
    const rivals = (await myRivals(ctx, site)).map((rival) => rival.website.host);
    const whoseOf = (host: string): Whose => (isOnHost(host, own) ? "YOURS" : rivals.some((rival) => isOnHost(host, rival)) ? "RIVAL" : "OTHER");

    // Every answer read from the app: which read this page, and what each cited.
    const answers: Array<{ question: string; day: string; answerId: Id<"aiAnswerTexts">; cited: boolean }> = [];
    const instead = new Map<string, { url: string; times: number }>();
    const pageRead = new Map<string, number>();
    const pageCited = new Map<string, number>();
    let url = args.url;
    for (const list of (await appAnswers(ctx, site)).values()) {
      for (const answer of list) {
        const sources = await citedSourcesOf(ctx, answer.pullId);
        const citedKeys = new Set(sources.map(pageKeyOfUrl));
        for (const read of answer.extras.read) {
          const readKey = pageKeyOfUrl(read);
          pageRead.set(readKey, (pageRead.get(readKey) ?? 0) + 1);
          if (citedKeys.has(readKey)) pageCited.set(readKey, (pageCited.get(readKey) ?? 0) + 1);
        }
        const readIt = answer.extras.read.find((read) => pageKeyOfUrl(read) === key);
        if (!readIt) continue;
        url = readIt;
        const cited = citedKeys.has(key);
        answers.push({ question: answer.prompt, day: answer.day, answerId: answer.textId, cited });
        if (cited) continue;
        for (const source of sources) {
          const sourceKey = pageKeyOfUrl(source);
          if (sourceKey === key) continue;
          const row = instead.get(sourceKey) ?? { url: source, times: 0 };
          row.times += 1;
          instead.set(sourceKey, row);
        }
      }
    }

    // The Brand radar questions Google's AI quotes it for, and where you came in each.
    const { readings: all } = await readings(ctx, site);
    const byQuestion = new Map<string, { question: string; volume: number; quotes: boolean; named: Array<{ you: boolean; at: number }> }>();
    for (const reading of all) {
      if (!reading.part) continue;
      for (const entry of questionsOf(reading.part)) {
        const row = byQuestion.get(entry.question.toLowerCase()) ?? { question: entry.question, volume: entry.volume, quotes: false, named: [] };
        if (entry.pages.some((page) => pageKeyOfUrl(page) === key)) row.quotes = true;
        if (entry.firstAt !== null) row.named.push({ you: reading.you, at: entry.firstAt });
        byQuestion.set(entry.question.toLowerCase(), row);
      }
    }
    const questions = [...byQuestion.values()].filter((row) => row.quotes).map((row) => {
      const order = [...row.named].sort((left, right) => left.at - right.at);
      const place = order.findIndex((entry) => entry.you);
      return { question: row.question, volume: row.volume, you: place >= 0 ? place + 1 : null };
    });

    const host = hostOfUrl(url);
    const whose = whoseOf(host);
    const cited = answers.filter((answer) => answer.cited).length;
    const insteadRows = [...instead.entries()]
      .map(([sourceKey, row]) => ({
        url: row.url,
        host: hostOfUrl(row.url),
        whose: whoseOf(hostOfUrl(row.url)),
        times: row.times,
        wins: pageRead.get(sourceKey) ? (pageCited.get(sourceKey) ?? 0) / (pageRead.get(sourceKey) ?? 1) : null,
      }))
      .sort((left, right) => right.times - left.times);

    // What Hakken sees: how often it was read and cited, what won in its place, and what to do.
    const top = insteadRows[0];
    const says: Array<SeenPhrase | null> = [
      answers.length === 0 ? { code: "notRead" }
        : cited === 0 ? { code: "readNeverCited", a: answers.length }
        : cited < answers.length ? { code: "readCitedSome", a: answers.length, b: cited }
        : { code: "alwaysCited", a: answers.length },
      top ? { code: "citedInstead", text: pageKeyOfUrl(top.url), a: top.times } : null,
      questions.length > 0 ? { code: "googleQuotes", a: questions.length } : null,
    ];
    const listing = insteadRows.find((row) => ["DIRECTORY", "REVIEWS"].includes(siteKindOf(row.host)));
    const steps: Array<SeenStep | null> = [
      whose === "YOURS" && cited < answers.length ? { code: "firstLines", link: "seePage", to: toRecord("page", pathOfUrl(url)) } : null,
      whose !== "YOURS" && answers.length > 0 ? { code: "answerBetter", link: "yourPages", to: { segment: "your-pages" } } : null,
      listing ? { code: "getListedOn", text: listing.host, link: "seeWebsite", to: toRecord("website", listing.host) } : null,
    ];

    return {
      url,
      host,
      path: pathOfUrl(url),
      whose,
      read: answers.length,
      cited,
      answers,
      instead: insteadRows,
      questions,
      seen: seen(says, steps),
    };
  },
});
