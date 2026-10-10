import { describe, expect, test } from "vitest";
import { expectWords } from "@/src/test/seenWords";
import {
  anglesSees, answerSees, businessesSees, citedSees, demandSees, fullAnswersSees, mentionsSees, readSees, shareSees, type MentionRow,
} from "./aiAnswers";

/** What Hakken sees on the AI answers screens (discovery-detail-and-hakken-sees-plan.md §6). */
const COST = "how much does a website cost";
const SURREY = "best web design agency in surrey";
const row = (prompt: string, engine: string, lastStance: MentionRow["lastStance"], named = 0, asked = 5, lastAskedDay = "2026-10-08"): MentionRow =>
  ({ prompt, engine, asked, named, lastAskedDay, lastStance });

describe("Mentions", () => {
  test("the questions no assistant names you for, the assistant naming you least, and a warning", () => {
    const box = mentionsSees([
      row(COST, "chatgpt", "NOT_NAMED", 0, 9), row(COST, "perplexity", "NOT_NAMED"),
      row(SURREY, "chatgpt", "RECOMMENDED", 5), row(SURREY, "perplexity", "WARNED_AGAINST", 1),
      row("web design guildford", "chatgpt", "NAMED", 3), row("web design guildford", "perplexity", "NOT_NAMED"),
      row("never asked", "claude", null),
    ]);
    expect(box.says).toEqual([
      { code: "notNamed", a: 1, b: 3, text: COST },
      { code: "leastEngine", engine: "perplexity", a: 0, b: 3 },
      { code: "warned", engine: "perplexity", text: SURREY },
    ]);
    expect(box.steps).toEqual([
      { code: "seeAnswers", text: COST, link: "seeAnswers", to: { segment: "ai/answers", filters: { question: COST } } },
      { code: "readWarning", engine: "perplexity", link: "seeAnswers", to: { segment: "ai/answers", filters: { question: SURREY, engine: "perplexity" } } },
    ]);
    expectWords("aiMentions", box);
  });

  test("named on every question, and nothing answered yet", () => {
    const box = mentionsSees([row(SURREY, "chatgpt", "NAMED", 2)]);
    expect(box).toEqual({ says: [{ code: "allNamed", a: 1 }], steps: [] });
    expectWords("aiMentions", box);
    expect(mentionsSees([row(SURREY, "chatgpt", null)]).says).toEqual([{ code: "noAnswers" }]);
  });
});

describe("Full answers", () => {
  test("the newest answers naming you, and the newest that dropped you", () => {
    const box = fullAnswersSees([
      row(SURREY, "chatgpt", "RECOMMENDED", 4), row(SURREY, "perplexity", "NOT_NAMED", 2, 5, "2026-10-01"),
      row(COST, "chatgpt", "NOT_NAMED", 1, 5, "2026-10-08"), row(COST, "perplexity", "NOT_NAMED", 0),
    ]);
    expect(box.says).toEqual([
      { code: "namedIn", a: 1, b: 4 },
      { code: "dropped", a: 2, engine: "chatgpt", text: COST },
      { code: "recommended", a: 1 },
    ]);
    expect(box.steps).toEqual([{ code: "readDropped", engine: "chatgpt", text: COST, link: "seeAnswers", to: { segment: "ai/answers", filters: { question: COST, engine: "chatgpt" } } }]);
    expectWords("aiAnswers", box);
    expect(fullAnswersSees([]).says).toEqual([{ code: "noAnswers" }]);
  });
});

