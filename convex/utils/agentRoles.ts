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
 * The News and email agents (docs/plans/active/knowledge-news-and-digest-
 * plan.md, "The three agents"): the News Collector reads the sources, the
 * Weekly Digest writes the week's issue and queues it, and the Email Sender
 * sends what is queued. Each does a fixed job, like the DataForSEO agents.
 */
export const NEWS_ROLES = ["NEWS_COLLECTOR", "WEEKLY_DIGEST", "EMAIL_SENDER"] as const;

/**
 * The Search Console Collector (docs/plans/active/search-console-plan.md
 * §12): each run starts a run of its own for every website connected to
 * Search Console, which collects that website's newest days.
 */
export const SEARCH_CONSOLE_ROLES = ["SEARCH_CONSOLE_COLLECTOR"] as const;

export const ASSIGNABLE_AGENT_ROLES = [...DATAFORSEO_ROLES, ...NEWS_ROLES, ...SEARCH_CONSOLE_ROLES] as const;

export type DataForSeoRole = (typeof DATAFORSEO_ROLES)[number];
export type NewsRole = (typeof NEWS_ROLES)[number];
export type SearchConsoleRole = (typeof SEARCH_CONSOLE_ROLES)[number];
export type AssignableAgentRole = (typeof ASSIGNABLE_AGENT_ROLES)[number];

/** The roles in the groups the Role dropdown shows them under. */
export const AGENT_ROLE_GROUPS: ReadonlyArray<{ group: "dataforseo" | "news" | "searchConsole"; roles: readonly AssignableAgentRole[] }> = [
  { group: "dataforseo", roles: DATAFORSEO_ROLES },
  { group: "news", roles: NEWS_ROLES },
  { group: "searchConsole", roles: SEARCH_CONSOLE_ROLES },
];

export const newsRoleValidator = v.union(
  v.literal("NEWS_COLLECTOR"),
  v.literal("WEEKLY_DIGEST"),
  v.literal("EMAIL_SENDER"),
);

/** "NONE" is a general agent: it thinks with its model and holds no role. */
export const agentRoleChoiceValidator = v.union(
  v.literal("NONE"),
  v.literal("DATAFORSEO_PLANNER"),
  v.literal("DATAFORSEO_COLLECTOR"),
  v.literal("NEWS_COLLECTOR"),
  v.literal("WEEKLY_DIGEST"),
  v.literal("EMAIL_SENDER"),
  v.literal("SEARCH_CONSOLE_COLLECTOR"),
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

export function isSearchConsoleRole(key: string | undefined): key is SearchConsoleRole {
  return key !== undefined && (SEARCH_CONSOLE_ROLES as readonly string[]).includes(key);
}
