import { v } from "convex/values";
import { INSIGHTS_LEAD_ROLE, INSIGHTS_ROLES, type InsightsRole } from "./agentRoles";
import { ANALYTICS_READ } from "./agentTools";
import { fillFacts, namedFacts, type Fact } from "./insightFacts";
import { typedNumbers } from "./insightEditor";
import { DISCIPLINE, SPECIALIST_ROLE, type InsightSpecialist } from "./insightTeam";

/**
 * What Hakken sees, written by the Insights team when the eye is pressed
 * (docs/plans/active/sees-conversion-specialist-plan-2026-10-30.md, S1–S12;
 * conversions-and-agents-build-plan-2026-10-30.md, phase 5). No database
 * here: the shapes, the words the agents are given, and the Editor's code
 * checks on what they wrote. `convex/seesAsk.ts` saves and reads;
 * `convex/seesAskActions.ts` asks.
 */

/** An answer is shown again for this long while nothing on the page changed (S3). */
export const SEES_KEPT_MS = 3 * 60 * 60 * 1000;
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
 * "cover the page before digging"). The page's own layout, never a list of findings. A screen given a bubble adds
 * its parts here.
 */
export function pageParts(screen: string): string[] {
  if (screen === "googleAnalytics.conversions") {
    // Not the boxes: the reader sees those (2026-10-31: a sentence spent on them left less room to dig).
    return [
      "the chart: how many visits it took for one conversion, day by day",
      "the map: each conversion by kind of page, channel, device or country, as visits, a rate or events",
      "the table: each event the website counts, with its conversions, visits and change",
    ];
  }
  if (screen.startsWith("googleAnalytics.event:")) {
    return [
      "the chart: the share of each day's visits that did it",
      "the lines: the conversion by channel, day by day",
      "when people convert: by hour and day of the week",
    ];
  }
  return [];
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
};

/** A key read back into its parts: the screen, its dates, country and device (`seesKey`'s other way). */
export function fromSeesKey(key: string): { screen: string; period: string; from?: string; to?: string; country: string; device: string } {
  const parts = key.split("|");
  const [period, from, to, country, device] = parts.slice(-5);
  return { screen: parts.slice(0, -5).join("|"), period: period ?? "", ...(from ? { from } : {}), ...(to ? { to } : {}), country: country ?? "", device: device ?? "" };
}

/** One answer for one website, page, dates, country and device (S9): change any and it is written afresh. */
export function seesKey(ask: { screen: string; period: string; from?: string; to?: string; country: string; device: string }): string {
  return [ask.screen, ask.period, ask.from ?? "", ask.to ?? "", ask.country, ask.device].join("|");
}

/** The page's facts as the team's (`Fact`): Analytics' figures, the home country's, over the dates shown. */
export function factsOf(ask: { facts: ReadonlyArray<{ key: string; value: number; unit: Fact["unit"]; label: string; currency?: string }>; from?: string; to?: string; country: string }): Fact[] {
  return ask.facts.slice(0, MOST_SEES_FACTS).map((fact) => ({
    key: fact.key,
    value: fact.value,
    unit: fact.unit,
    source: "analytics" as const,
    label: fact.label,
    ...(ask.from ? { from: ask.from } : {}),
    ...(ask.to ? { to: ask.to } : {}),
    ...(ask.country ? { country: ask.country } : {}),
    ...(fact.currency ? { currency: fact.currency } : {}),
  }));
}

/** The specialists the Head may hand a page to: every role on the team but its own, the Editor's and the Report Writer's (S8). */
export const SEES_WRITERS: readonly InsightsRole[] = INSIGHTS_ROLES.filter((role) => role !== INSIGHTS_LEAD_ROLE && role !== "INSIGHTS_EDITOR" && role !== "INSIGHTS_REPORT_WRITER");

