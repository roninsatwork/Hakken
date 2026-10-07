import { pathOf, type TaskCondition, type TaskMeasure } from "./hakkenTaskRules";

/**
 * An alert's words (docs/plans/active/hakken-tasks-plan.md, items 1.3 and
 * 1.4): the plain template, and the check every model-written alert passes —
 * a number in its words that is not in the checked figures sends the template
 * instead ("A model inventing a figure", the plan's risks). Plain code.
 */

export type AlertFacts = {
  website: string;
  page?: string;
  measure: TaskMeasure;
  condition: TaskCondition;
  day: string;
  value: number;
  usual: number | null;
  /** Days in a row the rule has now been met. */
  streak: number;
};

export type AlertWords = { headline: string; body: string };

/** "2026-10-05" as people say it: "Monday 5 October". */
export function dayWords(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

const isQuiet = (condition: TaskCondition) => condition.op === "below" || condition.op === "dropBy";

/** The alert without a model: true, friendly and short. */
export function alertTemplate(facts: AlertFacts): AlertWords {
  const what = facts.page ? pathOf(facts.page) : facts.website;
  const figure = facts.measure === "visitors"
    ? `${facts.value.toLocaleString("en-GB")} ${facts.value === 1 ? "visitor" : "visitors"} from Google`
    : `shown in Google ${facts.value.toLocaleString("en-GB")} ${facts.value === 1 ? "time" : "times"}`;
  const had = facts.measure === "visitors" ? `It had ${figure}` : `It was ${figure}`;
  const usual = facts.usual !== null ? ` It usually ${facts.measure === "visitors" ? "gets" : "shows up"} about ${facts.usual.toLocaleString("en-GB")}${facts.measure === "visitors" ? "" : " times"} a day.` : "";
  const running = facts.streak > 1 ? ` That's ${facts.streak} days in a row.` : "";
  return {
    headline: `${what} had a ${isQuiet(facts.condition) ? "quiet" : "busy"} day`,
    body: `${had} on ${dayWords(facts.day)}.${usual}${running}`,
  };
}

/** Every number the alert may say: its figures, its rule, its date. */
export function numbersAllowed(facts: AlertFacts): Set<number> {
  const date = new Date(`${facts.day}T12:00:00Z`);
  return new Set([
    facts.value,
    facts.condition.value,
    facts.condition.days,
    facts.streak,
    ...(facts.usual !== null ? [facts.usual] : []),
    date.getUTCDate(),
    date.getUTCFullYear(),
  ]);
}

/** The numbers written in some words: "1,000", "23", "50%" → 1000, 23, 50. */
export function numbersIn(text: string): number[] {
  return [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((match) => Number(match[0].replace(/,/g, "")));
}

/**
 * The model's alert, if it is one: JSON with a headline and a body, each
 * short, and no number the checked figures do not hold. Otherwise null, and
 * the template is sent.
 */
export function checkedAlert(text: string, facts: AlertFacts): AlertWords | null {
  const body = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;
  const headline = typeof record.headline === "string" ? record.headline.trim() : "";
  const sentence = typeof record.body === "string" ? record.body.trim() : "";
  if (!headline || !sentence || headline.length > 90 || sentence.length > 400) return null;
  const allowed = numbersAllowed(facts);
  const pagePath = facts.page ? pathOf(facts.page) : "";
  const said = numbersIn(`${headline} ${sentence}`.replace(pagePath, "").replace(facts.website, ""));
  if (said.some((number) => !allowed.has(number))) return null;
  return { headline, body: sentence };
}
