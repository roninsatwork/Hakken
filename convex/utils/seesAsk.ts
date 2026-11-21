import { v } from "convex/values";
import type { InsightsRole } from "./agentRoles";
import { ANALYTICS_READ } from "./agentTools";
import { fillFacts, namedFacts, type Fact } from "./insightFacts";
import { typedNumbers } from "./insightEditor";
import { seesScreenFor, sourceOfSection } from "./sees/screens";
import { beforeOf } from "../searchConsoleDays";
import { isCalendarPeriod, periodBounds } from "./calendarPeriods";

/**
 * What Hakken sees, written by the Insights team when the eye is pressed
 * (docs/plans/active/sees-conversion-specialist-plan-2026-10-30.md, S1–S12;
 * conversions-and-agents-build-plan-2026-10-30.md, phase 5). No database
 * here: the shapes, the words the agents are given, and the Editor's code
 * checks on what they wrote. `convex/seesAsk.ts` saves and reads;
 * `convex/seesAskActions.ts` asks.
 */

/**
 * An answer is shown again for this long while nothing on the page changed (S3): a day, as a page's figures change only with
 * each night's collection, and new figures still write new words at once (Anthony, 2026-11-07: "cache the answer until midnight
 * as the data won't change that often"; kept until the figures change instead, so a press never pays twice around midnight;
 * eye-code-first-brief-plan-2026-11-07.md). A super admin's Refresh writes again whenever it's pressed. Three hours until then.
 */
export const SEES_KEPT_MS = 24 * 60 * 60 * 1000;
/** A write still going this long after it was asked is believed; past it, the next press asks again. */
export const SEES_WRITING_MS = 10 * 60 * 1000;
/** Sentences and steps a bubble holds at most (Anthony, 2026-10-30: "im happy for the advice to be twice as much as we show now"). */
export const MOST_SEES_SAYS = 6;
export const MOST_SEES_STEPS = 4;
/** A sentence a client reads at a glance (S7; 2026-10-30, "a wall of numbers"): longer ones go back. */
export const MOST_SENTENCE_WORDS = 20;
/** Figures a sentence names at most, and a bubble's sentences in all: past these it is a list of numbers, not advice. */
export const MOST_SENTENCE_FIGURES = 2;
export const MOST_BUBBLE_FIGURES = 8;

/**
 * What each screen shows, part by part, for the specialist to cover before it digs (Anthony, 2026-10-30, agreeing:
 * "cover the page before digging"). The page's own layout, never a list of findings: kept in the screen list
 * (`utils/sees/screens.ts`) with the rest of what each page is.
 */
export function pageParts(screen: string): string[] {
  return [...(seesScreenFor(screen)?.parts ?? [])];
}

/** Words the Analytics screens never use, which a reader would not know: the page's own names instead. */
const ANALYTICS_JARGON = /\b(clicks?|sessions?|users?|CTR|bounce rate|event counts?|engagement rate)\b/i;
/** Facts a page hands over at most: the page's figures, never a list of everything held. */
export const MOST_SEES_FACTS = 160;

/** Where a step may send the reader: the page names them, the agent only picks. */
export const seesLinkValidator = v.object({ label: v.string(), href: v.string() });
export type SeesLink = { label: string; href: string };

/** What a page hands over when its eye is pressed (S4): its name, its figures as facts, and where its steps may lead. */
export const seesAskValidator = {
  siteId: v.id("companyWebsites"),
  /** The screen, as its words are keyed: "googleAnalytics.conversions", "googleAnalytics.event:purchase". */
  screen: v.string(),
  /** What the page is, in words, for the Head: "Conversions: every conversion this website counts, for last month". */
  about: v.string(),
  path: v.string(),
  period: v.string(),
  from: v.optional(v.string()),
  to: v.optional(v.string()),
  country: v.string(),
  device: v.string(),
  facts: v.array(v.object({
    key: v.string(),
    value: v.number(),
    unit: v.union(v.literal("count"), v.literal("money"), v.literal("percent"), v.literal("position"), v.literal("seconds"), v.literal("score"), v.literal("ratio")),
    label: v.string(),
    currency: v.optional(v.string()),
  })),
  links: v.array(seesLinkValidator),
  shop: v.optional(v.boolean()),
  /**
   * The page's own figures as it shows them — the answer of the query that draws it, cut to its first rows
   * (`utils/sees/pageData.ts`) — for a page with no facts of its own (sees-every-page-plan-2026-10-31.md, phase 1).
   */
  data: v.optional(v.any()),
};

/**
 * The address fields that name the one record a screen is about: a page's own screen (`all-pages/page?key=~fu`), an
 * event's, a channel's, a search's or a tracking check's (`?key=`), the pages behind one square of the Conversions map
 * (`?event=…&by=…&key=…`), one AI question (`?question=`). Every other field is a filter or a view, never a record.
 */
const RECORD_FIELDS = ["key", "event", "by", "question"] as const;

/**
 * The record a screen's address names, as `field=value` pairs (`key=~fu`), or "" for a screen about no one record
 * (page-screen-redo-plan-2026-11-03.md, step 2: every page's own screen shared one saved answer, and a press on page B
 * wrote over page A's words).
 */
export function seesRecord(path: string): string {
  const at = path.indexOf("?");
  if (at < 0) return "";
  const query = new URLSearchParams(path.slice(at + 1));
  return RECORD_FIELDS.flatMap((field) => {
    const value = query.get(field);
    return value ? [`${field}=${value}`] : [];
  }).join("&").replace(/\|/g, "").slice(0, 200);
}

/** A screen's address as the eye hands it on: its path, and of its query only the record it is about (`seesRecord`). */
export function seesPath(pathname: string, search: string): string {
  const query = new URLSearchParams(search.replace(/^\?/, ""));
  const text = RECORD_FIELDS.flatMap((field) => {
    const value = query.get(field);
    return value ? [`${field}=${encodeURIComponent(value)}`] : [];
  }).join("&");
  return text ? `${pathname}?${text}` : pathname;
}

/** A key read back into its parts: the screen and the record it is about, its dates, country and device (`seesKey`'s other way). */
export function fromSeesKey(key: string): { screen: string; record?: string; period: string; from?: string; to?: string; country: string; device: string } {
  const parts = key.split("|");
  const [period, from, to, country, device] = parts.slice(-5);
  const head = parts.slice(0, -5).join("|");
  const at = head.indexOf("?");
  const screen = at < 0 ? head : head.slice(0, at);
  const record = at < 0 ? "" : head.slice(at + 1);
  return { screen, ...(record ? { record } : {}), period: period ?? "", ...(from ? { from } : {}), ...(to ? { to } : {}), country: country ?? "", device: device ?? "" };
}

