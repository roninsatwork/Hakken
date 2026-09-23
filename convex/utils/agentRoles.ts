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
export const ASSIGNABLE_AGENT_ROLES = ["DATAFORSEO_PLANNER", "DATAFORSEO_COLLECTOR"] as const;

export type AssignableAgentRole = (typeof ASSIGNABLE_AGENT_ROLES)[number];

/** "NONE" is a general agent: it thinks with its model and holds no role. */
export const agentRoleChoiceValidator = v.union(
  v.literal("NONE"),
  v.literal("DATAFORSEO_PLANNER"),
  v.literal("DATAFORSEO_COLLECTOR"),
);

export type AgentRoleChoice = "NONE" | AssignableAgentRole;

export function isAssignableAgentRole(key: string | undefined): key is AssignableAgentRole {
  return key !== undefined && (ASSIGNABLE_AGENT_ROLES as readonly string[]).includes(key);
}