/** Each writer's discipline in words, for the Head's choice; the roles without a specialist's discipline named by their job. */
export function writersForHead(): Array<{ role: InsightsRole; does: string }> {
  const byRole = new Map<InsightsRole, string>(Object.entries(SPECIALIST_ROLE).map(([specialist, role]) => [role, DISCIPLINE[specialist as InsightSpecialist]]));
  const extra: Partial<Record<InsightsRole, string>> = {
    INSIGHTS_ANALYST: "why the visits and enquiries moved, period against period",
    INSIGHTS_CANNIBALISATION: "which page should own each search where pages compete",
    INSIGHTS_PAGE_DECISIONS: "what to do with each page: keep, improve, merge, redirect or remove",
  };
  return SEES_WRITERS.map((role) => ({ role, does: byRole.get(role) ?? extra[role] ?? role.toLowerCase() }));
}

/** What the Head answers with when handed a page (S8, S12). */
export const ROUTE_FORMAT = [
  "A reader pressed the eye on one page of the app. Choose which specialist on your team should say what the page means, from the specialists given, by what the page is about and the figures it holds.",
  "A page about sales and conversions goes to the Conversion specialist. The measurement specialist answers only when trackingFaults lists a fault tracking health found.",
  "Reply with only JSON: {\"specialist\": the role exactly as given, \"why\": one sentence}.",
].join("\n");

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
  "Each step is one thing a person can do, in plain words, saying where: the device, channel, kind of page, step or product it is about — never advice that would fit any website. Link it to the place it names. Never glue a figure onto a step. Use the words the page uses for things, never Google's own names for events.",
  "Never tell them to change what counts as a conversion, or how their tracking is set up: they chose it on purpose. Speak about tracking only when trackingFaults lists a fault.",
  "The most useful thing first: what a client would act on, never what did not happen.",
].join("\n");

/**
 * Said to an agent that can read the website's screens for itself (stronger-agents-plan-2026-10-30.md A1): read
 * before writing, and where the page holds a figure, say the page's, so the bubble and the boxes agree.
 */
