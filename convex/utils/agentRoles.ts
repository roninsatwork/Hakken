import { v } from "convex/values";

/**
 * The jobs an operator can give an agent from its Settings page.
 *
 * Anthony, 2026-09-23: the DataForSEO work was found by the agent's *name*
 * ("DataForSEO Agent"), so renaming it broke the screen that looked for it.
 * A role is stored on the agent's `systemKey` — the same field the wiki staff
 * and the Decisions agent already carry — and nothing looks an agent up by
 * name. Kept here, free of any Convex function, so the Settings screen can
 * list the same roles the server accepts.
 *
 * Only these can be chosen or cleared. Any other `systemKey` (the wiki staff,
 * the Decisions agent) is a fixed role: seeded, shown on the screen, never
 * reassigned, because the code that runs them finds them by that key.
 */
export const DATAFORSEO_ROLES = ["DATAFORSEO_PLANNER", "DATAFORSEO_COLLECTOR"] as const;

/**
 * The News agents (docs/plans/active/knowledge-news-and-digest-plan.md, "The
 * three agents"): the News Collector reads the sources and the Weekly Digest
 * writes the week's issue and queues it. Each does a fixed job, like the
 * DataForSEO agents. The third, the Email Sender, is now the built-in Outbox
 * Queue Processing Agent (outbox-and-preferences-plan.md, A2), no role to give.
 */
export const NEWS_ROLES = ["NEWS_COLLECTOR", "WEEKLY_DIGEST"] as const;

/**
 * The Search Console Collector (docs/plans/active/search-console-plan.md
 * §12): each run starts a run of its own for every website connected to
 * Search Console, which collects that website's newest days.
 */
export const SEARCH_CONSOLE_ROLES = ["SEARCH_CONSOLE_COLLECTOR"] as const;

/**
 * The Google Analytics Collector (docs/plans/active/google-analytics-plan.md
 * §4.1, GA21): each run starts a run of its own for every website connected
 * to Google Analytics, which collects that website's newest days and asks
 * Google for its ready-made lists.
 */
export const GOOGLE_ANALYTICS_ROLES = ["GOOGLE_ANALYTICS_COLLECTOR"] as const;

/**
 * The Bing Webmaster Collector (docs/plans/active/bing-webmaster-plan.md
 * §4.1, BW8): each run starts a run of its own for every website connected
 * to Bing Webmaster Tools, which collects its days, keywords and pages.
 */
export const BING_WEBMASTER_ROLES = ["BING_WEBMASTER_COLLECTOR"] as const;

/**
 * The Keyword research agent (docs/plans/active/keyword-research-plan.md):
 * buys a company's lookups from DataForSEO when someone presses Look up, and
 * only those (Anthony, 2026-10-04: "A new Keyword research agent"). Its own
 * job, not the Collector's, so a lookup never waits behind a collection.
 */
export const RESEARCH_ROLES = ["KEYWORD_RESEARCH"] as const;

/**
 * The Insights team (docs/plans/active/insights-analyst-plan.md §6, I20): the
 * Head of Strategy, whose weekly run is the team's — it reads each owned
 * website's sources, has each specialist look at its own discipline, connects
 * what they found, and has the Editor check every figure before anything is
 * saved — and the specialists, the Editor and the Report Writer, whose agents
 * give each step its own model, instructions and spend limit. Only the Head of
 * Strategy's run starts the work; the others run inside it.
 */
export const INSIGHTS_LEAD_ROLE = "INSIGHTS_HEAD_OF_STRATEGY";
export const INSIGHTS_ROLES = [
  INSIGHTS_LEAD_ROLE,
  // Why the enquiries moved, each month, across every source (insights-intelligence-plan.md phase 8; Anthony, 2026-10-12).
  "INSIGHTS_ANALYST",
  "INSIGHTS_MARKET",
  "INSIGHTS_TECHNICAL",
  "INSIGHTS_SEARCH",
  // Which page should own each search where pages compete, handed its groups by the Head of Strategy (Anthony, 2026-10-12).
  "INSIGHTS_CANNIBALISATION",
  // Every page's verdict beyond the rule's — keep, improve, merge, redirect, remove — handed its pages by the Head of Strategy (2026-10-12).
  "INSIGHTS_PAGE_DECISIONS",
  "INSIGHTS_LOCAL",
  "INSIGHTS_LINKS",
  "INSIGHTS_AI_VISIBILITY",
  "INSIGHTS_CONVERSION",
  "INSIGHTS_MEASUREMENT",
  "INSIGHTS_EDITOR",
  "INSIGHTS_REPORT_WRITER",
] as const;