/**
 * One answer for one website, page, record, dates, country and device (S9): change any and it is written afresh. The
 * record comes from the screen's address (`path`'s `?key=`), so each page's own screen keeps its own words.
 */
export function seesKey(ask: { screen: string; path?: string; period: string; from?: string; to?: string; country: string; device: string }): string {
  const record = ask.path ? seesRecord(ask.path) : "";
  return [record ? `${ask.screen}?${record}` : ask.screen, ask.period, ask.from ?? "", ask.to ?? "", ask.country, ask.device].join("|");
}

/** The page's facts as the team's (`Fact`): its section's figures, the home country's, over the dates shown. */
export function factsOf(ask: { screen?: string; facts: ReadonlyArray<{ key: string; value: number; unit: Fact["unit"]; label: string; currency?: string }>; from?: string; to?: string; country: string }): Fact[] {
  const section = ask.screen ? seesScreenFor(ask.screen)?.section : undefined;
  return ask.facts.slice(0, MOST_SEES_FACTS).map((fact) => ({
    key: fact.key,
    value: fact.value,
    unit: fact.unit,
    source: section ? sourceOfSection(section) : ("analytics" as const),
    label: fact.label,
    ...(ask.from ? { from: ask.from } : {}),
    ...(ask.to ? { to: ask.to } : {}),
    ...(ask.country ? { country: ask.country } : {}),
    ...(fact.currency ? { currency: fact.currency } : {}),
  }));
}

/**
 * What a specialist answers with for the bubble (S5, S7): the shape is fixed
 * in code so the Editor can check it, and the plain-words rule is said again
 * here because a bubble is read in two seconds.
 */
export const SEES_FORMAT = [
  "A reader pressed the eye on one page of the app and will read your words in a speech bubble. Find what this website's figures show that a person looking at the page would miss: look across everything you were given, compare the groups against each other and against the span before, and say what matters most, each with the figures that show it. Then what to do first.",
  "Never only repeat the figures in the page's boxes: the reader can see those. Say what they mean together, or what is behind them.",
  "Reply with only JSON: {\"says\": [\"…\", \"…\"], \"steps\": [{\"words\": \"…\", \"link\": the number of one of the links given}]}: up to six sentences, the most useful first, and up to four steps. Say as much as the figures hold that is worth acting on; never pad.",
  "Start with the page as it is laid out (pageParts): what each part says that matters, a short sentence each where it has something to say; the reader sees the boxes, so never spend a sentence on them alone. Never name the parts (\"on the chart\", \"the map shows\"): say what they show. Then dig into the biggest thing.",
  "Write it as a short story a busy owner reads in under a minute, never a list of figures: what is happening, where it happens, and why it matters. Plain words, short sentences under 20 words, at most two figures in a sentence and eight in the whole bubble: choose the figures that tell the story. Name every figure by its key in double square brackets, like [[conv.purchases.now]], and never type a number: each is filled in from the page. Never a list of names inside a sentence.",
  "Say what got better and what got worse against the span before, wherever the figures hold it.",
  // Neon's first answers, 21 November 2026: "while brand clicks rose", "Other products left 66.7% of added
  // items in baskets" (an average cut away from the hinge it was set against), and a finding that told the reader to open a page.
  "Every change you name has its figure, also after \"while\" or \"but\": never \"brand clicks rose\" with no number. Say a figure and the one it is set against in the same sentence: never an average or the dates before in a sentence of its own. says is only what the figures show; what to do goes in steps.",
  // Anthony, 2026-11-03, on the Visits eye ("this is really poor from the ai"): the writer said visits "held steady on
  // weekdays" with no day on the page, and that people were "likely hitting a dead end".
  "Say only what the figures you were given show. Never guess at a reason, a day, a time or a pattern they do not hold, and never write \"likely\", \"probably\" or \"may be because\": where the figures cannot say why, make finding out a step.",
  // Anthony, 20 November 2026, on the Volatility eye's second press ("Yes, tighten it"): "Those gains lifted times shown
  // over the last seven days", when 20 searches climbing on one day shows nothing about a week of times shown.
  "Never say one figure caused another (\"those gains lifted times shown\", \"that drop brought visits down\"): the figures show both happened, never that one made the other. Say each in a sentence of its own.",
  // The same day, on its third press: "Positive gains dominate: 20 searches climbed…" (docs/developer/writing-guide.md).
  "Never join two ideas with a colon or a dash, and never open a sentence with a heading such as \"Positive gains dominate:\". Write two sentences.",
  // Anthony, 17 November 2026, on the Pages eye's first press: a step about linking blog guides to product pages was linked
  // to Tracked pages, the one link left once each step had to have its own.
  "Each step is one thing a person can do, in plain words, saying where: the device, channel, classification, step or product it is about — never advice that would fit any website. Link it to the page where that step is done; never to a page that doesn't show what the step is about, even if two steps then share a link. Never glue a figure onto a step. Use the words the page uses for things, never Google's own names for events.",
  "Never tell them to change what counts as a conversion, or how their tracking is set up: they chose it on purpose. Speak about tracking only when trackingFaults lists a fault.",
  "The most useful thing first: what a client would act on, never what did not happen.",
  // The platform's word (Anthony, GA19, 2026-10-09), though some screens' own figures still say enquiries.
  "Call them conversions, never enquiries, even where the page's figures say enquiries.",
  // Anthony, 2026-11-03: every word a client reads at a reading age of 14 ("we need to remember the reading age for
  // whenever you write text").
  "Write for a reading age of 14, as a helpful person would say it out loud. Never the system's words: no \"list\", \"row\", \"span\", \"share of\", \"the month before\" when the month has a name. Say \"visitors\" or \"people\", and \"more than September\" or \"fewer than September\". Keep Google's own names for channels (Cross-network, Organic Search, Direct).",
  // Anthony, 17 November 2026: the Pages eye said "down from 9,393 earlier" and "our two main blog guides".
  "Where you set a figure against the dates before, say them as datesBefore names them (\"in September\"), never \"earlier\" or \"previously\". Speak to the reader about their own website: \"your pages\", \"your blog\", never \"our\" or \"we\".",
].join("\n");