export const SEES_READS_FORMAT = [
  `You can read every Google Analytics screen of this website yourself, for the same dates, country and device, with ${ANALYTICS_READ}. The page's own screen is read for you already, with its map by kind of page and by channel. Read anything else that helps you find what the reader would miss.`,
  "Each read of the map starts with its standouts and, for a shop, the steps from one to the next, all worked out in code: where the groups part most, and how many go on from each step. Look at them first; they are where a story usually starts.",
  "Before you write, dig: take the biggest change you see and break it down — by device, by channel, by kind of page, by country, against the span before — until you know where it happens and where it does not. Read the map's other columns to do it. Then tell the reader where.",
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

/** Findings the words must cover, of those code found: the first ones; the panel shows them all. */
export const MOST_COVERED = 4;

/** Said to the specialist when code has found things in the figures before it starts. */
export const SEES_FINDINGS_FORMAT = [
  "Code has already found the things listed in findings, the most worth saying first, each with its figures' keys. Your words must cover the first four, each by naming at least one of its figures' keys. Then add what your reading explains about them: why, where, what to do.",
  "Never contradict a finding. Where a finding says to check tracking, say tracking may be broken there; where it says behaviour, say it as a gap in how people behave.",
].join("\n");

/** Whether two pages' figures are the same, key for key and value for value: a saved answer stands only while they are (S3). */
export function sameFigures(left: ReadonlyArray<{ key: string; value: number }> | undefined, right: ReadonlyArray<{ key: string; value: number }>): boolean {
  if (!left || left.length !== right.length) return false;
  const held = new Map(left.map((fact) => [fact.key, fact.value]));
  return right.every((fact) => held.get(fact.key) === fact.value);
}

/** Why a written bubble was sent back: for the run's log, in plain words. */
export type SeesVerdict = { ok: true; says: string[]; steps: Array<{ words: string; link: string; href: string }> } | { ok: false; why: string };

/**
 * The Editor's code checks on what a specialist wrote (S5, S7; the weekly
 * run's rule 1: an AI never types a figure): every sentence names only facts
 * the page handed over and types no number, is one to twenty-four words and
 * names no supplier; every step is one plain sentence with one of the page's
 * links. Anything else goes back, and the bubble keeps the rule's words.
 */
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
} = {}): SeesVerdict {
  const namedKept: string[] = [];
  const jargon = (text: string) => (options.analytics ? text.match(ANALYTICS_JARGON)?.[0] ?? null : null);
  let figures = 0;
  const trackingTalk = (text: string) => options.noTrackingTalk && TRACKING_TALK.test(text);
  const raw = (answer && typeof answer === "object" ? answer : {}) as { says?: unknown; steps?: unknown };
  const saysRaw = Array.isArray(raw.says) ? raw.says : [];
  if (saysRaw.length === 0) return { ok: false, why: "It said nothing." };
  const says: string[] = [];
  for (const line of saysRaw.slice(0, MOST_SEES_SAYS)) {
    if (typeof line !== "string" || !line.trim()) return { ok: false, why: "A sentence was empty." };
    const trimmed = line.trim();
    if (typedNumbers(trimmed).length > 0) return { ok: false, why: `A sentence typed a number: "${trimmed}".` };
    if (namedFacts(trimmed).length === 0 && says.length === 0) return { ok: false, why: `The first sentence names no figure: "${trimmed}".` };
    if (namedFacts(trimmed).length > MOST_SENTENCE_FIGURES) return { ok: false, why: `A sentence named more than ${MOST_SENTENCE_FIGURES} figures: "${trimmed}". Choose the ones that tell the story.` };
    // Past the bubble's figures the rest is left off, the most useful having come first; never the first sentence.
    if (says.length > 0 && figures + namedFacts(trimmed).length > MOST_BUBBLE_FIGURES) break;
    figures += namedFacts(trimmed).length;
    namedKept.push(...namedFacts(trimmed));
    const filled = fillFacts(trimmed, facts);
    if (filled.missing.length > 0) return { ok: false, why: `A sentence named a figure that was neither on the page nor read: ${filled.missing.join(", ")}.` };
    if (filled.text.split(/\s+/).length > MOST_SENTENCE_WORDS) return { ok: false, why: `A sentence ran past ${MOST_SENTENCE_WORDS} words: "${filled.text}".` };
    if (/dataforseo|firecrawl/i.test(filled.text)) return { ok: false, why: "A sentence named a supplier." };
    if (jargon(filled.text)) return { ok: false, why: `A sentence used "${jargon(filled.text)}", which the page never says: use the page's own words.` };
    if (trackingTalk(filled.text)) return { ok: false, why: `A sentence spoke about tracking or what counts, and tracking health found nothing wrong: "${filled.text}".` };
    says.push(filled.text);
  }
  if (options.pageKeys) {
    const beyond = saysRaw.slice(0, MOST_SEES_SAYS).some((line) => typeof line === "string" && namedFacts(line).some((key) => !options.pageKeys!.has(key)));
    if (!beyond) return { ok: false, why: "It only said the page's own figures again: say what the screens you read show behind them, by their keys." };
  }
  const stepsRaw = Array.isArray(raw.steps) ? raw.steps : [];
  const steps: Array<{ words: string; link: string; href: string }> = [];
  for (const entry of stepsRaw.slice(0, MOST_SEES_STEPS)) {
    const step = (entry ?? {}) as { words?: unknown; link?: unknown };
    if (typeof step.words !== "string" || !step.words.trim()) return { ok: false, why: "A step had no words." };
    const words = step.words.trim();
    if (typedNumbers(words).length > 0) return { ok: false, why: `A step typed a number: "${words}".` };
    const filled = fillFacts(words, facts);
    if (filled.missing.length > 0) return { ok: false, why: `A step named a figure that was neither on the page nor read: ${filled.missing.join(", ")}.` };
    if (filled.text.split(/\s+/).length > MOST_SENTENCE_WORDS) return { ok: false, why: `A step ran past ${MOST_SENTENCE_WORDS} words.` };
    if (jargon(filled.text)) return { ok: false, why: `A step used "${jargon(filled.text)}", which the page never says: use the page's own words.` };
    if (trackingTalk(filled.text)) return { ok: false, why: `A step advised on tracking or what counts, and tracking health found nothing wrong: "${filled.text}".` };
    const at = typeof step.link === "number" ? step.link : Number(step.link);
    const link = Number.isInteger(at) ? links[at] : undefined;
    if (!link) return { ok: false, why: "A step's link was not one of the page's." };
    steps.push({ words: filled.text, link: link.label, href: link.href });
  }
  for (const finding of options.mustCover ?? []) {
    if (!finding.keys.some((key) => namedKept.includes(key))) return { ok: false, why: `It left out a finding: "${finding.words}". Cover it by naming one of its figures.` };
  }
  return { ok: true, says, steps };
}

