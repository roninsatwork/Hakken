import { v } from "convex/values";
import { tenantQuery } from "./tenantFunctions";
import { groupOwner, listHold, requireMySite } from "./siteAccess";
import { holdQuestions } from "./holdLists";
import { questionsOf, readings } from "./siteBrandRadar";
import { linkGapOf, shownMentionsOf } from "./siteWebMentions";
import { siteKindOf } from "./utils/siteKinds";
import { MAX_PROMPTS_PER_WEBSITE } from "./utils/promptLimits";
import { hostOfUrl, isOnHost, pathOfUrl } from "./utils/urlParts";
import { seen, seenValidator, toPage, toRecord, type SeenPhrase, type SeenStep } from "./utils/hakkenSees";

/**
 * Discovery's One website and One question (docs/plans/active/discovery-
 * detail-and-hakken-sees-plan.md §3, DS2–DS3; drawn as "Detail · One website"
 * and "Detail · One question in Google's AI"): a website Google's AI answers
 * quote, and one question those answers are given for — each worked out from
 * the website's monthly Brand radar reading and its rivals' (`readings`), the
 * rivals' shared links (`linkGapOf`) and the pages naming the website. Nothing
 * here is bought or stored: both read what Brand radar and Web mentions keep.
 */

const kindValidator = v.union(
  v.literal("DIRECTORY"), v.literal("REVIEWS"), v.literal("FORUM"), v.literal("NEWS"), v.literal("VIDEO"),
  v.literal("REFERENCE"), v.literal("WEBSITE"), v.literal("RIVAL"), v.literal("YOURS"),
);
type Kind = typeof kindValidator.type;

/** Kinds of website a business can be on: a listing, a review page, a story about it. */
const PLACES = new Set<Kind>(["DIRECTORY", "REVIEWS"]);

function kindFor(host: string, own: string, rivals: readonly string[]): Kind {
  if (isOnHost(host, own)) return "YOURS";
  if (rivals.some((rival) => isOnHost(host, rival))) return "RIVAL";
  return siteKindOf(host);
}

/**
 * What to do about a website quoted beside the rivals and not naming the
 * business, by its kind: be listed on a directory or review site, put a video
 * where AI finds videos, take part where people ask, be written about
 * elsewhere. None for the business's own website, a rival's or a reference.
 */
function stepFor(kind: Kind, host: string): SeenStep | null {
  const to = { url: `https://${host}` };
  if (PLACES.has(kind)) return { code: "getListed", text: host, link: "visit", to };
  if (kind === "VIDEO") return { code: "makeVideo", text: host, link: "visit", to };
  if (kind === "FORUM") return { code: "joinForum", text: host, link: "visit", to };
  if (kind === "NEWS" || kind === "WEBSITE") return { code: "getMentioned", text: host, link: "visit", to };
  return null;
}

