import {
  AGENT_OBJECTIVE_LIMIT_CEILINGS,
  DEFAULT_AGENT_OBJECTIVE_LIMITS,
} from "@/convex/agentRuntimeService";

/**
 * The budget figures both agent screens show, read from what the runtime
 * actually enforces.
 *
 * The create screen and the settings screen each declared their own copy of
 * these, and they drifted: the settings screen offered 500 steps and 500 tool
 * calls, the create screen 100. Both claimed to be stating the platform ceiling
 * and only one of them was — so a new agent looked more tightly bounded than an
 * existing one, and anyone reading the two side by side had no way to tell which
 * was true. Anthony spotted it, 2026-08-17, doing exactly that.
 *
 * There was a guard against this, and it watched only the settings screen. The
 * screen it did not watch is the one that drifted. Deriving both from the
 * runtime removes the thing the guard was guarding.
 */

export const AGENT_LIMIT_DEFAULTS = {
  maxSteps: DEFAULT_AGENT_OBJECTIVE_LIMITS.maxSteps,
  maxToolCalls: DEFAULT_AGENT_OBJECTIVE_LIMITS.maxToolCalls,
  maxRuntimeMinutes: DEFAULT_AGENT_OBJECTIVE_LIMITS.maxRuntimeMs / 60000,
  maxInputTokens: DEFAULT_AGENT_OBJECTIVE_LIMITS.maxInputTokens,
  maxCostUsd: DEFAULT_AGENT_OBJECTIVE_LIMITS.maxCostUsd,
} as const;

export const AGENT_LIMIT_CEILINGS = {
  maxSteps: AGENT_OBJECTIVE_LIMIT_CEILINGS.maxSteps,
  maxToolCalls: AGENT_OBJECTIVE_LIMIT_CEILINGS.maxToolCalls,
  maxRuntimeMinutes: AGENT_OBJECTIVE_LIMIT_CEILINGS.maxRuntimeMs / 60000,
  maxInputTokens: AGENT_OBJECTIVE_LIMIT_CEILINGS.maxInputTokens,
  maxCostUsd: AGENT_OBJECTIVE_LIMIT_CEILINGS.maxCostUsd,
} as const;
