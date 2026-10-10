import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { answerPlace } from "./seoAiEngines";
import { listHold, myRivals, requireMySite } from "./siteAccess";
import { holdQuestions } from "./holdLists";
import { holdBrandNames } from "./holdProfiles";
import { citedSourcesOf } from "./siteAnswers";
import { tenantQuery } from "./tenantFunctions";
import { listingsById, localSetup, officeChecks, officeSearches } from "./localReads";
import { MAX_PROMPTS_PER_WEBSITE } from "./utils/promptLimits";
import { readFanOutLimits } from "./fanOutLimits";
import type { Site } from "./websiteSiteRows";

/**
 * Discovery → AI answers → Businesses recommended and Read but not cited
 * (docs/plans/active/discovery-local-reputation-ai-plan.md, step 3, D5, D18):
 * what the ChatGPT app put in front of people for a website's questions — the
 * businesses beside its answers, and the pages it read before choosing which
 * to cite — over each question's newest few answers read from the app, every
 * figure worked out here (rule 4) from what was kept with each answer
 * (`aiAnswerExtras`).
 */

type Reader = { db: QueryCtx["db"] };
/** Each question's newest answers read: the last check, the one before, and two more for a business's usual place. */
const ANSWERS_READ = 4;
/** The one app that shows businesses and the pages it read. */
const ENGINE = "chatgpt" as const;

type AppAnswer = { prompt: string; day: string; extras: Doc<"aiAnswerExtras">; pullId: Id<"seoDataPulls">; textId: Id<"aiAnswerTexts"> };

