/**
 * Alerts on AI answers and Google rankings (docs/plans/active/
 * hakken-tasks-plan.md, item 4.3): when one counts, and the alert's words.
 * The Watcher judges each new answer or check in plain code — an engine's
 * newest answer to a tracked question, a tracked search's newest position —
 * and its owner hears once for each one that meets their rule. Free of any
 * Convex function, so the proposal, the Watcher and the screens agree.
 */

import { AI_ENGINES, AI_ENGINE_NAMES, type AiEngine } from "../seoAiEngines";

export type { AiEngine };
export type AnswerWatch = { prompt: string; engine: AiEngine; watch: "notRecommended" | "notNamed" | "warnedAgainst" };
export type RankingWatch = { keyword: string; op: "outOfTop" | "intoTop"; position: number };
export type Stance = "RECOMMENDED" | "NAMED" | "WARNED_AGAINST" | "NOT_NAMED";

/** "ChatGPT" for chatgpt: as people write the engine's name (`seoAiEngines.ts`). */
export function engineName(engine: AiEngine): string {
  return AI_ENGINE_NAMES[engine];
}

/** An engine from what a person said: "ChatGPT", "chat gpt", "Perplexity". ChatGPT when it cannot tell. */
export function engineOf(said: unknown): AiEngine {
  const words = typeof said === "string" ? said.toLowerCase().replace(/[^a-z]/g, "") : "";
  return AI_ENGINES.find((engine) => words.includes(engine.slice(0, 4))) ?? "chatgpt";
}

/** Whether an engine's newest answer meets the rule. */
export function answerMet(stance: Stance, watch: AnswerWatch["watch"]): boolean {
  if (watch === "notRecommended") return stance !== "RECOMMENDED";
  if (watch === "notNamed") return stance === "NOT_NAMED";
  return stance === "WARNED_AGAINST";
}

/** Whether a search's newest position meets the rule: no position is out of every top. */
export function rankingMet(position: number | null, ranking: Pick<RankingWatch, "op" | "position">): boolean {
  return ranking.op === "outOfTop" ? position === null || position > ranking.position : position !== null && position <= ranking.position;
}

/** The alert in plain words, as the Hakken tasks page shows it. */
export function answerTitle(answer: AnswerWatch): string {
  const what = { notRecommended: "stops recommending us", notNamed: "stops naming us", warnedAgainst: "warns against us" }[answer.watch];
  return `Tell me if ${engineName(answer.engine)} ${what} for “${answer.prompt}”`;
}

export function rankingTitle(ranking: RankingWatch, website: string): string {
  return ranking.op === "outOfTop"
    ? `Tell me if ${website} drops out of Google’s top ${ranking.position} for “${ranking.keyword}”`
    : `Tell me when ${website} gets into Google’s top ${ranking.position} for “${ranking.keyword}”`;
}

/** "Monday 5 October", for an alert's words. */
function dayWords(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

/** The alert's words for a new answer that met its rule: what happened, and when. */
export function answerAlertWords(answer: AnswerWatch, stance: Stance, day: string, website: string): { headline: string; body: string } {
  const engine = engineName(answer.engine);
  const headline = {
    notRecommended: `${engine} stopped recommending you for “${answer.prompt}”`,
    notNamed: `${engine} left you out for “${answer.prompt}”`,
    warnedAgainst: `${engine} warned against you for “${answer.prompt}”`,
  }[answer.watch];
  const how = {
    RECOMMENDED: `recommended ${website}`,
    NAMED: `named ${website} without recommending it`,
    WARNED_AGAINST: `warned against ${website}`,
    NOT_NAMED: `didn't name ${website}`,
  }[stance];
  return { headline, body: `Its newest answer, on ${dayWords(day)}, ${how}.` };
}

/** The alert's words for a new check that met its rule. */
export function rankingAlertWords(ranking: RankingWatch, position: number | null, day: string, website: string): { headline: string; body: string } {
  const headline = ranking.op === "outOfTop"
    ? `${website} dropped out of Google’s top ${ranking.position} for “${ranking.keyword}”`
    : `${website} got into Google’s top ${ranking.position} for “${ranking.keyword}”`;
  const where = position === null ? "wasn't in Google’s results" : `was at position ${position}`;
  return { headline, body: `When it was checked on ${dayWords(day)}, it ${where}.` };
}