/**
 * Said to an agent that can read the website's screens for itself (stronger-agents-plan-2026-10-30.md A1): read
 * before writing, and where the page holds a figure, say the page's, so the bubble and the boxes agree.
 */
export const SEES_READS_FORMAT = [
  `You can read every Google Analytics screen of this website yourself, for the same dates, country and device, with ${ANALYTICS_READ}. The page's own screen is read for you already, with its map by classification and by channel. Read anything else that helps you find what the reader would miss.`,
  "Each read of the map starts with its standouts and, for a shop, the steps from one to the next, all worked out in code: where the groups part most, and how many go on from each step. Look at them first; they are where a story usually starts.",
  "Before you write, dig: take the biggest change you see and break it down — by device, by channel, by classification, by country, against the span before — until you know where it happens and where it does not. Read the map's other columns to do it. Then tell the reader where.",
  "Question a gap that looks too big: when one group's rate is three or more times another's, say its tracking may be broken there before calling it behaviour, and make checking it a step.",
  "Every number a screen gives comes with its key in double square brackets: name it by that key. Where the page's own facts hold the same figure, use the page's key, so the bubble says what the page's boxes say.",
  "At least one sentence must name a figure you read beyond the page's boxes: that is what the reader cannot see for themselves.",
].join("\n");

/**
 * Said for a shop (Anthony, 2026-10-30): conversions and purchases, never money ("i just dont want it focusing on
 * money" — the Conversions screens count conversions). What to look for is never listed: "i dont want it hard coded".
 */
export const SEES_SHOP_FORMAT = [
  "This website is a shop. Speak in conversions and purchases, never in money: do not lead with sales value or what anything earned.",
  "Compare things that matter to the business: never set a figure against nothing, or against a channel or page with a handful of visits.",
].join("\n");

/**
 * Words that name a part of the page rather than say what it shows ("In the table, 37.9% of returning visits left at
 * once": the Visits eye, 2026-11-03). Never Google Maps: a place on the map is a figure of its own.
 */
const PART_TALK = /\b(in|on|from) the (table|chart|graph|treemap|boxes|box|panel|line)\b|\bthe (table|chart|graph|treemap) (shows|says)\b/i;
/**
 * Words that say one figure made another happen, which no figure shows (Anthony, 2026-11-20, "Yes, tighten it", on the
 * Volatility eye's "Those gains lifted times shown over the last seven days"): a move named as the subject of a verb of
 * cause, or a phrase of cause. Measured that day on the 213 sentences the eye had written on dev and the 53 real answers
 * kept (`eyeRealAnswers.json`): it caught that one and Overview's "That drop brought Paid Search down to 1,099 visits",
 * and nothing else. A cause offered as a possibility ("could have lifted") is never caught: no verb follows the move.
 */
export const CAUSE_TALK = /\b(?:th(?:ose|ese|is|at)|the|its|their|your)\s+(?:\w+\s+)?(?:gains?|rises?|climbs?|falls?|drops?|losses?|moves?|changes?|increases?|jumps?|slips?|dips?|growth|declines?)\s+(?:lifted|drove|pushed|pulled|brought|caused|helped|dragged|boosted|sent|cut|fed|fuelled|fueled|lowered|raised)\b|\b(?:thanks to|as a result of|because of|which (?:lifted|drove|pushed|brought|helped|boosted|cut|raised|lowered)|led to|resulting in)\b/i;
/** The same said first, then a comma: cut off, and the sentence stands ("37.9% of returning visits left at once"). */
const LEADING_PART = /^(in|on|from) the (table|chart|graph|treemap|boxes|box|panel|line),?\s+/i;

/**
 * Words that guess at a reason the figures don't hold (search-console-and-analytics-data-plan-2026-11-21.md, fix 4):
 * "likely from a trade order", "shoppers likely hesitate over delivery costs" (Products and Purchases, 3 November 2026).
 * The writer is told never to (`SEES_RULES`); since 21 November a sentence that does goes back in code too, as every
 * other rule a machine can check does.
 */
const GUESSES = /\b(likely|unlikely|probably|perhaps|possibly|presumably|maybe)\b|\b(may|might|could) (well )?be (because|due|down to|from|caused)\b|\bsuggest(s|ing)? (that )?(shoppers|people|visitors|buyers|users|customers|they)\b/i;

/**
 * A finding that tells the reader what to do: "Open Insights' Keyword cannibalisation to see which page should own each
 * search" (Neon, 21 November 2026). What to do is a step, with its own link; a finding says what the figures show.
 * Measured that day on the eye's 288 saved sentences (dev and `eyeRealAnswers.json`): none starts so.
 */
const TELLS_WHAT_TO_DO = /^(?:open|check|review|see|look|compare|find|go|visit|read|inspect|fix|add|test|try|explore|consider|focus|start|remove|update|improve|watch|ask|make sure|use)\b/i;
/**
 * Words that say something moved. A sentence saying one with no figure tells the reader nothing they can weigh ("Brand
 * clicks rose", "New searches also fell against September": Neon, 21 November 2026). Past tense only: "lost" and "gained"
 * name the searches on New and lost, and present tense describes as often as it moves.
 */
export const MOVED = /\b(?:rose|fell|grew|dropped|slipped|climbed|jumped|increased|decreased|doubled|halved|declined|dipped|surged|shrank|sped up|slowed)\b/i;
/** The part of a sentence set against what comes before it. */
const CONTRAST = /,\s*(?:while|but|yet|whereas)\s+/i;

/**
 * A sentence with its last part cut off where that part says something moved with no figure, and the part before names
 * one: "Non-brand clicks fell 9.9% to 1,704, while brand clicks rose" says the first half (Neon, 21 November 2026). The
 * writer is told to give every change its figure; this keeps the figured half rather than lose the sentence. Measured that
 * day on dev's 235 saved sentences: 7 lose such a part ("while events rose even faster", "yet total views fell").
 */
export function withoutBareContrast(text: string): string {
  const at = text.search(CONTRAST);
  if (at < 0) return text;
  const before = text.slice(0, at).trimEnd();
  const after = text.slice(at);
  if (namedFacts(before).length === 0 || namedFacts(after).length > 0 || /\d/.test(after) || !MOVED.test(after)) return text;
  return `${before.replace(/[.,;:!?]+$/, "")}.`;
}

/**
 * The figures a figure is set against, by the keys findings give them: an average beside its row's value, the dates
 * before beside now (`before`, `shareBefore`, `wentOnBefore`…).
 */