/** Each of a website's questions' newest answers read from the app, newest first. */
export async function appAnswers(ctx: Reader, site: Site, read = ANSWERS_READ): Promise<Map<string, AppAnswer[]>> {
  const owner = site.hold;
  const limits = await readFanOutLimits(ctx, owner.companyId, owner._id);
  const questions = await holdQuestions(ctx, listHold(site), Math.min(MAX_PROMPTS_PER_WEBSITE, limits.promptsPerSite), { activeOnly: true });
  const byQuestion = new Map<string, AppAnswer[]>();
  for (const question of questions.filter((entry) => entry.engines.includes(ENGINE))) {
    const index = await ctx.db
      .query("aiAnswerIndex")
      .withIndex("by_question", (q) => q.eq("prompt", question.prompt).eq("engine", ENGINE).eq("locationCode", answerPlace(ENGINE, site.place)))
      .order("desc")
      .take(read);
    const answers: AppAnswer[] = [];
    for (const row of index) {
      const extras = await ctx.db.query("aiAnswerExtras").withIndex("by_pull", (q) => q.eq("pullId", row.pullId)).first();
      if (extras) answers.push({ prompt: question.prompt, day: row.day, extras, pullId: row.pullId, textId: row.textId });
    }
    byQuestion.set(question.prompt, answers);
  }
  return byQuestion;
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
};
const pathOf = (url: string) => {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname}`;
  } catch {
    return url;
  }
};
const sameHost = (candidate: string | null | undefined, host: string) => Boolean(candidate && (candidate === host || candidate.endsWith(`.${host}`)));
const normalName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export const businessesRecommended = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.object({
    questions: v.array(v.string()),
    /** The newest answer of each question, read from the app. */
    answers: v.number(),
    showingBusinesses: v.number(),
    showingYou: v.number(),
    showingYouBefore: v.union(v.number(), v.null()),
    inBoxSkipped: v.number(),
    town: v.union(v.string(), v.null()),
    rows: v.array(v.object({
      name: v.string(),
      host: v.union(v.string(), v.null()),
      you: v.boolean(),
      /** The questions whose newest answer showed it. */
      prompts: v.array(v.string()),
      usualPlace: v.union(v.number(), v.null()),
      rating: v.union(v.number(), v.null()),
      reviews: v.union(v.number(), v.null()),
      map: v.union(v.literal("BOX"), v.literal("BELOW"), v.literal("OFF"), v.literal("UNKNOWN")),
      boxSearches: v.number(),
    })),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const byQuestion = await appAnswers(ctx, site);
    const host = site.website.host;
    const names = (await holdBrandNames(ctx, site.hold._id)).map((entry) => normalName(entry.name)).filter((name) => name.length > 2);
    const isYou = (business: { name: string; host?: string }) => sameHost(business.host, host) || names.some((name) => normalName(business.name).includes(name));

    const latest = [...byQuestion.values()].flatMap((answers) => answers.slice(0, 1));
    const before = [...byQuestion.values()].flatMap((answers) => answers.slice(1, 2));
    const rows = new Map<string, { name: string; host: string | null; you: boolean; prompts: Set<string>; places: number[]; rating: number | null; reviews: number | null }>();
    for (const answer of byQuestion.values()) {
      answer.forEach((entry, at) => entry.extras.businesses.forEach((business, place) => {
        const key = business.host ?? normalName(business.name);
        const row = rows.get(key) ?? { name: business.name, host: business.host ?? null, you: isYou(business), prompts: new Set<string>(), places: [], rating: business.rating ?? null, reviews: business.reviews ?? null };
        if (at === 0) row.prompts.add(entry.prompt);
        row.places.push(place + 1);
        rows.set(key, row);
      }));
    }

    // Where each sits on Google Maps for the website's tracked searches, from its first office.
    const setup = await localSetup(ctx, site);
    const office = setup.offices[0] ?? null;
    const boxBy = new Map<string, { box: number; seen: boolean }>();
    let inBoxYou = 0;
    if (office) {
      const checks = await officeChecks(ctx, office, await officeSearches(ctx, site, office, setup.offices), false);
      const listings = await listingsById(ctx, [...checks.values()].flatMap((check) => check.latest.listingIds));
      for (const check of checks.values()) {
        if (check.place >= 1 && check.place <= 3) inBoxYou += 1;
        check.latest.listingIds.forEach((id, at) => {
          const listing = listings.get(id);
          if (!listing) return;
          for (const key of [listing.websiteHost, normalName(listing.name)].filter((entry): entry is string => Boolean(entry))) {
            const held = boxBy.get(key) ?? { box: 0, seen: false };
            held.seen = true;
            if (at < 3) held.box += 1;
            boxBy.set(key, held);
          }
        });
      }
    }
    const shownYou = (answers: AppAnswer[]) => answers.filter((answer) => answer.extras.businesses.some(isYou)).length;
    return {
      questions: [...byQuestion.keys()],
      answers: latest.length,
      showingBusinesses: latest.filter((answer) => answer.extras.businesses.length > 0).length,
      showingYou: shownYou(latest),
      showingYouBefore: before.length > 0 ? shownYou(before) : null,
      // The searches where the office is in the map box, while no newest answer shows it.
      inBoxSkipped: shownYou(latest) === 0 ? inBoxYou : 0,
      town: office?.town ?? null,
      rows: [...rows.values()].map((row) => {
        const map = office ? (boxBy.get(row.host ?? "") ?? boxBy.get(normalName(row.name))) : undefined;
        return {
          name: row.name,
          host: row.host,
          you: row.you,
          prompts: [...row.prompts],
          usualPlace: row.places.length > 0 ? row.places.reduce((sum, place) => sum + place, 0) / row.places.length : null,
          rating: row.rating,
          reviews: row.reviews,
          map: !office ? "UNKNOWN" as const : !map ? "OFF" as const : map.box > 0 ? "BOX" as const : "BELOW" as const,
          boxSearches: map?.box ?? 0,
        };
      }),
    };
  },
});

export const readNotCited = tenantQuery({
  args: { siteId: v.id("companyWebsites") },
  returns: v.object({
    questions: v.number(),
    rows: v.array(v.object({
      page: v.string(),
      url: v.string(),
      whose: v.union(v.literal("YOURS"), v.literal("RIVAL"), v.literal("OTHER")),
      host: v.string(),
      read: v.number(),
      cited: v.number(),
    })),
    /** Who was cited most in the answers that read one of the website's pages. */
    beatsYou: v.union(v.null(), v.object({ host: v.string(), answers: v.number() })),
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const byQuestion = await appAnswers(ctx, site);
    const host = site.website.host;
    const rivals = (await myRivals(ctx, site)).map((rival) => rival.website.host);
    const whose = (pageHost: string) => (sameHost(pageHost, host) ? "YOURS" as const : rivals.some((rival) => sameHost(pageHost, rival)) ? "RIVAL" as const : "OTHER" as const);
    const pages = new Map<string, { page: string; url: string; host: string; read: number; cited: number }>();
    const beats = new Map<string, number>();
    let questions = 0;
    for (const answers of byQuestion.values()) {
      if (answers.length > 0) questions += 1;
      for (const answer of answers) {
        const cited = new Set((await citedSourcesOf(ctx, answer.pullId)).map(pathOf));
        let readYours = false;
        // Each page once an answer: two addresses of one page (a tracking code apart) are one read.
        const readOnce = new Map(answer.extras.read.map((url) => [pathOf(url), url]));
        for (const [page, url] of readOnce) {
          const pageHost = hostOf(url);
          const row = pages.get(page) ?? { page, url, host: pageHost, read: 0, cited: 0 };
          row.read += 1;
          if (cited.has(page)) row.cited += 1;
          pages.set(page, row);
          if (whose(pageHost) === "YOURS") readYours = true;
        }
        if (readYours) {
          for (const page of new Set([...cited].map((entry) => entry.split("/")[0]))) {
            if (whose(page) !== "YOURS") beats.set(page, (beats.get(page) ?? 0) + 1);
          }
        }
      }
    }
    const top = [...beats.entries()].sort((left, right) => right[1] - left[1])[0];
    return {
      questions,
      rows: [...pages.values()].map((row) => ({ ...row, whose: whose(row.host) })),
      beatsYou: top ? { host: top[0], answers: top[1] } : null,
    };
  },
});
