import { appendFileSync } from "fs";
import { expect } from "vitest";
import { CODE_FIRST_MOST_CHARS, CODE_FIRST_ROWS, briefOf, findingNames, findingsBriefOf, pageDataFor, pageFacts } from "@/convex/utils/sees/pageData";
import { findingWords, type Finding } from "@/convex/utils/sees/findings";
import { pageFindings } from "@/convex/utils/sees/pageFindings";
import { seesScreenFor } from "@/convex/utils/sees/screens";
import { readFileSync } from "fs";
import path from "node:path";

/**
 * Each page's most, in characters, set on 7 November 2026 a tenth above its biggest brief on its saved figures and its real ones
 * (`eyeRealAnswers.json`: a live page hands over its charts' figures too, so its brief runs longer). It may shrink,
 * never grow: a page past it has gained a list its writer is handed on every press, which wants a reason, not a bigger number.
 * A page not listed is held to `CODE_FIRST_MOST_CHARS`.
 */
const CEILINGS: Readonly<Record<string, number>> = JSON.parse(readFileSync(path.join(process.cwd(), "src/test/codeFirstBriefCeilings.json"), "utf8"));

/**
 * A page's eye held to its promises on the page's saved figures (eye-code-first-brief-plan-2026-11-07.md, "Tests that stop the
 * eye drifting"; Anthony, 2026-11-07: "We need plenty of tests around the eye to stop drift"). Every test of every period calls
 * it where it works out a page's findings, so every page with saved figures is checked on every date the menu offers:
 *
 * - every row the findings name, anywhere on the page, is in the brief the writer is handed;
 * - the brief stays under its page's most (`codeFirstBriefCeilings.json`, else `CODE_FIRST_MOST_CHARS`), so a new list on a page
 *   can't quietly make every press dearer;
 * - every figure key the writer is handed is one the checker knows: each finding's figures come under its own number, which
 *   is how `writeBubble` hands them to the writer beside their finding, and every key in the brief is one of the page's;
 * - no finding says what its page never talks about (`neverWordsOf`): money on Google Analytics, conversions on Services,
 *   visits on Bing and Search Console, a group called busy or quiet.
 *
 * `src/ask-hakken-chart-pages-drift.test.ts` fails a test of every period that leaves it out.
 */
export function expectEyeHolds(screen: string, data: unknown): void {
  const handed = pageDataFor(data, screen);
  if (handed === null || handed === undefined) return;
  const findings = pageFindings(screen, handed);
  if (findings.length === 0) return;
  const { shown, facts } = pageFacts(screen, handed);
  const named = findingNames(findings);
  const brief = findingsBriefOf(shown, named, CODE_FIRST_ROWS);
  const size = JSON.stringify(brief).length;
  // With PRINT_BRIEFS set to a file, each page's brief beside the short brief it replaced, to tune the limit by.
  if (process.env.PRINT_BRIEFS) appendFileSync(process.env.PRINT_BRIEFS, `${screen}\t${size}\t${JSON.stringify(briefOf(shown, 8)).length}\n`);
  const most = CEILINGS[screen] ?? CODE_FIRST_MOST_CHARS;
  // Measuring the limits themselves: every page printed, none stopped at.
  if (!process.env.PRINT_BRIEFS) expect(size, `${screen}: the writer's brief is ${size} characters, past its ${most}`).toBeLessThanOrEqual(most);
  const inPage = rowNames(shown);
  const inBrief = rowNames(brief);
  const missing = [...named].filter((name) => inPage.has(name) && !inBrief.has(name));
  expect(missing, `${screen}: rows the findings name that the brief left out`).toEqual([]);
  expectKeysKnown(screen, findings, brief, new Set(facts.map((fact) => fact.key)));
  expectNeverSaid(screen, findings, named);
}

/**
 * Every figure key the writer is handed is one the checker knows. A finding's figures reach the writer under its own number
 * (`f2.` for the second: `writeBubble` hands each finding the figures whose keys start so) and join what the checker knows;
 * one under another number would reach the writer beside the wrong finding, or not at all. A key in the brief must be one of
 * the page's, or the writer names a figure the checker sends back.
 */
