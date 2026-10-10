import { seen, toPage, toRecord, type Seen, type SeenPhrase, type SeenStep } from "../utils/hakkenSees";
import { pathOfUrl } from "../utils/urlParts";

/**
 * What Hakken sees on the AI answers screens (docs/plans/active/discovery-
 * detail-and-hakken-sees-plan.md §6, "AI answers"): fixed rules over each
 * screen's own rows, most important first. Mentions and Share of voice keep
 * their queries' plain lists, so their screens run these rules over the rows
 * they already hold; the rest come back with their query.
 */

type Maybe<T> = T | null;
type Stance = "RECOMMENDED" | "NAMED" | "WARNED_AGAINST" | "NOT_NAMED";

/** A rival's business screen opens on its website, without the www. */
const businessKey = (host: string) => host.toLowerCase().replace(/^www\./, "");

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

const isNamed = (stance: Stance | null) => stance === "NAMED" || stance === "RECOMMENDED";

/** How each engine treated the site on each question, as of its newest answer (`readMentions`). */
export type MentionRow = {
  prompt: string;
  engine: string;
  asked: number;
  named: number;
  lastAskedDay: string | null;
  lastStance: Stance | null;
};

/** AI answers → Mentions: the questions no assistant names you for, the assistant naming you least, and a warning. */
export function mentionsSees(rows: readonly MentionRow[]): Seen {
  const answered = rows.filter((row) => row.lastStance !== null);
  if (answered.length === 0) return seen([{ code: "noAnswers" }]);
  const prompts = new Map<string, { asked: number; named: boolean }>();
  for (const row of answered) {
    const entry = prompts.get(row.prompt) ?? { asked: 0, named: false };
    prompts.set(row.prompt, { asked: entry.asked + row.asked, named: entry.named || isNamed(row.lastStance) });
  }
  // The question asked most first, where no assistant names you.
  const unnamed = [...prompts.entries()].filter(([, entry]) => !entry.named).sort((left, right) => right[1].asked - left[1].asked || left[0].localeCompare(right[0]));
  const engines = new Map<string, { answered: number; named: number }>();
  for (const row of answered) {
    const entry = engines.get(row.engine) ?? { answered: 0, named: 0 };
    engines.set(row.engine, { answered: entry.answered + 1, named: entry.named + (isNamed(row.lastStance) ? 1 : 0) });
  }
  const byShare = [...engines.entries()].sort((left, right) => left[1].named / left[1].answered - right[1].named / right[1].answered);
  const least = byShare.length > 1 && byShare[0][1].named / byShare[0][1].answered < byShare.at(-1)![1].named / byShare.at(-1)![1].answered ? byShare[0] : null;
  const warned = answered.find((row) => row.lastStance === "WARNED_AGAINST") ?? null;
  const says: Array<Maybe<SeenPhrase>> = [
    unnamed[0] ? { code: "notNamed", a: unnamed.length, b: prompts.size, text: unnamed[0][0] } : { code: "allNamed", a: prompts.size },
    least ? { code: "leastEngine", engine: least[0], a: least[1].named, b: least[1].answered } : null,
    warned ? { code: "warned", engine: warned.engine, text: warned.prompt } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    unnamed[0] ? { code: "seeAnswers", text: unnamed[0][0], link: "seeAnswers", to: toPage("ai/answers", { question: unnamed[0][0] }) } : null,
    warned ? { code: "readWarning", engine: warned.engine, link: "seeAnswers", to: toPage("ai/answers", { question: warned.prompt, engine: warned.engine }) } : null,
  ];
  return seen(says, steps);
}

/** AI answers → Full answers: the newest answers naming you, of all, and the newest that dropped you. */
export function fullAnswersSees(rows: readonly MentionRow[]): Seen {
  const answered = rows.filter((row) => row.lastStance !== null);
  if (answered.length === 0) return seen([{ code: "noAnswers" }]);
  // Named before in its window, and not in its newest answer: dropped. The newest first.
  const dropped = answered.filter((row) => row.lastStance === "NOT_NAMED" && row.named > 0).sort((left, right) => (right.lastAskedDay ?? "").localeCompare(left.lastAskedDay ?? ""));
  const recommended = answered.filter((row) => row.lastStance === "RECOMMENDED").length;
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "namedIn", a: answered.filter((row) => isNamed(row.lastStance)).length, b: answered.length },
    dropped[0] ? { code: "dropped", a: dropped.length, engine: dropped[0].engine, text: dropped[0].prompt } : null,
    recommended > 0 ? { code: "recommended", a: recommended } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    dropped[0] ? { code: "readDropped", engine: dropped[0].engine, text: dropped[0].prompt, link: "seeAnswers", to: toPage("ai/answers", { question: dropped[0].prompt, engine: dropped[0].engine }) } : null,
  ];
  return seen(says, steps);
}