/**
 * Who writes, as the Head chose — held to its rule: a page about conversions goes to the Conversion specialist unless
 * tracking health found a fault, when the measurement specialist may answer. No choice: the Conversion specialist.
 */
export function routeFor(chosen: InsightsRole | null, screen: string, trackingFaults: readonly string[]): InsightsRole {
  const aboutConversions = screen === "googleAnalytics.conversions" || screen.startsWith("googleAnalytics.event:");
  if (!chosen) return "INSIGHTS_CONVERSION";
  if (aboutConversions && chosen === "INSIGHTS_MEASUREMENT" && trackingFaults.length === 0) return "INSIGHTS_CONVERSION";
  return chosen;
}

/** The Head's choice, as a role on the team; null when it named none. */
export function writerFrom(answer: unknown): InsightsRole | null {
  const role = (answer as { specialist?: unknown } | null)?.specialist;
  return typeof role === "string" && (SEES_WRITERS as readonly string[]).includes(role) ? (role as InsightsRole) : null;
}

/**
 * The Head's second look (stronger-agents-plan-2026-10-30.md A5): is this
 * the most useful thing the page says — what a client would act on first?
 * Nobody checked that before; the Editor checks numbers.
 */
export const SECOND_LOOK_FORMAT = [
  "A specialist wrote the bubble below for the page, after reading the website's screens. Decide whether it says the most useful thing the figures say: what a client would act on first, against their own past. A bubble that only repeats the page's boxes, or whose steps anyone could give without the figures, is not.",
  "Not useful: words that skip a part of the page with something to say; a list of figures with no story; steps that would fit any website because they don't say where; advice about tracking or about what counts as a conversion, unless trackingFaults lists a fault or one group's rate is three or more times another's; words that do not say what got better or worse against the span before; words that lead with money; words that say less than the figures hold worth acting on.",
  "Keep it unless yours says something more useful. Never rewrite it into the boxes' figures with \"up from\" or \"down from\": the reader sees those already. A rewrite must name at least one figure the specialist read beyond the page.",
  "Reply with only JSON: {\"useful\": true} when it does; otherwise {\"useful\": false, \"says\": [\"…\"], \"steps\": [{\"words\": \"…\", \"link\": number}]}, written to the same rules as the specialist's: figures by their keys in double square brackets, never typed, from the facts given (the page's and those the specialist read); one fact a sentence; a step naming the thing to fix in words, never a figure glued on; a step's link one of the numbers given.",
].join("\n");

/** The Head's second look, read: kept as is, or its rewrite to check. */
export function secondLookFrom(answer: unknown): { useful: true } | { useful: false; rewrite: unknown } {
  const raw = (answer && typeof answer === "object" ? answer : {}) as { useful?: unknown };
  if (raw.useful === true) return { useful: true };
  return { useful: false, rewrite: answer };
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