function expectKeysKnown(screen: string, findings: readonly Finding[], brief: unknown, pageKeys: ReadonlySet<string>): void {
  const seen = new Set<string>();
  findings.forEach((finding, at) => {
    for (const fact of finding.facts) {
      expect(fact.key.startsWith(`f${at + 1}.`), `${screen}: finding ${at + 1} (${findingWords(finding)}) hands ${fact.key}, under another number`).toBe(true);
      expect(Number.isFinite(fact.value), `${screen}: ${fact.key} is ${fact.value}, not a figure`).toBe(true);
      expect(seen.has(fact.key), `${screen}: two figures share ${fact.key}`).toBe(false);
      seen.add(fact.key);
    }
  });
  const unknown = keysIn(brief).filter((key) => !pageKeys.has(key));
  expect(unknown, `${screen}: keys in the writer's brief that the checker doesn't know`).toEqual([]);
}

/** Every [[key]] in the brief's words, read from the words themselves: a product called 4" keeps its inch mark. */
function keysIn(value: unknown, into: string[] = []): string[] {
  if (typeof value === "string") for (const match of value.matchAll(/\[\[([^\]]+)\]\]/g)) into.push(match[1]);
  else if (Array.isArray(value)) for (const item of value) keysIn(item, into);
  else if (value && typeof value === "object") for (const inner of Object.values(value as Record<string, unknown>)) keysIn(inner, into);
  return into;
}

/**
 * The words each topic in a page's `never` list stands for, where the topic is a plain list of what a page never counts
 * ("visits, conversions or enquiries: …"). A topic about how something is said ("enquiries as people", "a day-by-day story")
 * isn't a list of words, so it's left to the writer's rules and the checker.
 */
const NEVER_WORDS: Readonly<Record<string, RegExp>> = {
  // Not "money pages": the app's own name for the pages that make money, which Bing's Crawling counts in its index.
  money: /£|\$|€|\bmoney\b(?! pages?\b)|\brevenue\b|\bearn(?:ed|s)?\b|\bworth\b|\bad spend\b/i,
  sales: /\bsales?\b/i,
  bought: /\bbought\b/i,
  baskets: /\bbaskets?\b/i,
  visits: /\bvisits?\b/i,
  clicks: /\bclicks?\b/i,
  conversions: /\bconversions?\b/i,
  enquiries: /\benquir(?:y|ies)\b/i,
  "times shown": /\btimes shown\b/i,
  places: /\bplaces?\b/i,
  busy: /\bbusy\b/i,
  quiet: /\bquiet\b/i,
  working: /\bworking\b/i,
  "not working": /\bnot working\b/i,
  bing: /\bBing\b/,
  "microsoft clarity": /\bClarity\b/,
};

/** The words a page's `never` list forbids, from each topic before its colon: "a group as busy, quiet …" forbids busy and quiet. */
export function neverWordsOf(never: readonly string[]): Array<{ word: string; pattern: RegExp }> {
  const out = new Map<string, RegExp>();
  for (const entry of never) {
    const topic = entry.split(":")[0].toLowerCase();
    const listed = topic.includes(" as ") ? topic.slice(topic.lastIndexOf(" as ") + 4) : topic;
    for (const part of listed.split(/,\s*|\s+or\s+/)) {
      const word = part.trim().replace(/^the /, "");
      if (NEVER_WORDS[word]) out.set(word, NEVER_WORDS[word]);
    }
  }
  return [...out].map(([word, pattern]) => ({ word, pattern }));
}

/**
 * No finding says what its page never talks about. A row's own name is left out first: a Clarity page called "Enquiry form"
 * is still that page's name.
 */
function expectNeverSaid(screen: string, findings: readonly Finding[], named: ReadonlySet<string>): void {
  const forbidden = neverWordsOf(seesScreenFor(screen)?.never ?? []);
  if (forbidden.length === 0) return;
  const names = [...named].sort((one, other) => other.length - one.length);
  for (const finding of findings) {
    let words = findingWords(finding);
    for (const name of names) words = words.split(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")).join(" ");
    const said = forbidden.filter(({ pattern }) => pattern.test(words)).map(({ word }) => word);
    expect(said, `${screen}: "${findingWords(finding)}" says what this page never talks about`).toEqual([]);
  }
}

/** Every name a page's rows carry, anywhere in it, in lower case: what a finding's name is matched against. */
function rowNames(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        for (const field of Object.values(item as Record<string, unknown>)) if (typeof field === "string" && !field.includes("[[")) into.add(field.trim().toLowerCase());
      }
      rowNames(item, into);
    }
  } else if (value && typeof value === "object") {
    for (const inner of Object.values(value as Record<string, unknown>)) rowNames(inner, into);
  }
  return into;
}