/** AI answers → Share of voice: your share against the leader's, and the engine naming you least. */
export function shareSees(engines: ReadonlyArray<{ engine: string; sites: ReadonlyArray<{ host: string; isYou: boolean; named: number }> }>): Seen {
  if (engines.length === 0) return seen([{ code: "noAnswers" }]);
  const totals = new Map<string, { isYou: boolean; named: number }>();
  for (const engine of engines) {
    for (const site of engine.sites) totals.set(site.host, { isYou: site.isYou, named: (totals.get(site.host)?.named ?? 0) + site.named });
  }
  const all = [...totals.values()].reduce((sum, entry) => sum + entry.named, 0);
  if (all === 0) return seen([{ code: "noneNamed" }]);
  const you = [...totals.values()].find((entry) => entry.isYou)?.named ?? 0;
  // On a tie you lead: being level is not being behind.
  const [leaderHost, leader] = [...totals.entries()].sort((left, right) => right[1].named - left[1].named || Number(right[1].isYou) - Number(left[1].isYou))[0];
  const shareOn = (engine: (typeof engines)[number]) => {
    const total = engine.sites.reduce((sum, site) => sum + site.named, 0);
    return total > 0 ? percent(engine.sites.find((site) => site.isYou)?.named ?? 0, total) : null;
  };
  const shares = engines.flatMap((engine) => {
    const share = shareOn(engine);
    return share === null ? [] : [{ engine: engine.engine, share }];
  }).sort((left, right) => left.share - right.share);
  const weakest = shares.length > 1 && shares[0].share < shares.at(-1)!.share ? shares[0] : null;
  const says: Array<Maybe<SeenPhrase>> = [
    leader.isYou ? { code: "youLead", a: percent(you, all) } : { code: "behindLeader", a: percent(you, all), b: percent(leader.named, all), text: leaderHost },
    weakest ? { code: "weakestEngine", engine: weakest.engine, a: weakest.share } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    leader.isYou ? null : { code: "seeLeader", text: leaderHost, link: "seeBusiness", to: toRecord("business", businessKey(leaderHost)) },
    weakest ? { code: "seeEngine", engine: weakest.engine, link: "seeMentions", to: toPage("ai/mentions", { engine: weakest.engine }) } : null,
  ];
  return seen(says, steps);
}

/** AI answers → one answer: where you came, who came first and what they have, and your pages it read but did not quote. */
export function answerSees(shown: {
  named: { place: number | null; of: number };
  businesses: ReadonlyArray<{ name: string; host: string | null; rating: number | null; reviews: number | null; you: boolean }>;
  read: ReadonlyArray<{ url: string; yours: boolean; cited: boolean }>;
}): Seen {
  const first = shown.businesses[0] && !shown.businesses[0].you ? shown.businesses[0] : null;
  const yours = shown.businesses.find((business) => business.you) ?? null;
  const missed = shown.read.filter((page) => page.yours && !page.cited);
  const why: Maybe<SeenPhrase> = !first ? null
    : (first.reviews ?? 0) > (yours?.reviews ?? 0) ? { code: "moreReviews", text: first.name, a: first.reviews ?? 0, b: yours?.reviews ?? 0 }
    : first.rating !== null && first.rating > (yours?.rating ?? 0) ? { code: "higherRating", text: first.name, a: first.rating, b: yours?.rating ?? 0 }
    : null;
  const says: Array<Maybe<SeenPhrase>> = [
    shown.named.place === 1 ? { code: "first", a: shown.named.of }
    : shown.named.place !== null ? { code: "place", a: shown.named.place, b: shown.named.of }
    : shown.named.of > 0 ? { code: "leftOut", a: shown.named.of }
    : { code: "noneNamed" },
    first ? { code: "firstShown", text: first.name } : null,
    why,
    missed.length > 0 ? { code: "readNotCited", a: missed.length } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    first?.host ? { code: "seeFirst", text: first.name, link: "seeBusiness", to: toRecord("business", businessKey(first.host)) } : null,
    missed[0] ? { code: "fixPage", text: pathOfUrl(missed[0].url), link: "seePage", to: toRecord("aiPage", missed[0].url) } : null,
  ];
  return seen(says, steps);
}