function setAgainst(key: string): string[] {
  const match = /^(.+)\.(mean|before|[a-z]+Before)$/.exec(key);
  if (!match) return [];
  const [, base, field] = match;
  if (field === "mean") return [`${base}.value`];
  if (field === "before") return [`${base}.now`, `${base}.value`];
  return [`${base}.${field.slice(0, -"Before".length)}`];
}

/**
 * A slip that leaves a sentence off, past the first: words that belong in a step, a change with no figure, or a figure
 * said without the one it is set against. "Other products left 66.7% of added items in baskets" was a finding's average
 * for the other products, cut away from the hinge's 94.1% it was set against (Neon, 21 November 2026). Measured that day
 * on the 53 real answers kept: none says such a figure alone.
 */
export function sentenceSlip(text: string, named: readonly string[], facts: ReadonlyMap<string, Fact>): string | null {
  if (TELLS_WHAT_TO_DO.test(text)) return "A sentence told the reader what to do, which belongs in the steps";
  if (named.length === 0 && !/\d/.test(text) && MOVED.test(text)) return "A sentence said something changed without a figure. Say by how much, or leave it out";
  for (const key of named) {
    const against = setAgainst(key).filter((other) => facts.has(other));
    if (against.length > 0 && !against.some((other) => named.includes(other))) return "A sentence said a figure without the one it is set against. Say both in the same sentence";
  }
  return null;
}

/** Words that advise on tracking or on what counts: the bubble's only when tracking health found a fault. */
const TRACKING_TALK = /\b(double[- ]count\w*|duplicat\w* (tracking|tags?|events?|conversions?|goals?)|stop counting|(un)?count(ing)? [\w ]{1,30} as (a )?conversions?|remove [\w ]{1,30} (tracking|tags?|goals?)|tracking (set ?up|tags?)|as goals?)\b/i;

/**
 * The tracking health faults that break the conversion figures themselves, each in words for the team: only these
 * let the bubble speak about tracking (Anthony, 2026-10-30). Housekeeping — a conversion with no value, one that
 * never happens, a page counted twice, other addresses, unknown sources — never displaces what the sales say.
 */
export const SERIOUS_TRACKING_FAULTS: Readonly<Record<string, string>> = {
  NOTHING_COUNTED: "nothing is counted as a conversion yet",
  TRACKING_STOPPED: "tracking stopped: no visits recorded lately",
  SUDDEN_FALL: "the conversions fell suddenly, which looks like broken tracking",
  SOMETHING_ELSE: "a conversion is really something else, counting day for day with another event",
  ENQUIRY_UNCOUNTED: "an enquiry happens but is not counted as a conversion",
  CONVERSIONS_ELSEWHERE: "conversions happen on an address whose conversions are not counted",
};

/** The failing checks that break the conversion figures, in words; housekeeping left out. */
export function seriousFaults(failing: readonly string[]): string[] {
  return failing.filter((check) => check in SERIOUS_TRACKING_FAULTS).map((check) => SERIOUS_TRACKING_FAULTS[check]);
}

/**
 * Said when the page handed over its own figures (sees-every-page-plan-2026-10-31.md): the page as the reader sees it,
 * every number beside its key. Its words come from what it shows, never from Google Analytics alone.
 */
export const SEES_PAGE_FORMAT = [
  "pageFigures is the page as the reader sees it, every number beside its key in double square brackets. Write from it: name each figure by its key.",
  "Use the page's own words for things: a page about searches speaks of clicks and times shown in Google; a page about links speaks of linking websites.",
  // The Visits eye read "Not sorted yet" as pages people land on and hit a dead end (2026-11-03).
  "A group named \"Not sorted yet\", or marked sorted: false, is pages still to be put in a group: never a finding, a cause or a step.",
].join("\n");

/**
 * How long the eye's writer thinks: Low (21 November 2026, "Is this optimised for best results vs costs"). Code has already
 * found and ranked what matters, so the writer only writes it up. Measured that day on three Search Console pages, Neon at Low
 * wrote as well as at Medium, a blind reader judged, for 17 cents against 39, about what Hydrogen cost. A replay may set
 * another level to measure.
 */
export const SEES_THINKING_LEVEL = "LOW" as const;

/** Findings the words must cover, of those code found: the first ones; the panel shows them all. */
export const MOST_COVERED = 4;

/** Said to the specialist when code has found things in the figures before it starts. */
export const SEES_FINDINGS_FORMAT = [
  "Code has already found the things listed in findings, the most worth saying first, each with its figures' keys. Your words must cover the first four, each by naming at least one of its figures' keys. Then add what your reading explains about them: why, where, what to do.",
  "Never contradict a finding. Where a finding says to check tracking, say tracking may be broken there; where it says behaviour, say it as a gap in how people behave.",
  // eye-code-first-brief-plan-2026-11-07.md, "The two slips": Services' steps said "visits dropped" when only AI Agency's fell.
  "Say whose figure each change is, as its finding names it: \"AI Agency's visits fell\", never \"visits fell\" when one row's did.",
].join("\n");

/**
 * What a first answer must still have, its faulty parts left off, to stand without a rewrite on a page trying the code-first
 * brief (eye-code-first-brief-plan-2026-11-07.md, next step 1; Anthony: "Do it"): every press on Services went back once, for
 * one long step or one sentence too many figures, and a rewrite doubles a press's cost and time.
 */
export const FIRST_ANSWER_KEEPS = { says: 3, steps: 2 } as const;

/** Whether a first answer, checked with its faulty parts left off, keeps enough to stand: the first findings said, and enough left. */
export function firstAnswerStands(verdict: SeesVerdict): boolean {
  return verdict.ok && verdict.says.length >= FIRST_ANSWER_KEEPS.says && verdict.steps.length >= FIRST_ANSWER_KEEPS.steps;
}

/** A figure counted for every 100 visits, by its words or its field's name ("forEvery100", "eventsPerHundred"): never a percentage. */
export function isPerHundred(fact: Pick<Fact, "key" | "label"> | undefined): boolean {
  return fact !== undefined && /for every 100\b|forEvery100|perHundred/i.test(`${fact.label} ${fact.key}`);
}