describe("Share of voice", () => {
  const sites = (you: number, rival: number) => [{ host: "ronins.co.uk", isYou: true, named: you }, { host: "www.brightside.co.uk", isYou: false, named: rival }];

  test("behind the leader, and the engine naming you least", () => {
    const box = shareSees([{ engine: "chatgpt", sites: sites(6, 4) }, { engine: "perplexity", sites: sites(1, 9) }]);
    expect(box.says).toEqual([{ code: "behindLeader", a: 35, b: 65, text: "www.brightside.co.uk" }, { code: "weakestEngine", engine: "perplexity", a: 10 }]);
    expect(box.steps).toEqual([
      { code: "seeLeader", text: "www.brightside.co.uk", link: "seeBusiness", to: { record: "business", key: "brightside.co.uk" } },
      { code: "seeEngine", engine: "perplexity", link: "seeMentions", to: { segment: "ai/mentions", filters: { engine: "perplexity" } } },
    ]);
    expectWords("aiShare", box);
  });

  test("leading when level; nobody named; nothing answered", () => {
    const level = shareSees([{ engine: "chatgpt", sites: sites(5, 5) }]);
    expect(level).toEqual({ says: [{ code: "youLead", a: 50 }], steps: [] });
    expectWords("aiShare", level);
    expect(shareSees([{ engine: "chatgpt", sites: sites(0, 0) }]).says).toEqual([{ code: "noneNamed" }]);
    expect(shareSees([]).says).toEqual([{ code: "noAnswers" }]);
  });
});

describe("One answer", () => {
  const brightside = { name: "Brightside Digital", host: "www.brightside.co.uk", rating: 4.9, reviews: 212, you: false };
  const ronins = { name: "Ronins", host: "ronins.co.uk", rating: 4.8, reviews: 64, you: true };

  test("where you came, who came first and what it has, and your page read but not quoted", () => {
    const box = answerSees({
      named: { place: 2, of: 3 },
      businesses: [brightside, ronins],
      read: [{ url: "https://ronins.co.uk/web-design/", yours: true, cited: false }, { url: "https://clutch.co/x", yours: false, cited: true }],
    });
    expect(box.says).toEqual([{ code: "place", a: 2, b: 3 }, { code: "firstShown", text: "Brightside Digital" }, { code: "moreReviews", text: "Brightside Digital", a: 212, b: 64 }]);
    expect(box.steps).toEqual([
      { code: "seeFirst", text: "Brightside Digital", link: "seeBusiness", to: { record: "business", key: "brightside.co.uk" } },
      { code: "fixPage", text: "/web-design/", link: "seePage", to: { record: "aiPage", key: "https://ronins.co.uk/web-design/" } },
    ]);
    expectWords("aiAnswer", box);
  });

  test("first, left out, a better rating, and nobody named", () => {
    const first = answerSees({ named: { place: 1, of: 2 }, businesses: [ronins], read: [] });
    expect(first).toEqual({ says: [{ code: "first", a: 2 }], steps: [] });
    expectWords("aiAnswer", first);
    const rated = answerSees({ named: { place: null, of: 2 }, businesses: [{ ...brightside, host: null, reviews: 10 }, ronins], read: [] });
    expect(rated.says).toEqual([{ code: "leftOut", a: 2 }, { code: "firstShown", text: "Brightside Digital" }, { code: "higherRating", text: "Brightside Digital", a: 4.9, b: 4.8 }]);
    expect(rated.steps).toEqual([]);
    expectWords("aiAnswer", rated);
    expect(answerSees({ named: { place: null, of: 0 }, businesses: [], read: [] }).says).toEqual([{ code: "noneNamed" }]);
  });
});

describe("Sources cited", () => {
  test("your pages linked, the most linked, and those no longer linked", () => {
    const box = citedSees([
      { page: "/web-design/", times: 14, lastDay: "2026-10-08" },
      { page: "/pricing/", times: 6, lastDay: "2026-08-20" },
      { page: "", times: 2, lastDay: "2026-10-01" },
    ]);
    expect(box.says).toEqual([{ code: "cited", a: 3 }, { code: "mostCited", text: "/web-design/", a: 14 }, { code: "stale", a: 1, text: "/pricing/" }]);
    expect(box.steps).toEqual([{ code: "refresh", text: "/pricing/", link: "seePage", to: { record: "page", key: "/pricing/" } }]);
    expectWords("aiSources", box);
  });

  test("all linked lately: build on the most linked; none linked: see what was read", () => {
    const box = citedSees([{ page: "", times: 1, lastDay: "2026-10-08" }]);
    expect(box.steps).toEqual([{ code: "buildOn", text: "/", link: "seePage", to: { record: "page", key: "" } }]);
    expectWords("aiSources", box);
    const none = citedSees([]);
    expect(none).toEqual({ says: [{ code: "noneCited" }], steps: [{ code: "seeRead", link: "readNotCited", to: { segment: "ai/read" } }] });
    expectWords("aiSources", none);
  });
});