/** AI answers → Sources cited: your pages the answers quote, the most quoted, and those not quoted for a month. */
export function citedSees(rows: ReadonlyArray<{ page: string; times: number; lastDay: string }>): Seen {
  if (rows.length === 0) return seen([{ code: "noneCited" }], [{ code: "seeRead", link: "readNotCited", to: toPage("ai/read") }]);
  const newest = rows.reduce((latest, row) => (row.lastDay > latest ? row.lastDay : latest), "");
  const monthBefore = new Date(Date.parse(`${newest}T00:00:00Z`) - 30 * 86_400_000).toISOString().slice(0, 10);
  const byTimes = [...rows].sort((left, right) => right.times - left.times || left.page.localeCompare(right.page));
  const stale = byTimes.filter((row) => row.lastDay < monthBefore);
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "cited", a: rows.length },
    { code: "mostCited", text: byTimes[0].page || "/", a: byTimes[0].times },
    stale.length > 0 ? { code: "stale", a: stale.length, text: stale[0].page || "/" } : null,
  ];
  // The page that stopped being quoted, or else the one quoted most, to build on.
  const step: SeenStep = stale[0]
    ? { code: "refresh", text: stale[0].page || "/", link: "seePage", to: toRecord("page", stale[0].page) }
    : { code: "buildOn", text: byTimes[0].page || "/", link: "seePage", to: toRecord("page", byTimes[0].page) };
  return seen(says, [step]);
}

/** AI answers → Fan-out queries: the most repeated you do not track, those with no page of yours, those you rank for. */
export function anglesSees(result: {
  built: boolean;
  own: boolean;
  rows: ReadonlyArray<{ query: string; queryText: string; timesSeen: number; tracked: boolean; position: { value: number | null } | null; page: { verdict: string } | null }>;
}): Seen {
  if (!result.built) return seen([{ code: "notBuilt" }]);
  if (result.rows.length === 0) return seen([{ code: "noQueries" }]);
  const byTimes = [...result.rows].sort((left, right) => right.timesSeen - left.timesSeen);
  const untracked = byTimes.filter((row) => !row.tracked);
  const noPage = byTimes.filter((row) => row.page?.verdict === "NONE");
  const firstPage = result.rows.filter((row) => row.position?.value != null && row.position.value <= 10).length;
  const says: Array<Maybe<SeenPhrase>> = [
    !result.own ? { code: "competitor", a: result.rows.length, text: byTimes[0].queryText }
    : untracked[0] ? { code: "untracked", a: untracked.length, b: result.rows.length, text: untracked[0].queryText }
    : { code: "allTracked", a: result.rows.length },
    noPage.length > 0 ? { code: "noPage", a: noPage.length, b: result.rows.length } : null,
    { code: "firstPage", a: firstPage, b: result.rows.length },
  ];
  const steps: Array<Maybe<SeenStep>> = [
    result.own && untracked[0] ? { code: "track", text: untracked[0].queryText, link: "untrackedQueries", to: toPage("ai/searched", { tracked: "no" }) } : null,
    noPage[0] ? { code: "writePage", text: noPage[0].queryText, link: "seeSearch", to: toRecord("keyword", noPage[0].query) } : null,
  ];
  return seen(says, steps);
}

/** AI answers → Businesses recommended: answers showing businesses and you, who is shown most, and the map box skipped. */
export function businessesSees(result: {
  answers: number;
  showingBusinesses: number;
  showingYou: number;
  showingYouBefore: number | null;
  inBoxSkipped: number;
  rows: ReadonlyArray<{ name: string; host: string | null; you: boolean; prompts: readonly string[]; reviews: number | null }>;
}): Seen {
  if (result.answers === 0) return seen([{ code: "noAnswers" }]);
  const most = result.rows.filter((row) => !row.you).sort((left, right) => right.prompts.length - left.prompts.length || (right.reviews ?? 0) - (left.reviews ?? 0))[0] ?? null;
  const yours = result.rows.find((row) => row.you) ?? null;
  const moved = result.showingYouBefore === null ? 0 : result.showingYou - result.showingYouBefore;
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "showing", a: result.showingBusinesses, b: result.answers, c: result.showingYou },
    most ? { code: "shownMost", text: most.name, a: most.prompts.length } : null,
    result.inBoxSkipped > 0 ? { code: "skipped", a: result.inBoxSkipped } : null,
    moved !== 0 ? { code: moved > 0 ? "upCheck" : "downCheck", a: Math.abs(moved) } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    most?.host ? { code: "seeShownMost", text: most.name, link: "seeBusiness", to: toRecord("business", businessKey(most.host)) } : null,
    most && (most.reviews ?? 0) > (yours?.reviews ?? 0) ? { code: "askReviews", link: "yourReviews", to: toPage("reviews") } : null,
  ];
  return seen(says, steps);
}