/**
 * A "%" typed straight after a figure's key, tidied before the words are checked:
 * - after a key that brings its own ("65.7%") it's taken off: "[[f2.value]]%" read as a typed number and sent the words back
 *   (Services, 7 November: two rewrites of six), when what was meant was plain;
 * - after a rate for every 100 visits, which is never a percentage, it's taken off where the words go on "for every 100", and
 *   otherwise said as "in every 100": "turns [[k]]% of its visits into events" showed "turns 1% of its visits" (Services, 7 November);
 * - after a plain number ("scroll [[page.x.scroll]]%") the sign is the writer's to give: taking it off left "People scroll 35
 *   down" on Clarity's pages (7 November).
 */
export function withoutTypedUnits(answer: unknown, facts: ReadonlyMap<string, Pick<Fact, "key" | "label" | "unit">>): unknown {
  if (!answer || typeof answer !== "object") return answer;
  const tidy = (text: unknown) => (typeof text === "string"
    ? text.replace(/\[\[([^\]]+)\]\]\s?%/g, (whole, key: string, at: number) => {
      const fact = facts.get(key);
      if (fact?.unit === "percent") return `[[${key}]]`;
      if (!isPerHundred(fact)) return whole;
      return /^[^.;]{0,40}\bevery 100\b/i.test(text.slice(at + whole.length)) ? `[[${key}]]` : `[[${key}]] in every 100`;
    })
    : text);
  const raw = answer as { says?: unknown; steps?: unknown };
  return {
    ...raw,
    ...(Array.isArray(raw.says) ? { says: raw.says.map(tidy) } : {}),
    ...(Array.isArray(raw.steps) ? { steps: raw.steps.map((step) => (step && typeof step === "object" ? { ...step, words: tidy((step as { words?: unknown }).words) } : tidy(step))) } : {}),
  };
}

/**
 * A sentence with the page's own names taken out, longest first, in any case and whatever stands between their words: a writer
 * says "30 visits or more and under 1.6" for the group "30 visits or more, and under 1.6". What's left is checked for typed numbers.
 */
export function withoutNames(text: string, names: readonly string[]): string {
  let out = text;
  const sorted = [...names].sort((one, other) => other.length - one.length);
  for (const name of sorted) {
    const words = nameWords(name);
    if (words.length === 0) continue;
    out = out.replace(wordsPattern(words), " ");
  }
  // A name said in part: a writer shortens "Eurospec Grade 11 Ball Bearing Hinge – Pair-Antique Brass-Square" to "Eurospec Grade
  // 11 Ball Bearing Hinge", and the whole name no longer matches. A number beside the word the name has it beside ("Grade 11",
  // "Eclipse 1838") is the name's, never a figure: read as one, it sent Products' first answer back (Neon, 21 November 2026).
  // Only a word of three letters or more that is not a small joining word, so "of 4" in a product's name never hides a 4.
  for (const name of sorted) {
    const words = nameWords(name);
    words.forEach((word, at) => {
      if (!/\d/.test(word)) return;
      for (const pair of [[words[at - 1], word], [word, words[at + 1]]]) {
        const beside = pair[0] === word ? pair[1] : pair[0];
        if (!beside || /\d/.test(beside) || beside.length < 3 || JOINING_WORDS.has(beside.toLowerCase())) continue;
        out = out.replace(wordsPattern(pair as string[]), " ");
      }
    });
  }
  return out;
}

/** Small words that join a name's parts, never enough beside a number to show it's the name's. */
const JOINING_WORDS = new Set(["the", "and", "for", "with", "from", "set", "pack", "pair", "per", "each", "only", "inch", "into", "over"]);

/** A name's words, as `withoutNames` matches them. */
function nameWords(name: string): string[] {
  return name.split(/[^\p{L}\p{N}.]+/u).map((word) => word.replace(/\.+$/, "")).filter(Boolean);
}

/** The words in a row, in any case and whatever stands between them, never inside another word. */
function wordsPattern(words: readonly string[]): RegExp {
  const pattern = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^\\p{L}\\p{N}]+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, "giu");
}

/**
 * The names in a page's figures that carry numbers (a row's name, a group's, the page's own names for things), as a writer may
 * name them: three letters or more, never a figure's key.
 */
export function namesWithNumbersIn(value: unknown, into = new Set<string>()): string[] {
  if (typeof value === "string") {
    if (/\d/.test(value) && /[A-Za-z]{3}/.test(value) && !value.includes("[[")) into.add(value.trim());
  } else if (Array.isArray(value)) {
    for (const item of value) namesWithNumbersIn(item, into);
  } else if (value && typeof value === "object") {
    for (const inner of Object.values(value as Record<string, unknown>)) namesWithNumbersIn(inner, into);
  }
  return [...into];
}

/** Whether two pages' figures are the same, key for key and value for value: a saved answer stands only while they are (S3). */
export function sameFigures(left: ReadonlyArray<{ key: string; value: number }> | undefined, right: ReadonlyArray<{ key: string; value: number }>): boolean {
  if (!left || left.length !== right.length) return false;
  const held = new Map(left.map((fact) => [fact.key, fact.value]));
  return right.every((fact) => held.get(fact.key) === fact.value);
}

/**
 * Why a written bubble was sent back, for the run's log in plain words; or what passed, with the sentences and steps
 * left off for a fault (`left`), which the run's log names.
 */
export type SeesVerdict = { ok: true; says: string[]; steps: Array<{ words: string; link: string; href: string }>; left?: string[] } | { ok: false; why: string };

/**
 * The Editor's code checks on what a specialist wrote (S5, S7; the weekly
 * run's rule 1: an AI never types a figure): every sentence names only facts
 * the page handed over and types no number, is one to twenty words and
 * names no supplier; every step is one plain sentence with one of the page's
 * links.
 *
 * Every fault is named at once, so the one rewrite fixes them all
 * (ask-hakken-every-chart-page-plan-2026-11-03.md; Anthony, 2026-11-03, on the
 * Visits eye: "this is really poor from the ai"). Told one fault at a time, the
 * writer mended the first and was failed on the second, and the reader got the
 * rule's words. After the rewrite (`salvage`), a sentence or step with a fault
 * is left off and the rest stand, as a crowded later sentence always was; only
 * nothing left, or a first sentence naming no figure, sends the words back.
 */
/**
 * A sentence that leans on the one before: "Its purchases also jumped from 5 to 22." If that one's left off, this one points at
 * whatever's left above it, and says something untrue (Campaigns, 2026-11-05: Low Bid's purchases read as Performance Max's). So it goes too.
 */
