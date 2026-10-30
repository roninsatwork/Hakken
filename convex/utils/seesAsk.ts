import { v } from "convex/values";
import { INSIGHTS_LEAD_ROLE, INSIGHTS_ROLES, type InsightsRole } from "./agentRoles";
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
/** Sentences and steps a bubble holds at most, as the rule's box (utils/hakkenSees.ts). */
export const MOST_SEES_SAYS = 3;
export const MOST_SEES_STEPS = 3;
/** A sentence a client reads at a glance (S7): longer ones go back. */
export const MOST_SENTENCE_WORDS = 24;
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
  "Reply with only JSON: {\"specialist\": the role exactly as given, \"why\": one sentence}.",
].join("\n");

/**
 * What a specialist answers with for the bubble (S5, S7): the shape is fixed
 * in code so the Editor can check it, and the plain-words rule is said again
 * here because a bubble is read in two seconds.
 */
export const SEES_FORMAT = [
  "A reader pressed the eye on one page of the app and will read your words in a speech bubble, in two seconds. Say what this page's figures mean for the business, then what to do first.",
  "Reply with only JSON: {\"says\": [\"…\", \"…\"], \"steps\": [{\"words\": \"…\", \"link\": the number of one of the links given}]}: one to three sentences, up to three steps.",
  "Each sentence: the number first, then what it means; one fact a sentence; under 12 words where you can and never over 24. Name every figure by its key in double square brackets, like [[conv.purchases.now]], and never type a number: each is filled in from the page. Never a list of names inside a sentence: say how many, and let the step's link show them.",
  "Each step is one thing a person can do, in plain words, with the link that takes them there. Use the words the page uses for things, never Google's own names for events.",
  "The most useful thing first: what a client would act on, never what did not happen.",
].join("\n");

/** Why a written bubble was sent back: for the run's log, in plain words. */
export type SeesVerdict = { ok: true; says: string[]; steps: Array<{ words: string; link: string; href: string }> } | { ok: false; why: string };

/**
 * The Editor's code checks on what a specialist wrote (S5, S7; the weekly
 * run's rule 1: an AI never types a figure): every sentence names only facts
 * the page handed over and types no number, is one to twenty-four words and
 * names no supplier; every step is one plain sentence with one of the page's
 * links. Anything else goes back, and the bubble keeps the rule's words.
 */
export function seesFrom(answer: unknown, facts: ReadonlyMap<string, Fact>, links: readonly SeesLink[]): SeesVerdict {
  const raw = (answer && typeof answer === "object" ? answer : {}) as { says?: unknown; steps?: unknown };
  const saysRaw = Array.isArray(raw.says) ? raw.says : [];
  if (saysRaw.length === 0) return { ok: false, why: "It said nothing." };
  const says: string[] = [];
  for (const line of saysRaw.slice(0, MOST_SEES_SAYS)) {
    if (typeof line !== "string" || !line.trim()) return { ok: false, why: "A sentence was empty." };
    const trimmed = line.trim();
    if (typedNumbers(trimmed).length > 0) return { ok: false, why: `A sentence typed a number: "${trimmed}".` };
    if (namedFacts(trimmed).length === 0 && says.length === 0) return { ok: false, why: `The first sentence names no figure: "${trimmed}".` };
    const filled = fillFacts(trimmed, facts);
    if (filled.missing.length > 0) return { ok: false, why: `A sentence named a figure the page does not hold: ${filled.missing.join(", ")}.` };
    if (filled.text.split(/\s+/).length > MOST_SENTENCE_WORDS) return { ok: false, why: `A sentence ran past ${MOST_SENTENCE_WORDS} words: "${filled.text}".` };
    if (/dataforseo|firecrawl/i.test(filled.text)) return { ok: false, why: "A sentence named a supplier." };
    says.push(filled.text);
  }
  const stepsRaw = Array.isArray(raw.steps) ? raw.steps : [];
  const steps: Array<{ words: string; link: string; href: string }> = [];
  for (const entry of stepsRaw.slice(0, MOST_SEES_STEPS)) {
    const step = (entry ?? {}) as { words?: unknown; link?: unknown };
    if (typeof step.words !== "string" || !step.words.trim()) return { ok: false, why: "A step had no words." };
    const words = step.words.trim();
    if (typedNumbers(words).length > 0) return { ok: false, why: `A step typed a number: "${words}".` };
    const filled = fillFacts(words, facts);
    if (filled.missing.length > 0) return { ok: false, why: `A step named a figure the page does not hold: ${filled.missing.join(", ")}.` };
    if (filled.text.split(/\s+/).length > MOST_SENTENCE_WORDS) return { ok: false, why: `A step ran past ${MOST_SENTENCE_WORDS} words.` };
    const at = typeof step.link === "number" ? step.link : Number(step.link);
    const link = Number.isInteger(at) ? links[at] : undefined;
    if (!link) return { ok: false, why: "A step's link was not one of the page's." };
    steps.push({ words: filled.text, link: link.label, href: link.href });
  }
  return { ok: true, says, steps };
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
  "A specialist wrote the bubble below for the page. Decide whether it says the most useful thing this page's figures say: what a client would act on first, against their own past.",
  "Reply with only JSON: {\"useful\": true} when it does; otherwise {\"useful\": false, \"says\": [\"…\"], \"steps\": [{\"words\": \"…\", \"link\": number}]}, written to the same rules as the specialist's: figures by their keys in double square brackets, never typed; one fact a sentence; a step's link one of the numbers given.",
].join("\n");

/** The Head's second look, read: kept as is, or its rewrite to check. */
export function secondLookFrom(answer: unknown): { useful: true } | { useful: false; rewrite: unknown } {
  const raw = (answer && typeof answer === "object" ? answer : {}) as { useful?: unknown };
  if (raw.useful === true) return { useful: true };
  return { useful: false, rewrite: answer };
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