export const websiteDetail = tenantQuery({
  args: { siteId: v.id("companyWebsites"), host: v.string() },
  returns: v.object({
    host: v.string(),
    kind: kindValidator,
    times: v.number(),
    besideYou: v.number(),
    besideRivals: v.number(),
    /** The rivals watched, by name, and those it links to. */
    rivals: v.number(),
    linksTo: v.array(v.string()),
    strength: v.union(v.number(), v.null()),
    /** How often the questions it is quoted for are asked, a month. */
    asks: v.number(),
    /** Pages on it naming the website (Web mentions). */
    namesYou: v.number(),
    questions: v.array(v.object({
      question: v.string(),
      volume: v.number(),
      named: v.array(v.object({ host: v.string(), you: v.boolean() })),
      page: v.union(v.string(), v.null()),
    })),
    pages: v.array(v.object({ url: v.string(), times: v.number(), besideYou: v.number(), besideRivals: v.number() })),
    businesses: v.array(v.object({
      host: v.string(),
      you: v.boolean(),
      /** Links to them (rivals, from their shared links); for you, whether a page on it names you. */
      on: v.union(v.literal("LINKS"), v.literal("NAMES"), v.literal("NOT_LINKED"), v.literal("UNKNOWN")),
      quotedBeside: v.number(),
    })),
    seen: seenValidator,
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const host = args.host.trim().replace(/^www\./, "").toLowerCase();
    const { readings: all } = await readings(ctx, site);
    const own = all.find((reading) => reading.you)?.website ?? site.website;
    const rivals = all.filter((reading) => !reading.you).map((reading) => reading.website);
    const rivalHosts = rivals.map((rival) => rival.host);

    let times = 0;
    let besideYou = 0;
    let besideRivals = 0;
    const quotedBeside = new Map<string, number>();
    const pages = new Map<string, { times: number; besideYou: number; besideRivals: number }>();
    const questions = new Map<string, { question: string; volume: number; named: Map<string, boolean>; page: string | null }>();
    for (const reading of all) {
      if (!reading.part) continue;
      for (const entry of questionsOf(reading.part)) {
        // Its own address only, as Websites AI cites groups them: m.youtube.com is a row of its own there.
        const onIt = [...new Set(entry.pages)].filter((url) => hostOfUrl(url) === host);
        if (onIt.length === 0) continue;
        // Counted by page quoted, as Websites AI cites counts it, so the two screens agree.
        times += onIt.length;
        if (reading.you) besideYou += onIt.length;
        else besideRivals += onIt.length;
        quotedBeside.set(reading.website.host, (quotedBeside.get(reading.website.host) ?? 0) + onIt.length);
        for (const url of onIt) {
          const page = pages.get(url) ?? { times: 0, besideYou: 0, besideRivals: 0 };
          page.times += 1;
          if (reading.you) page.besideYou += 1;
          else page.besideRivals += 1;
          pages.set(url, page);
        }
        const key = entry.question.toLowerCase();
        const row = questions.get(key) ?? { question: entry.question, volume: entry.volume, named: new Map<string, boolean>(), page: onIt[0] ?? null };
        if (entry.firstAt !== null) row.named.set(reading.website.displayHost, reading.you);
        questions.set(key, row);
      }
    }

    const gap = (await linkGapOf(ctx, own._id, rivalHosts)).get(host) ?? null;
    const linksTo = gap ? rivals.filter((rival) => gap.rivals.has(rival.host)).map((rival) => rival.displayHost) : [];
    const namesYou = ((await shownMentionsOf(ctx, own._id)) ?? []).filter((row) => isOnHost(row.host, host)).length;
    const kind = kindFor(host, own.host, rivalHosts);
    const questionRows = [...questions.values()].map((row) => ({
      question: row.question,
      volume: row.volume,
      named: [...row.named.entries()].map(([name, you]) => ({ host: name, you })),
      page: row.page,
    }));
    const businesses = [
      { host: own.displayHost, you: true, on: namesYou > 0 ? "NAMES" as const : gap ? "NOT_LINKED" as const : "UNKNOWN" as const, quotedBeside: besideYou },
      ...rivals.map((rival) => ({
        host: rival.displayHost,
        you: false,
        on: gap?.rivals.has(rival.host) ? "LINKS" as const : "UNKNOWN" as const,
        quotedBeside: quotedBeside.get(rival.host) ?? 0,
      })),
    ];

    // What Hakken sees: how it is quoted, beside whom; who it links to; whether it names the business.
    const says: Array<SeenPhrase | null> = [
      times === 0 ? { code: "notQuoted", text: host }
        : besideYou === 0 ? { code: "onlyRivals", text: host, a: times }
        : besideRivals > besideYou ? { code: "mostlyRivals", text: host, a: times, b: besideRivals, c: besideYou }
        : { code: "besideYou", text: host, a: times, c: besideYou },
      linksTo.length > 0 ? { code: "linksToRivals", a: linksTo.length, more: linksTo.join(", ") } : null,
      namesYou > 0 ? { code: "namesYou", a: namesYou } : PLACES.has(kind) ? { code: "notOnIt" } : null,
    ];
    const missing = [...questions.values()].filter((row) => !row.named.has(own.displayHost) && [...row.named.values()].some((you) => !you))
      .sort((left, right) => right.volume - left.volume)[0];
    const steps: Array<SeenStep | null> = [
      namesYou === 0 && besideRivals > 0 ? stepFor(kind, host) : null,
      missing ? { code: "answerQuestion", text: missing.question, link: "seeQuestion", to: toRecord("question", missing.question) } : null,
    ];

    return {
      host,
      kind,
      times,
      besideYou,
      besideRivals,
      rivals: rivals.length,
      linksTo,
      strength: gap?.strength ?? null,
      asks: questionRows.reduce((sum, row) => sum + row.volume, 0),
      namesYou,
      questions: questionRows,
      pages: [...pages.entries()].map(([url, row]) => ({ url, ...row })),
      businesses,
      seen: seen(says, steps),
    };
  },
});

export const questionDetail = tenantQuery({
  args: { siteId: v.id("companyWebsites"), question: v.string() },
  returns: v.object({
    question: v.string(),
    /** Whether any reading holds it: a question no longer asked of the website or its rivals is not found. */
    found: v.boolean(),
    volume: v.number(),
    month: v.union(v.string(), v.null()),
    tracked: v.boolean(),
    /** You and the rivals watched it names, in the order it names them. */
    named: v.array(v.object({ host: v.string(), you: v.boolean(), place: v.union(v.number(), v.null()), page: v.union(v.string(), v.null()) })),
    pages: v.array(v.object({ url: v.string(), host: v.string(), kind: kindValidator })),
    seen: seenValidator,
  }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const key = args.question.trim().toLowerCase();
    const { readings: all } = await readings(ctx, site);
    const own = all.find((reading) => reading.you)?.website ?? site.website;
    const rivalHosts = all.filter((reading) => !reading.you).map((reading) => reading.website.host);

    let question = args.question.trim();
    let volume = 0;
    let found = false;
    let month: string | null = null;
    const named: Array<{ host: string; you: boolean; at: number | null; page: string | null }> = [];
    const pages = new Map<string, string>();
    for (const reading of all) {
      const entry = reading.part ? questionsOf(reading.part).find((row) => row.question.toLowerCase() === key) : undefined;
      if (!entry) {
        named.push({ host: reading.website.displayHost, you: reading.you, at: null, page: null });
        continue;
      }
      found = true;
      question = entry.question;
      volume = Math.max(volume, entry.volume);
      month = month ?? reading.part?.month ?? null;
      for (const url of entry.pages) pages.set(url, hostOfUrl(url));
      const theirs = entry.pages.find((url) => isOnHost(hostOfUrl(url), reading.website.host)) ?? null;
      named.push({ host: reading.website.displayHost, you: reading.you, at: entry.firstAt, page: theirs });
    }
    const order = named.filter((row) => row.at !== null).sort((left, right) => (left.at ?? 0) - (right.at ?? 0));
    const placeOf = (row: (typeof named)[number]) => (row.at === null ? null : order.indexOf(row) + 1);
    const hold = groupOwner(site);
    const tracked = hold
      ? (await holdQuestions(ctx, listHold(site), MAX_PROMPTS_PER_WEBSITE)).some((row) => row.prompt.toLowerCase() === key)
      : false;
    const pageRows = [...pages.entries()].map(([url, host]) => ({ url, host, kind: kindFor(host, own.host, rivalHosts) }));

    // What Hakken sees: who it names, whether it quotes your page, whose pages it quotes instead.
    const you = named.find((row) => row.you);
    const first = order[0];
    const yourPage = pageRows.find((row) => row.kind === "YOURS");
    const rivalPages = pageRows.filter((row) => row.kind === "RIVAL");
    const place = pageRows.find((row) => PLACES.has(row.kind));
    const says: Array<SeenPhrase | null> = found ? [
      you && you.at !== null ? { code: "namesYou", a: volume, b: placeOf(you) ?? 0 }
        : first ? { code: "namesOther", a: volume, text: first.host }
        : { code: "namesNone", a: volume },
      yourPage ? { code: "yourPage", text: pathOfUrl(yourPage.url) } : { code: "noPage" },
      rivalPages.length > 0 ? { code: "rivalPages", a: rivalPages.length, text: rivalPages[0].url.replace(/^https?:\/\/(www\.)?/, "") } : null,
    ] : [{ code: "notFound" }];
    const steps: Array<SeenStep | null> = found ? [
      !yourPage ? { code: "answerOnPage", link: "yourPages", to: toPage("your-pages") } : null,
      place ? { code: "getListedOn", text: place.host, link: "seeWebsite", to: toRecord("website", place.host) } : null,
    ] : [];

    return {
      question,
      found,
      volume,
      month,
      tracked,
      named: [...order, ...named.filter((row) => row.at === null && row.you)].map((row) => ({ host: row.host, you: row.you, place: placeOf(row), page: row.page })),
      pages: pageRows,
      seen: seen(says, steps),
    };
  },
});
