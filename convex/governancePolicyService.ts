/**
 * Finding a rule among the rules.
 *
 * The policies screen listed everything in force with no way to search it,
 * narrow it or page through it, and built its own table inside the standard
 * one — Anthony, 2026-08-06: *"we need the standard search and filter bars, and
 * we also need our standard paginated table footer."*
 *
 * Kept free of database access so what counts as a match can be argued with
 * directly, the same way the register's rules are.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */

export type PolicyPriority = "LOW" | "NORMAL" | "HIGH" | "CRITICAL";

/** Where a rule reaches. Said in words, because the reader is not who set it up. */
export type PolicyScope = "EVERYWHERE" | "WORKSPACE" | "AGENT";

export type PolicyEntry = {
  name?: string;
  trigger: string;
  instruction: string;
  priority: PolicyPriority;
  agentId?: string;
  companyId?: string;
};

export type PolicyFilters = {
  search: string;
  priority: PolicyPriority | "ALL";
  scope: PolicyScope | "ALL";
};

export const NO_POLICY_FILTERS: PolicyFilters = { search: "", priority: "ALL", scope: "ALL" };

/**
 * How far a rule reaches.
 *
 * An assistant-specific rule also carries a workspace, so the narrower claim has
 * to be tested first. Checking the workspace first would file every
 * assistant-level rule as a workspace-wide one, which overstates what it governs
 * — the opposite of the error this screen can afford.
 */
export function scopeOf(rule: PolicyEntry): PolicyScope {
  if (rule.agentId) return "AGENT";
  if (rule.companyId) return "WORKSPACE";
  return "EVERYWHERE";
}

/** A rule nobody named. Common, and worth surfacing rather than hiding. */
export function isUnnamed(rule: PolicyEntry): boolean {
  return !(rule.name ?? "").trim();
}

/* Generic so the caller's own row type — and its id — survives the filter. */
export function filterPolicies<T extends PolicyEntry>(rules: T[], filters: PolicyFilters): T[] {
  const needle = filters.search.trim().toLowerCase();

  return rules.filter((rule) => {
    if (filters.priority !== "ALL" && rule.priority !== filters.priority) return false;
    if (filters.scope !== "ALL" && scopeOf(rule) !== filters.scope) return false;
    if (!needle) return true;

    // Matched against what the row shows, including what triggers the rule —
    // somebody looking for "when writing" is describing the trigger, not the
    // instruction.
    return [rule.name ?? "", rule.trigger, rule.instruction]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });
}

const PRIORITY_ORDER: Record<PolicyPriority, number> = {
  CRITICAL: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
};

/**
 * Strongest first.
 *
 * A rule marked critical is the one that decides an argument about what the AI
 * was allowed to do, so it belongs at the top rather than wherever it happened
 * to be created.
 */
export function sortPolicies<T extends PolicyEntry>(rules: T[]): T[] {
  return [...rules].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}
