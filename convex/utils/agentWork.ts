/**
 * What each agent does and when it runs, for the Agents screen's filters and
 * its Runs column (docs/plans/active/agents-and-clarity-plan.md, Part 5, AG1–AG4;
 * drawn on the Hakken — Agents canvas and liked 2026-10-16).
 *
 * Read from an agent's role (`systemKey`), so no agent carries a field of its
 * own for it. An agent run by a timer in `crons.ts` names that timer here, and
 * `agentWork.test.ts` fails when the two disagree, so the screen never says
 * one time while the platform runs at another. An agent run by a row on the
 * Schedules page shows that row's own wording instead.
 */

/** What an agent does, in the order the filters list them. */
export const AGENT_WORK_KINDS = ["collect", "insights", "tasks", "assist", "write", "wiki", "platform", "own"] as const;
export type AgentWorkKind = (typeof AGENT_WORK_KINDS)[number];

/** When an agent runs, in the order the filters list them. */
export const AGENT_RUN_KINDS = ["schedule", "team", "event", "asked", "never"] as const;
export type AgentRunKind = (typeof AGENT_RUN_KINDS)[number];

/** What sets off an agent that runs when something happens or someone asks. */
export type AgentTrigger = "saved" | "imported" | "answered" | "sensitive" | "collected" | "asked" | "yes" | "lookUp";

/** A timer in `crons.ts`, as written there. */
export type AgentTimer =
  | { cron: string; every: { minutes?: number; hours?: number } }
  | { cron: string; daily: { hourUTC: number; minuteUTC: number } }
  | { cron: string; monthly: { day: number; hourUTC: number; minuteUTC: number } };

export type AgentWork = { what: AgentWorkKind; when: AgentRunKind; timer?: AgentTimer; trigger?: AgentTrigger };

const scheduled = (what: AgentWorkKind): AgentWork => ({ what, when: "schedule" });
const INSIGHTS_TEAM: AgentWork = { what: "insights", when: "team" };
const DAILY_SWEEP = (cron: string): AgentWork => ({ what: "wiki", when: "schedule", timer: { cron, every: { hours: 24 } } });

export const AGENT_WORK: Readonly<Record<string, AgentWork>> = {
  // Collecting data: each on its row of the Schedules page.
  DATAFORSEO_PLANNER: scheduled("collect"),
  DATAFORSEO_COLLECTOR: scheduled("collect"),
  SEARCH_CONSOLE_COLLECTOR: scheduled("collect"),
  GOOGLE_ANALYTICS_COLLECTOR: scheduled("collect"),
  BING_WEBMASTER_COLLECTOR: scheduled("collect"),
  NEWS_COLLECTOR: scheduled("collect"),
  // Auto Classify (auto-classify-plan.md, AC6): sorts each website's pages into its page groups, on its own row of the Schedules page.
  AUTO_CLASSIFIER: scheduled("collect"),
  // The Insights team: the Head of Strategy on its schedule, the rest inside its run.
  INSIGHTS_HEAD_OF_STRATEGY: scheduled("insights"),
  INSIGHTS_ANALYST: INSIGHTS_TEAM,
  INSIGHTS_MARKET: INSIGHTS_TEAM,
  INSIGHTS_TECHNICAL: INSIGHTS_TEAM,
  INSIGHTS_SEARCH: INSIGHTS_TEAM,
  INSIGHTS_CANNIBALISATION: INSIGHTS_TEAM,
  INSIGHTS_PAGE_DECISIONS: INSIGHTS_TEAM,
  INSIGHTS_LOCAL: INSIGHTS_TEAM,
  INSIGHTS_LINKS: INSIGHTS_TEAM,
  INSIGHTS_AI_VISIBILITY: INSIGHTS_TEAM,
  INSIGHTS_CONVERSION: INSIGHTS_TEAM,
  INSIGHTS_MEASUREMENT: INSIGHTS_TEAM,
  INSIGHTS_EDITOR: INSIGHTS_TEAM,
  INSIGHTS_REPORT_WRITER: INSIGHTS_TEAM,
  // Hakken tasks: alerts, reports and the daily care, each on its timer.
  HAKKEN_WATCHER: { what: "tasks", when: "schedule", timer: { cron: "hakken-task-watch", every: { minutes: 15 } } },
  HAKKEN_STAT_REPORTER: { what: "tasks", when: "schedule", timer: { cron: "hakken-task-reports", every: { minutes: 15 } } },
  HAKKEN_CARETAKER: { what: "tasks", when: "schedule", timer: { cron: "hakken-task-care", daily: { hourUTC: 5, minuteUTC: 30 } } },
  // The assistant and research: when someone asks.
  ASSISTANT: { what: "assist", when: "asked", trigger: "asked" },
  HAKKEN_RESEARCHER: { what: "assist", when: "asked", trigger: "yes" },
  KEYWORD_RESEARCH: { what: "assist", when: "asked", trigger: "lookUp" },
  // Writing and sending.
  CONTENT_TRANSLATOR: { what: "write", when: "event", trigger: "saved" },
  REVIEW_REPLIER: { what: "write", when: "event", trigger: "collected" },
  OUTBOX_QUEUE_PROCESSOR: { what: "write", when: "schedule", timer: { cron: "outbox-watch", every: { hours: 1 } } },
  WEEKLY_DIGEST: scheduled("write"),
  // The wiki's staff.
  WIKI_DISTILLER: { what: "wiki", when: "event", trigger: "imported" },
  WIKI_REVIEWER: { what: "wiki", when: "event", trigger: "sensitive" },
  WIKI_FILING_CLERK: { what: "wiki", when: "event", trigger: "answered" },
  WIKI_CONTRADICTION_FINDER: DAILY_SWEEP("wiki-contradiction-sweep"),
  WIKI_FRESHNESS_CHECKER: DAILY_SWEEP("wiki-freshness-sweep"),
  WIKI_LINKER: DAILY_SWEEP("wiki-tending-sweep"),
  WIKI_TIDIER: DAILY_SWEEP("wiki-tending-sweep"),
  WIKI_EXAMINER: { what: "wiki", when: "schedule", timer: { cron: "wiki-exam-growth", monthly: { day: 1, hourUTC: 8, minuteUTC: 0 } } },
  // The platform's own: never run on their own.
  PLATFORM_AI: { what: "platform", when: "never" },
  DECISION_MAKER: { what: "platform", when: "never" },
};

/**
 * An agent's work: from its role, or — an agent someone made with New Agent —
 * its own, run on its schedule if it has one and otherwise when someone runs it.
 * A role not in the map is the platform's, run when asked, until it is added.
 */
export function agentWorkOf(systemKey: string | undefined, hasSchedule: boolean): AgentWork {
  if (!systemKey) return { what: "own", when: hasSchedule ? "schedule" : "asked", trigger: hasSchedule ? undefined : "asked" };
  return AGENT_WORK[systemKey] ?? { what: "platform", when: "asked", trigger: "asked" };
}
