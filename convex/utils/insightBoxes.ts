import { v } from "convex/values";
import type { InsightsRole } from "./agentRoles";
import { fillFacts, type Fact } from "./insightFacts";
import { typedNumbers } from "./insightEditor";

/**
 * Each Insights screen's "What Hakken sees" box, written by its discipline's
 * specialist each week (insights-one-voice-plan.md phase 4; Anthony, 12
 * October 2026: "we need to bring the insights section up to this same
 * standard"): from the figures of its own discipline, every one named by its
 * fact and filled in as the Editor fills a finding's, kept once, and read by
 * the screen and by Ask Hakken alike. A screen with no box this week shows
 * its own sentences, as it did before. Track record's figures aren't in the
 * run's reading, so its box stays the screen's own.
 */

export const BOX_SCREENS = ["ENQUIRIES", "AI_SEARCH", "LEADERBOARDS", "MEASUREMENT", "OPPORTUNITIES", "STRATEGY"] as const;
export type BoxScreen = (typeof BOX_SCREENS)[number];
export const boxScreenValidator = v.union(...BOX_SCREENS.map((screen) => v.literal(screen)));

/** Sentences a box keeps at most. */
const MOST_SAYS = 3;
/** Figures a specialist is given for its boxes at most. */
export const MOST_BOX_FACTS = 220;

type BoxSpec = {
  role: InsightsRole;
  /** The facts of its discipline, by the start of their keys. */
  facts: readonly string[];
  /** What the box should say, as the specialist is asked it. */
  wants: string;
  /** The screen, for Ask Hakken's link. */
  link: string;
  /** Written for the period the screen opens on, the newest whole month; shown only when that period is chosen. */
  period?: boolean;
};

export const BOXES: Record<BoxScreen, BoxSpec> = {
  ENQUIRIES: {
    role: "INSIGHTS_CONVERSION",
    facts: ["why.", "month.", "ga.conversions.", "ga.people.", "ga.peoplePerConversion.", "ga.visits."],
    wants: "Enquiries and pages, for the newest whole month: how many enquiries came, from how many people, against the month before and the same month a year before, and which kinds of page and sources moved them.",
    link: "/app/insights/enquiries",
    period: true,
  },
  AI_SEARCH: {
    role: "INSIGHTS_AI_VISIBILITY",
    facts: ["ai.", "seo."],
    wants: "AI search: how often AI assistants and Google's AI answers name, recommend and cite the business against its rivals, and how that moved.",
    link: "/app/insights/ai-search",
  },
  LEADERBOARDS: {
    role: "INSIGHTS_MARKET",
    facts: ["seo."],
    wants: "The leaderboards: where the business stands among its rivals on organic traffic, website strength, linking websites and searches in the top three, and who is gaining or losing.",
    link: "/app/insights/leaderboards",
  },
  MEASUREMENT: {
    role: "INSIGHTS_MEASUREMENT",
    facts: ["ga.counted.", "ga.event.", "ga.conversions.", "tech."],
    wants: "Measurement: whether the enquiries can be trusted — what is counted as an enquiry and how often — and whether Google can read the money pages.",
    link: "/app/insights/measurement",
  },
  OPPORTUNITIES: {
    role: "INSIGHTS_SEARCH",
    facts: ["sc.", "month.googleClicks."],
    wants: "Opportunities: the searches and pages nearest to winning more Google clicks, where the website sits for them, and how its clicks moved.",
    link: "/app/insights/opportunities",
  },
  STRATEGY: {
    role: "INSIGHTS_HEAD_OF_STRATEGY",
    facts: ["ga.conversions.365.", "ga.visits.365.", "ga.conversions.90.", "ga.people.90.", "sc.clicks.90.", "sc.clicks.30."],
    wants: "Strategy for the quarter: where the business's enquiries come from now against a year before, and what that means for which services to grow.",
    link: "/app/insights/strategy",
  },
};

/** The shape of a box answer, fixed in code so the run can read it (shown read-only on each writer's Instructions page). */
export const BOX_FORMAT = [
  "Some of the screens your discipline owns open with a summary box that a business owner reads first. Write it for each screen you are given, from the facts given.",
  "Answer in JSON only: {\"boxes\": [{\"screen\": the screen as given, \"says\": [\"…\", \"…\"]}]} — two or three plain sentences a screen, what matters most first, against the business's own past or its rivals.",
  "Name every figure by its key in double square brackets, like [[ga.conversions.90.now]], never type a number; a sentence naming a figure not given is left out.",
].join("\n");

/** The facts a screen's box is written from: its discipline's, at most `MOST_BOX_FACTS`. */
export function factsForBox(screen: BoxScreen, facts: readonly Fact[]): Fact[] {
  return facts.filter((fact) => BOXES[screen].facts.some((start) => fact.key.startsWith(start))).slice(0, MOST_BOX_FACTS);
}

/**
 * A specialist's boxes, each sentence filled from its facts — kept only when
 * every figure it names is held and none is typed — for the screens it was
 * asked about; a box with no sentence left isn't kept.
 */
export function boxesFrom(answer: unknown, screens: readonly BoxScreen[], facts: ReadonlyMap<string, Fact>): Array<{ screen: BoxScreen; says: string[] }> {
  const raw = (answer && typeof answer === "object" ? answer : {}) as { boxes?: unknown };
  const out = new Map<BoxScreen, string[]>();
  for (const entry of Array.isArray(raw.boxes) ? raw.boxes : []) {
    const { screen, says } = (entry ?? {}) as { screen?: unknown; says?: unknown };
    if (typeof screen !== "string" || !(screens as readonly string[]).includes(screen) || out.has(screen as BoxScreen)) continue;
    const kept = (Array.isArray(says) ? says : []).flatMap((line) => {
      if (typeof line !== "string" || !line.trim() || typedNumbers(line).length > 0) return [];
      const filled = fillFacts(line.trim(), facts);
      return filled.missing.length > 0 ? [] : [filled.text];
    }).slice(0, MOST_SAYS);
    if (kept.length > 0) out.set(screen as BoxScreen, kept);
  }
  return [...out].map(([screen, says]) => ({ screen, says }));
}

/** The screens each specialist writes: one request each. */
export function screensByRole(): Map<InsightsRole, BoxScreen[]> {
  const out = new Map<InsightsRole, BoxScreen[]>();
  for (const screen of BOX_SCREENS) out.set(BOXES[screen].role, [...(out.get(BOXES[screen].role) ?? []), screen]);
  return out;
}

/** Each specialist's name as Ask Hakken says it. */
const WRITERS: Partial<Record<InsightsRole, string>> = {
  INSIGHTS_CONVERSION: "the Conversion specialist", INSIGHTS_AI_VISIBILITY: "the AI visibility specialist", INSIGHTS_MARKET: "the Market specialist",
  INSIGHTS_MEASUREMENT: "the Measurement specialist", INSIGHTS_SEARCH: "the Search and content specialist", INSIGHTS_HEAD_OF_STRATEGY: "the Head of Strategy",
};

/** The boxes for Ask Hakken: what each screen says, as its specialist wrote it this week. */
export function boxesForAssistant(boxes: ReadonlyArray<{ screen: BoxScreen; says: string[]; role: string; week: string }>) {
  return {
    rule: "What each Insights screen's summary box says, as its specialist wrote it. Give it as written when asked what a screen says; add detail from the screen when asked, never different advice.",
    screens: boxes.map((box) => ({
      screen: BOXES[box.screen].link,
      says: box.says.join(" "),
      written_by: `${WRITERS[box.role as InsightsRole] ?? "its specialist"}, in the week of ${box.week}`,
    })),
  };
}