export const ASSIGNABLE_AGENT_ROLES = [...DATAFORSEO_ROLES, ...RESEARCH_ROLES, ...NEWS_ROLES, ...SEARCH_CONSOLE_ROLES, ...GOOGLE_ANALYTICS_ROLES, ...BING_WEBMASTER_ROLES, ...INSIGHTS_ROLES] as const;

export type DataForSeoRole = (typeof DATAFORSEO_ROLES)[number];
export type NewsRole = (typeof NEWS_ROLES)[number];
export type SearchConsoleRole = (typeof SEARCH_CONSOLE_ROLES)[number];
export type GoogleAnalyticsRole = (typeof GOOGLE_ANALYTICS_ROLES)[number];
export type BingWebmasterRole = (typeof BING_WEBMASTER_ROLES)[number];
export type ResearchRole = (typeof RESEARCH_ROLES)[number];
export type InsightsRole = (typeof INSIGHTS_ROLES)[number];
export type AssignableAgentRole = (typeof ASSIGNABLE_AGENT_ROLES)[number];

/** The roles in the groups the Role dropdown shows them under. */
export const AGENT_ROLE_GROUPS: ReadonlyArray<{ group: "dataforseo" | "news" | "searchConsole" | "googleAnalytics" | "bingWebmaster" | "insights"; roles: readonly AssignableAgentRole[] }> = [
  { group: "dataforseo", roles: [...DATAFORSEO_ROLES, ...RESEARCH_ROLES] },
  { group: "news", roles: NEWS_ROLES },
  { group: "searchConsole", roles: SEARCH_CONSOLE_ROLES },
  { group: "googleAnalytics", roles: GOOGLE_ANALYTICS_ROLES },
  { group: "bingWebmaster", roles: BING_WEBMASTER_ROLES },
  { group: "insights", roles: INSIGHTS_ROLES },
];

export const newsRoleValidator = v.union(
  v.literal("NEWS_COLLECTOR"),
  v.literal("WEEKLY_DIGEST"),
);

/** "NONE" is a general agent: it thinks with its model and holds no role. */
export const agentRoleChoiceValidator = v.union(
  v.literal("NONE"),
  v.literal("DATAFORSEO_PLANNER"),
  v.literal("DATAFORSEO_COLLECTOR"),
  v.literal("NEWS_COLLECTOR"),
  v.literal("WEEKLY_DIGEST"),
  v.literal("SEARCH_CONSOLE_COLLECTOR"),
  v.literal("GOOGLE_ANALYTICS_COLLECTOR"),
  v.literal("BING_WEBMASTER_COLLECTOR"),
  v.literal("KEYWORD_RESEARCH"),
  ...INSIGHTS_ROLES.map((role) => v.literal(role)),
);

export type AgentRoleChoice = "NONE" | AssignableAgentRole;

export function isAssignableAgentRole(key: string | undefined): key is AssignableAgentRole {
  return key !== undefined && (ASSIGNABLE_AGENT_ROLES as readonly string[]).includes(key);
}

export function isDataForSeoRole(key: string | undefined): key is DataForSeoRole {
  return key !== undefined && (DATAFORSEO_ROLES as readonly string[]).includes(key);
}

export function isNewsRole(key: string | undefined): key is NewsRole {
  return key !== undefined && (NEWS_ROLES as readonly string[]).includes(key);
}

export function isResearchRole(key: string | undefined): key is ResearchRole {
  return key !== undefined && (RESEARCH_ROLES as readonly string[]).includes(key);
}

export function isSearchConsoleRole(key: string | undefined): key is SearchConsoleRole {
  return key !== undefined && (SEARCH_CONSOLE_ROLES as readonly string[]).includes(key);
}

export function isGoogleAnalyticsRole(key: string | undefined): key is GoogleAnalyticsRole {
  return key !== undefined && (GOOGLE_ANALYTICS_ROLES as readonly string[]).includes(key);
}

export function isBingWebmasterRole(key: string | undefined): key is BingWebmasterRole {
  return key !== undefined && (BING_WEBMASTER_ROLES as readonly string[]).includes(key);
}

export function isInsightsRole(key: string | undefined): key is InsightsRole {
  return key !== undefined && (INSIGHTS_ROLES as readonly string[]).includes(key);
}