const LEANS_ON_THE_LAST = /^(?:it|it's|its|they|they're|their|them|this|that|these|those|both|also|he|she|his|her)\b/i;
/**
 * The same further in, in a sentence naming no figure of its own: a remark on the sentence before, which points at nothing
 * once that one is left off (Volatility, 2026-11-20: "Sitting in places 11 to 20 means they are shown more often", its
 * "they" the climbing searches of a sentence left off as too long). Never "this" or "that", which start ordinary clauses
 * ("means that"). Measured that day on the eye's 266 saved sentences: 5 name no figure and say one of these, and each
 * goes only after a sentence left off. Two of them remark on what came before ("With numbers this small…, it is too early
 * to tell"); the other three would stand alone, a cost taken so that no sentence points at one gone.
 */
const POINTS_BACK = /\b(?:it|it's|its|they|they're|their|them|these|those)\b/i;
/**
 * A short lead-in before a colon, naming no figure: cut off, and what follows stands ("Positive gains dominate: 20
 * searches climbed five places or more", Volatility, 2026-11-20). A colon never joins two ideas in words a client reads
 * (docs/developer/writing-guide.md). Up to four words, and three or more after it; a time (12:30) or an address has no space after its colon.
 */
export function withoutLeadIn(text: string): string {
  const at = text.indexOf(": ");
  if (at < 0) return text;
  const before = text.slice(0, at);
  const after = text.slice(at + 2).trim();
  const words = before.match(/[\p{L}\p{N}'’]+/gu) ?? [];
  if (words.length === 0 || words.length > 4 || /\d|\[\[/.test(before) || (after.match(/\p{L}{2,}/gu) ?? []).length < 3) return text;
  return after;
}

/**
 * Words as the reader is spoken to (Anthony, 17 November 2026, on the Pages eye's first press: "down from 9,393 earlier",
 * "our two main blog guides"): the reader's own website is "your", never "our"; and where the dates before have a name, a
 * figure set "earlier" is set "in September". Mended here, so no slip costs a rewrite.
 */
export function spoken<T extends { text: string }>(filled: T, beforeName?: string): T {
  let text = filled.text.replace(/\bour\b/g, "your").replace(/\bOur\b/g, "Your");
  if (beforeName) {
    text = text.replace(/\s+(?:earlier|previously)(?=[.,;:!?]|$)/gi, ` in ${beforeName}`);
    // "The month before" when the month has a name (docs/developer/writing-guide.md, rule 3): 6 of dev's 235 saved
    // sentences said it, and Neon did too, though the writer is told not to (21 November 2026). "Up 14.9% on September",
    // "up from 972 in September".
    text = text.replace(DATES_BEFORE, (whole: string, word: string | undefined, at: number) => {
      const said = word ? `${word}${beforeName}` : `in ${beforeName}`;
      return at === 0 ? said.charAt(0).toUpperCase() + said.slice(1) : said;
    });
  } else {
    // Without a name, "in the span before" is "before that": span is the system's word.
    text = text.replace(/\s+in the (?:span|period) before\b/gi, " before that");
  }
  return { ...filled, text };
}

/** The dates before, unnamed, with the word before them that keeps its place when the month's name goes in. */
const DATES_BEFORE = /(\b(?:on|against|than|over|versus|vs\.?|with|to|from|since)\s+)?(?:\bin\s+)?\b(?:the month before|the previous month|the prior month|a month earlier|the span before|the period before)\b/gi;

/**
 * The dates before a page's dates by their name, where they are one whole month: "September", or "December 2025" in
 * another year than the dates'. The writer is handed them (`datesBefore`) and `spoken` says them.
 */
export function beforeNamed(from: string, to: string, period?: string): { dates: string; name?: string } {
  const before = beforeOf(from, to, period && isCalendarPeriod(period) ? period : undefined);
  const dates = `${before.from} to ${before.to}`;
  if (!before.from.endsWith("-01")) return { dates };
  const last = new Date(Date.UTC(Number(before.from.slice(0, 4)), Number(before.from.slice(5, 7)), 0)).toISOString().slice(0, 10);
  if (before.to !== last) return { dates };
  const month = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(new Date(`${before.from}T00:00:00Z`));
  return { dates, name: before.from.slice(0, 4) === to.slice(0, 4) ? month : `${month} ${before.from.slice(0, 4)}` };
}

/**
 * The dates before a press's dates, by name where they have one. A press on a menu period carries its name alone
 * ("lastMonth"), so its dates are worked out as the screens work them out (`periodBounds`) on the UK day `today`. Until
 * 21 November 2026 only a press on dates picked by hand was given the name, and most presses are on Last month: the
 * Neon model's first answers said "the month before" there. Null for a press with no dates at all.
 */
export function datesBeforeFor(page: { period: string; from?: string; to?: string }, today: string): { dates: string; name?: string } | null {
  const shown = page.from && page.to ? { from: page.from, to: page.to } : isCalendarPeriod(page.period) ? periodBounds(page.period, today) : null;
  return shown ? beforeNamed(shown.from, shown.to, page.period) : null;
}

export function seesFrom(answer: unknown, facts: ReadonlyMap<string, Fact>, links: readonly SeesLink[], options: {
  /**
   * The page's own keys, when the team read the website's screens (A1): at least one sentence must then name a figure
   * read beyond them. A bubble that only says the boxes' figures again tells the reader nothing they can't see
   * (Anthony, 2026-10-30: "there is so much data on this page and this is the best it can do").
   */
  pageKeys?: ReadonlySet<string>;
  /** Tracking health found no fault: words about tracking, or about changing what counts, go back. */
  noTrackingTalk?: boolean;
  /** An Analytics screen: words it never uses (clicks, sessions, users…) go back. */
  analytics?: boolean;
  /**
   * The findings code found that the words must cover, each by naming at least one of its figures' keys in a
   * sentence that is kept (sees-findings-in-code-plan-2026-10-31.md, phase 3).
   */
  mustCover?: ReadonlyArray<{ keys: readonly string[]; words: string }>;
  /** A finding still left out after the rewrite: the words stand without it, rather than leave the reader nothing. */
  coverIfItCan?: boolean;
  /** The words after their rewrite: a sentence or step with a fault is left off, never the whole bubble. */
  salvage?: boolean;
  /**
   * Names the page hands over with numbers in them, such as Services' groups, named by their numbers ("30 visits or more, and
   * under 1.6 events for every 100"): a writer naming one has typed no figure (eye-code-first-brief-plan-2026-11-07.md).
   */
  namesWithNumbers?: readonly string[];
  /** The dates before by their name, where they have one ("September"): a sentence ending "…from 9,393 earlier" says it. */
  beforeName?: string;
} = {}): SeesVerdict {
  const namedKept: string[] = [];
  const typed = (text: string) => typedNumbers(withoutNames(text, options.namesWithNumbers ?? []));
  const faults: string[] = [];
  const left: string[] = [];
  // Crowded sentences after the first, left off before the rewrite: said to the writer only when the words go back
  // anyway, so it knows why a finding it is told it left out went (Volatility, 2026-11-20: told only "It left out a
  // finding", the writer wrote the same three-figure sentences again, and after the rewrite every one was lost).
  const crowded: string[] = [];
  const salvage = options.salvage === true;
  const jargon = (text: string) => (options.analytics ? text.match(ANALYTICS_JARGON)?.[0] ?? null : null);
  let figures = 0;
  const trackingTalk = (text: string) => options.noTrackingTalk && TRACKING_TALK.test(text);
  const raw = (answer && typeof answer === "object" ? answer : {}) as { says?: unknown; steps?: unknown };
  const saysRaw = Array.isArray(raw.says) ? raw.says : [];
  if (saysRaw.length === 0) return { ok: false, why: "It said nothing." };
  const says: string[] = [];
  // A sentence's fault: named for the rewrite, or, after it, the sentence left off.
  const fault = (why: string) => {
    if (salvage) left.push(why);
    else faults.push(why);
  };
  // Whether the sentence before this one was left off.
  let lastLeftOff = false;
  for (const line of saysRaw.slice(0, MOST_SEES_SAYS)) {
    if (typeof line !== "string" || !line.trim()) {
      fault("A sentence was empty.");
      lastLeftOff = true;
      continue;
    }
    const cut = withoutBareContrast(withoutLeadIn(line.trim().replace(LEADING_PART, "")));
    // A capital to start, but a name that starts small keeps its spelling: never "IOS led the growth".
    const trimmed = /^\p{Ll}+\p{Lu}/u.test(cut) ? cut : cut.charAt(0).toUpperCase() + cut.slice(1);
    if (lastLeftOff && (LEANS_ON_THE_LAST.test(trimmed) || (namedFacts(trimmed).length === 0 && POINTS_BACK.test(trimmed)))) {
      if (salvage) left.push(`A sentence leaned on one that was left off: "${trimmed}".`);
      continue;
    }
    lastLeftOff = true;
    if (typed(trimmed).length > 0) {
      fault(`A sentence typed a number: "${trimmed}".`);
      continue;
    }
    if (GUESSES.test(trimmed)) {
      fault(`A sentence guessed at a reason the figures don't show: "${trimmed}". Say only what they show, and make finding out why a step.`);
      continue;
    }
    if (namedFacts(trimmed).length === 0 && says.length === 0) {
      fault(`The first sentence names no figure: "${trimmed}".`);
      continue;
    }
    // Words that belong in a step, a change with no figure, a figure without the one it's set against: in the first
    // sentence the words go back; a later one is left off and the rest stand, as a crowded one is, so no slip costs a
    // rewrite, and the writer is told only if the words go back anyway.
    const slip = sentenceSlip(trimmed, namedFacts(trimmed), facts);
    if (slip) {
      const why = `${slip}: "${trimmed}".`;
      if (says.length === 0) fault(why);
      else if (salvage) left.push(why);
      else crowded.push(why);
      continue;
    }
    // Too many figures in the first sentence sends the words back; a later one is left off and the rest stand
    // (sees-every-page-plan-2026-10-31.md: whole answers were lost to one crowded sentence on Products and Clarity), and
    // is named to the writer only if the words go back for another reason.
    // After the rewrite, one figure over stands if it alone carries a finding not yet said: told to cover two findings, a
    // writer put them in one sentence, and leaving it off lost the very findings it was asked for (Live, 2026-11-06:
    // conversions at a third of usual, the page's biggest news, gone). The first sentence too (Volatility, 2026-11-20:
    // its first three sentences each named three figures, each the one carrying its finding, and nothing was left).
    const named = namedFacts(trimmed);
    if (named.length > MOST_SENTENCE_FIGURES) {
      const carriesAFinding = salvage && named.length === MOST_SENTENCE_FIGURES + 1
        && (options.mustCover ?? []).some((finding) => !finding.keys.some((key) => namedKept.includes(key)) && finding.keys.some((key) => named.includes(key)));
      if (!carriesAFinding) {
        const why = `A sentence named more than ${MOST_SENTENCE_FIGURES} figures: "${trimmed}". Choose the ones that tell the story.`;
        if (says.length === 0) fault(why);
        else if (!salvage) crowded.push(why);
        continue;
      }
    }
    // Past the bubble's figures the rest is left off, the most useful having come first; never the first sentence, and after the
    // rewrite never one carrying a finding not yet said (Overview, 2026-11-06: a writer put the page's biggest finding fourth, and it was lost).
    if (says.length > 0 && figures + namedFacts(trimmed).length > MOST_BUBBLE_FIGURES) {
      const carries = salvage && (options.mustCover ?? []).some((finding) => !finding.keys.some((key) => namedKept.includes(key)) && finding.keys.some((key) => named.includes(key)));
      if (!carries) continue;
    }
    const filled = spoken(fillFacts(trimmed, facts), options.beforeName);
    const why = filled.missing.length > 0 ? `A sentence named a figure that was neither on the page nor read: ${filled.missing.join(", ")}.`
      : filled.text.split(/\s+/).length > MOST_SENTENCE_WORDS ? `A sentence ran past ${MOST_SENTENCE_WORDS} words: "${filled.text}". Split it in two, or say less.`
      : /dataforseo|firecrawl/i.test(filled.text) ? "A sentence named a supplier."
      : jargon(filled.text) ? `A sentence used "${jargon(filled.text)}", which the page never says: use the page's own words.`
      : trackingTalk(filled.text) ? `A sentence spoke about tracking or what counts, and tracking health found nothing wrong: "${filled.text}".`
      : PART_TALK.test(filled.text) ? `A sentence named a part of the page ("${filled.text.match(PART_TALK)?.[0]}"): say what it shows, never where.`
      : CAUSE_TALK.test(filled.text) ? `A sentence said one figure caused another: "${filled.text}". The figures show both happened, never that one made the other: say each on its own.`
      : null;
    if (why) {
      fault(why);
      continue;
    }
    figures += namedFacts(trimmed).length;
    namedKept.push(...namedFacts(trimmed));
    says.push(filled.text);
    lastLeftOff = false;
  }
  if (options.pageKeys && says.length > 0 && !namedKept.some((key) => !options.pageKeys!.has(key))) {
    faults.push("It only said the page's own figures again: say what the screens you read show behind them, by their keys.");
  }
  const stepsRaw = Array.isArray(raw.steps) ? raw.steps : [];
  const steps: Array<{ words: string; link: string; href: string }> = [];
  for (const entry of stepsRaw.slice(0, MOST_SEES_STEPS)) {
    const step = (entry ?? {}) as { words?: unknown; link?: unknown };
    if (typeof step.words !== "string" || !step.words.trim()) {
      fault("A step had no words.");
      continue;
    }
    const words = step.words.trim();
    if (typed(words).length > 0) {
      fault(`A step typed a number: "${words}".`);
      continue;
    }
    const filled = spoken(fillFacts(words, facts), options.beforeName);
    const at = typeof step.link === "number" ? step.link : Number(step.link);
    const link = Number.isInteger(at) ? links[at] : undefined;
    const why = filled.missing.length > 0 ? `A step named a figure that was neither on the page nor read: ${filled.missing.join(", ")}.`
      : filled.text.split(/\s+/).length > MOST_SENTENCE_WORDS ? `A step ran past ${MOST_SENTENCE_WORDS} words: "${filled.text}".`
      : jargon(filled.text) ? `A step used "${jargon(filled.text)}", which the page never says: use the page's own words.`
      : trackingTalk(filled.text) ? `A step advised on tracking or what counts, and tracking health found nothing wrong: "${filled.text}".`
      : !link ? `A step's link was not one of the page's: "${filled.text}".`
      : null;
    if (why || !link) {
      fault(why ?? "A step's link was not one of the page's.");
      continue;
    }
    steps.push({ words: filled.text, link: link.label, href: link.href });
  }
  if (says.length === 0 && faults.length === 0) faults.push(left.length > 0 ? `Every sentence had a fault: ${left.join(" ")}`.slice(0, 900) : "It said nothing.");
  const uncovered = (options.mustCover ?? [])
    .filter((finding) => !options.coverIfItCan && !finding.keys.some((key) => namedKept.includes(key)))
    .map((finding) => `It left out a finding: "${finding.words}". Cover it by naming one of its figures, in a sentence of its own.`);
  // Every fault goes back at once: the crowded sentences left off before the findings they lost, so the rewrite reads why.
  if (faults.length > 0 || uncovered.length > 0) return { ok: false, why: [...faults, ...crowded, ...uncovered].join(" ") };
  return { ok: true, says, steps, ...(left.length > 0 ? { left } : {}) };
}

/**
 * Who writes a page's words: the screen list's specialist (sees-every-page-plan-2026-10-31.md; the Head of Strategy no
 * longer chooses, which was a model call on every press). One rule beside it: on a page about conversions, a fault
 * tracking health found that breaks the conversion figures hands the page to the Measurement specialist.
 */
export function writerFor(screen: string, trackingFaults: readonly string[]): InsightsRole {
  const aboutConversions = screen === "googleAnalytics.conversions" || screen.startsWith("googleAnalytics.event:");
  if (aboutConversions && trackingFaults.length > 0) return "INSIGHTS_MEASUREMENT";
  return seesScreenFor(screen)?.writer ?? "INSIGHTS_CONVERSION";
}

/**
 * The eval set's judge (A6; Anthony, 2026-10-30): his notes on what a good bubble for the page would find are the
 * marked answer, never the brief — the team has to find them itself. The judge says, point by point, whether the
 * bubble found each one, in any words; its figures may differ a little, as his were read off the screen by eye.
 */
export const JUDGE_FORMAT = [
  "Anthony wrote down what a good bubble for this page would find. Below are his points and the bubble the team wrote.",
  "For each of his points, in order, decide whether the bubble found it: the same finding in any words, its figures allowed to differ a little. A point the bubble only touches without saying it is not found.",
  "Reply with only JSON: {\"points\": [{\"found\": true or false, \"why\": \"one short sentence\"}]}, one for each of his points, in his order.",
].join("\n");

/** The judge's answer read: the share of Anthony's points found, 0 to 1, and a note per point; null when unreadable. */
export function judgeFrom(answer: unknown, expected: readonly string[]): { score: number; notes: string[] } | null {
  const points = (answer as { points?: unknown } | null)?.points;
  if (!Array.isArray(points) || points.length !== expected.length) return null;
  const read = points.map((point) => (point && typeof point === "object" ? point as { found?: unknown; why?: unknown } : {}));
  if (read.some((point) => typeof point.found !== "boolean")) return null;
  const found = read.filter((point) => point.found === true).length;
  return {
    score: Math.round((found / expected.length) * 100) / 100,
    notes: read.map((point, at) => `${point.found ? "Found" : "Missed"}: ${expected[at]}${typeof point.why === "string" && point.why.trim() ? ` — ${point.why.trim()}` : ""}`),
  };
}

/** The numbers a sentence carries, as written: "1,258", "3.5%", "£104,165" all read as their digits. */
export function numbersIn(text: string): string[] {
  return [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((match) => match[0].replace(/,/g, ""));
}

/**
 * How close the team's bubble came to Anthony's sentences for the same page
 * (A6): the share of the figures his sentences name that the team's name
 * too, 0 to 1 — a bubble about the right figures scores high even in other
 * words; one about other figures scores low. Sentences with no figure are
 * graded on whether the team said anything at all.
 */
export function gradeSees(expected: readonly string[], says: readonly string[]): { score: number; notes: string[] } {
  const wanted = [...new Set(expected.flatMap(numbersIn))];
  const got = new Set(says.flatMap(numbersIn));
  if (wanted.length === 0) return { score: says.length > 0 ? 1 : 0, notes: ["Anthony's sentences name no figure: graded on saying anything."] };
  const matched = wanted.filter((number) => got.has(number));
  const notes = [`${matched.length} of the ${wanted.length} figures Anthony named: ${matched.join(", ") || "none"}.`];
  const missed = wanted.filter((number) => !got.has(number));
  if (missed.length > 0) notes.push(`Not named: ${missed.join(", ")}.`);
  return { score: Math.round((matched.length / wanted.length) * 100) / 100, notes };
}