/** AI answers → Read but not cited: your pages' win rate against rivals', the page read most and cited least, who wins. */
export function readSees(result: {
  rows: ReadonlyArray<{ page: string; url: string; whose: "YOURS" | "RIVAL" | "OTHER"; read: number; cited: number }>;
  beatsYou: { host: string; answers: number } | null;
}): Seen {
  if (result.rows.length === 0) return seen([{ code: "nothingRead" }]);
  const yours = result.rows.filter((row) => row.whose === "YOURS");
  if (yours.length === 0) return seen([{ code: "noneRead" }], [{ code: "seeCited", link: "sourcesCited", to: toPage("ai/sources") }]);
  const rate = (rows: typeof result.rows) => percent(rows.reduce((sum, row) => sum + row.cited, 0), rows.reduce((sum, row) => sum + row.read, 0));
  const rivals = result.rows.filter((row) => row.whose === "RIVAL");
  const worst = [...yours].filter((row) => row.read > row.cited).sort((left, right) => right.read - right.cited - (left.read - left.cited) || right.read - left.read)[0] ?? null;
  const says: Array<Maybe<SeenPhrase>> = [
    rivals.length > 0 ? { code: "winRate", a: rate(yours), b: rate(rivals) } : { code: "winRateAlone", a: rate(yours) },
    worst ? { code: "readMost", text: worst.page, a: worst.read, b: worst.cited } : null,
    result.beatsYou ? { code: "beatsYou", text: result.beatsYou.host, a: result.beatsYou.answers } : null,
  ];
  const steps: Array<Maybe<SeenStep>> = [
    worst ? { code: "fixFirstLines", text: worst.page, link: "seePage", to: toRecord("aiPage", worst.url) } : null,
    result.beatsYou ? { code: "seeWinner", text: result.beatsYou.host, link: "seeWebsite", to: toRecord("website", result.beatsYou.host) } : null,
  ];
  return seen(says, steps);
}

/** Up a third or more in three months: rising, as the AI demand screen counts it. */
const RISING = 4 / 3;

/** AI answers → AI demand: asked of AI against Google, the year's change, the rising and the most asked. */
export function demandSees(result: {
  month: string | null;
  rows: ReadonlyArray<{ keyword: string; ai: number | null; aiMonths: readonly number[]; google: number | null }>;
}): Seen {
  const asked = result.rows.filter((row) => row.ai !== null);
  if (result.month === null || asked.length === 0) return seen([{ code: "notYet" }]);
  const ai = asked.reduce((sum, row) => sum + (row.ai ?? 0), 0);
  const google = result.rows.reduce((sum, row) => sum + (row.google ?? 0), 0);
  // The year's change: every search's months added up, the newest against eleven before.
  const months = asked.filter((row) => row.aiMonths.length === 12);
  const yearStart = months.reduce((sum, row) => sum + row.aiMonths[0], 0);
  const yearEnd = months.reduce((sum, row) => sum + row.aiMonths[11], 0);
  const change = yearStart > 0 ? percent(yearEnd - yearStart, yearStart) : 0;
  const rising = asked
    .filter((row) => row.aiMonths.length >= 4 && row.aiMonths.at(-4)! > 0 && row.aiMonths.at(-1)! / row.aiMonths.at(-4)! >= RISING)
    .sort((left, right) => (right.ai ?? 0) - (left.ai ?? 0));
  const most = [...asked].sort((left, right) => (right.ai ?? 0) - (left.ai ?? 0))[0];
  const says: Array<Maybe<SeenPhrase>> = [
    { code: "aiAgainstGoogle", a: ai, b: google },
    change !== 0 ? { code: change > 0 ? "yearUp" : "yearDown", a: Math.abs(change) } : null,
    rising[0] ? { code: "rising", a: rising.length, text: rising[0].keyword } : null,
    { code: "mostAsked", text: most.keyword, a: most.ai ?? 0 },
  ];
  const lead = rising[0] ?? most;
  const steps: Array<Maybe<SeenStep>> = [
    { code: "answerOnPage", text: lead.keyword, link: "seeSearch", to: toRecord("keyword", lead.keyword) },
    { code: "checkPages", link: "yourPages", to: toPage("your-pages") },
  ];
  return seen(says, steps);
}