describe("Fan-out queries", () => {
  const angle = (query: string, timesSeen: number, tracked: boolean, position: number | null, verdict: string | null) =>
    ({ query, queryText: query, timesSeen, tracked, position: position === null ? null : { value: position }, page: verdict ? { verdict } : null });
  const rows = [angle("web design cost uk", 9, false, 14, "NONE"), angle("web agency surrey", 12, true, 3, "ANSWERED"), angle("wordpress agency", 2, false, null, "ANSWERED")];

  test("the most repeated search not tracked, those with no page, those on page one", () => {
    const box = anglesSees({ built: true, own: true, rows });
    expect(box.says).toEqual([{ code: "untracked", a: 2, b: 3, text: "web design cost uk" }, { code: "noPage", a: 1, b: 3 }, { code: "firstPage", a: 1, b: 3 }]);
    expect(box.steps).toEqual([
      { code: "track", text: "web design cost uk", link: "untrackedQueries", to: { segment: "ai/searched", filters: { tracked: "no" } } },
      { code: "writePage", text: "web design cost uk", link: "seeSearch", to: { record: "keyword", key: "web design cost uk" } },
    ]);
    expectWords("aiSearched", box);
  });

  test("a competitor's, all tracked, none yet, not built", () => {
    const rival = anglesSees({ built: true, own: false, rows: rows.slice(1, 2) });
    expect(rival).toEqual({ says: [{ code: "competitor", a: 1, text: "web agency surrey" }, { code: "firstPage", a: 1, b: 1 }], steps: [] });
    expectWords("aiSearched", rival);
    const none = anglesSees({ built: true, own: true, rows: [rows[0], rows[2]] });
    expect(none.says[0]).toEqual({ code: "noneTracked", a: 2, text: "web design cost uk" });
    expectWords("aiSearched", none);
    const tracked = anglesSees({ built: true, own: true, rows: rows.slice(1, 2) });
    expect(tracked.says[0]).toEqual({ code: "allTracked", a: 1 });
    expectWords("aiSearched", tracked);
    expect(anglesSees({ built: true, own: true, rows: [] }).says).toEqual([{ code: "noQueries" }]);
    expect(anglesSees({ built: false, own: true, rows: [] }).says).toEqual([{ code: "notBuilt" }]);
  });
});

describe("Businesses recommended", () => {
  const business = (name: string, host: string | null, you: boolean, prompts: number, reviews: number | null) =>
    ({ name, host, you, prompts: Array.from({ length: prompts }, (_, index) => `q${index}`), reviews });

  test("answers showing businesses and you, who is shown most, and the map box it skips", () => {
    const box = businessesSees({
      answers: 6, showingBusinesses: 5, showingYou: 2, showingYouBefore: 3, inBoxSkipped: 2,
      rows: [business("Ronins", "ronins.co.uk", true, 2, 64), business("Brightside Digital", "www.brightside.co.uk", false, 4, 212), business("Hilltop", null, false, 1, 9)],
    });
    expect(box.says).toEqual([{ code: "showing", a: 5, b: 6, c: 2 }, { code: "shownMost", text: "Brightside Digital", a: 4 }, { code: "skipped", a: 2 }]);
    expect(box.steps).toEqual([
      { code: "seeShownMost", text: "Brightside Digital", link: "seeBusiness", to: { record: "business", key: "brightside.co.uk" } },
      { code: "askReviews", link: "yourReviews", to: { segment: "reviews" } },
    ]);
    expectWords("aiBusinesses", box);
  });

  test("the change on the check before; nothing read", () => {
    const box = businessesSees({ answers: 2, showingBusinesses: 1, showingYou: 1, showingYouBefore: 0, inBoxSkipped: 0, rows: [business("Ronins", "ronins.co.uk", true, 1, 64)] });
    expect(box).toEqual({ says: [{ code: "showing", a: 1, b: 2, c: 1 }, { code: "upCheck", a: 1 }], steps: [] });
    expectWords("aiBusinesses", box);
    expect(businessesSees({ answers: 0, showingBusinesses: 0, showingYou: 0, showingYouBefore: null, inBoxSkipped: 0, rows: [] }).says).toEqual([{ code: "noAnswers" }]);
  });
});

describe("Read but not cited", () => {
  const page = (url: string, whose: "YOURS" | "RIVAL" | "OTHER", read: number, cited: number) => ({ page: new URL(url).pathname, url, whose, host: new URL(url).hostname, read, cited });

  test("your win rate against rivals', the page read most and quoted least, and who wins", () => {
    const box = readSees({
      rows: [page("https://ronins.co.uk/pricing/", "YOURS", 8, 1), page("https://ronins.co.uk/", "YOURS", 2, 1), page("https://brightside.co.uk/cost/", "RIVAL", 5, 4)],
      beatsYou: { host: "clutch.co", answers: 5 },
    });
    expect(box.says).toEqual([{ code: "winRate", a: 20, b: 80 }, { code: "readMost", text: "/pricing/", a: 8, b: 1 }, { code: "beatsYou", text: "clutch.co", a: 5 }]);
    expect(box.steps).toEqual([
      { code: "fixFirstLines", text: "/pricing/", link: "seePage", to: { record: "aiPage", key: "https://ronins.co.uk/pricing/" } },
      { code: "seeWinner", text: "clutch.co", link: "seeWebsite", to: { record: "website", key: "clutch.co" } },
    ]);
    expectWords("aiRead", box);
  });

  test("no rivals read, none of yours read, nothing read", () => {
    const alone = readSees({ rows: [page("https://ronins.co.uk/", "YOURS", 2, 2)], beatsYou: null });
    expect(alone).toEqual({ says: [{ code: "winRateAlone", a: 100 }], steps: [] });
    expectWords("aiRead", alone);
    const none = readSees({ rows: [page("https://clutch.co/x", "OTHER", 3, 1)], beatsYou: null });
    expect(none).toEqual({ says: [{ code: "noneRead" }], steps: [{ code: "seeCited", link: "sourcesCited", to: { segment: "ai/sources" } }] });
    expectWords("aiRead", none);
    expect(readSees({ rows: [], beatsYou: null }).says).toEqual([{ code: "nothingRead" }]);
  });
});

describe("AI demand", () => {
  const months = (first: number, last: number, threeBefore: number) => [first, ...Array(7).fill(first), threeBefore, threeBefore, threeBefore, last];

  test("asked of AI against Google, the year's change, the rising and the most asked", () => {
    const box = demandSees({
      month: "2026-09",
      rows: [
        { keyword: "web design cost", ai: 900, aiMonths: months(600, 900, 800), google: 2900 },
        { keyword: "ai website builder", ai: 400, aiMonths: months(100, 400, 200), google: 1000 },
        { keyword: "web agency surrey", ai: null, aiMonths: [], google: 300 },
      ],
    });
    expect(box.says).toEqual([{ code: "aiAgainstGoogle", a: 1300, b: 4200 }, { code: "yearUp", a: 86 }, { code: "rising", a: 1, text: "ai website builder" }]);
    expect(box.steps).toEqual([
      { code: "answerOnPage", text: "ai website builder", link: "seeSearch", to: { record: "keyword", key: "ai website builder" } },
      { code: "checkPages", link: "yourPages", to: { segment: "your-pages" } },
    ]);
    expectWords("aiDemand", box);
  });

  test("falling on the year with nothing rising leads with the most asked; nothing bought yet", () => {
    const box = demandSees({ month: "2026-09", rows: [{ keyword: "web design cost", ai: 500, aiMonths: months(1000, 500, 600), google: 2900 }] });
    expect(box.says).toEqual([{ code: "aiAgainstGoogle", a: 500, b: 2900 }, { code: "yearDown", a: 50 }, { code: "mostAsked", text: "web design cost", a: 500 }]);
    expect(box.steps[0]).toMatchObject({ code: "answerOnPage", text: "web design cost" });
    expectWords("aiDemand", box);
    expect(demandSees({ month: null, rows: [] }).says).toEqual([{ code: "notYet" }]);
  });
});
