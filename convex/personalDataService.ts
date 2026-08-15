/**
 * What "delete everything about this person" actually means.
 *
 * Fifty-seven tables carry a link to a user, and treating them alike would be
 * wrong in both directions. Deleting a company's rules because the person who
 * wrote them has left would destroy the workspace's configuration; keeping
 * someone's conversations because a rule mentions them would defeat the point.
 *
 * So each link gets a treatment, and the treatment is a decision someone made
 * rather than a default:
 *
 * - `ERASE` — the row exists because of this person. Their conversations, their
 *   sign-ins, their recordings. It goes.
 * - `DISSOCIATE` — a shared business record that merely records who touched it.
 *   The record stays and the name comes off, which is what erasure asks for and
 *   what destroying the record does not.
 * - `RETAIN` — kept deliberately, with the reason written down. The audit trail
 *   and the approvals queue are the evidence that governance happened; erasing
 *   them to satisfy a governance obligation would be self-defeating, and the
 *   reason is recorded here so it can be argued with rather than discovered.
 *
 * The manifest is checked against the schema by a test, so a table added next
 * year cannot quietly hold personal data that nothing here knows about. That
 * check is the whole point: an erasure you cannot prove is complete is not
 * worth much.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */

export type PersonalDataTreatment = "ERASE" | "DISSOCIATE" | "RETAIN";

export type PersonalDataRule = {
  table: string;
  /** Fields on this table that point at a person. */
  fields: string[];
  treatment: PersonalDataTreatment;
  /** Why, in a sentence. Shown in the record of what was done. */
  reason: string;
};

export const PERSONAL_DATA_RULES: readonly PersonalDataRule[] = [
  // --- Rows that exist because of the person ----------------------------
  { table: "users", fields: ["_id"], treatment: "ERASE", reason: "The record of the person." },
  { table: "logins", fields: ["userId"], treatment: "ERASE", reason: "Their sign-in history." },
  { table: "authEvents", fields: ["userId"], treatment: "ERASE", reason: "Their sign-in attempts, by address." },
  { table: "threads", fields: ["userId"], treatment: "ERASE", reason: "Their conversations." },
  { table: "messages", fields: ["userId"], treatment: "ERASE", reason: "What they said, and what was said back." },
  { table: "agentRunFeedback", fields: ["userId"], treatment: "ERASE", reason: "Their opinion of a run." },
  { table: "messageFeedback", fields: ["userId"], treatment: "ERASE", reason: "Their opinion of an answer." },
  { table: "arcadeScores", fields: ["userId"], treatment: "ERASE", reason: "Their scores." },
  { table: "aiActionRequests", fields: ["actorId"], treatment: "ERASE", reason: "Their rate-limit counters." },
  { table: "analyticsDailySnapshots", fields: ["userId"], treatment: "ERASE", reason: "Their usage, counted per person." },
  { table: "agentMemories", fields: ["userId"], treatment: "ERASE", reason: "What an assistant remembered about them." },
  { table: "movements", fields: ["createdBy"], treatment: "ERASE", reason: "A recording of their body." },
  { table: "movementDebugSessions", fields: ["createdBy"], treatment: "ERASE", reason: "A recording of their body." },
  { table: "notifications", fields: ["userId"], treatment: "ERASE", reason: "Their inbox. A notification exists only for the person it was sent to." },

  // --- Kept deliberately, because they are the evidence -----------------
  {
    table: "auditLogs",
    fields: ["actorId"],
    treatment: "RETAIN",
    reason: "The audit trail is the record that governance happened. Erasing it to satisfy a governance obligation would defeat the obligation.",
  },
  {
    table: "agentRunApprovals",
    fields: ["requestedBy", "reviewedBy"],
    treatment: "RETAIN",
    reason: "Who approved an AI action is the oversight evidence itself, and an approval with nobody's name on it proves nothing.",
  },
  {
    table: "purgeHistory",
    fields: ["actorId"],
    treatment: "RETAIN",
    reason: "The record of what was deleted, and by whom.",
  },
  {
    table: "maintenanceScriptRuns",
    fields: ["actorId"],
    treatment: "RETAIN",
    reason: "The record of who ran a maintenance script against live data.",
  },

  {
    table: "tasks",
    fields: ["assigneeUserId", "createdByUserId", "completedByUserId"],
    treatment: "DISSOCIATE",
    reason: "The work belongs to the workspace, not to the person. Erasing the task with the person would delete work somebody still has to do; the names come off and the job stays.",
  },

  // --- Shared records that merely note who touched them -----------------
  ...([
    ["aiModelDefaults", ["updatedBy"]],
    ["invitations", ["invitedBy"]],
    ["emailTemplates", ["updatedBy"]],
    ["systemConfig", ["updatedBy"]],
    ["apiKeys", ["createdBy", "revokedBy"]],
    ["agentTransactions", ["userId"]],
    ["agentRuns", ["userId"]],
    ["agentToolCalls", ["userId"]],
    ["agentRunReflections", ["createdBy", "reviewedBy"]],
    ["agentMemoryCandidates", ["createdBy", "reviewedBy"]],
    ["agentEvalFixtures", ["createdBy"]],
    ["agentImprovementSuggestions", ["createdBy", "reviewedBy"]],
    ["agentSkills", ["createdBy"]],
    ["agentSkillBindings", ["assignedBy"]],
    ["agentMemories", ["createdBy", "deletedBy"]],
    ["companyMemories", ["approvedBy", "archivedBy", "createdBy"]],
    ["companyMemoryCandidates", ["createdBy", "reviewedBy"]],
    ["companySkills", ["archivedBy", "createdBy"]],
    ["companySkillBindings", ["assignedBy"]],
    ["companyAiDriftEvents", ["createdBy", "resolvedBy"]],
    ["companyEvalCases", ["archivedBy", "createdBy"]],
    ["companyEvalRuns", ["createdBy"]],
    ["aiRules", ["createdBy"]],
    ["knowledgeDocuments", ["createdBy", "submittedBy", "reviewedBy"]],
    ["agents", ["ownerId"]],
    ["agentEvalSuitePresets", ["createdBy"]],
    ["toolConnectors", ["createdBy"]],
    ["toolConnectorTestLogs", ["testedBy"]],
    ["toolConnectorSecretRefs", ["updatedBy"]],
    ["toolConnectorOAuthConnections", ["initiatedBy"]],
    ["aiTools", ["createdBy"]],
    ["workflows", ["createdBy"]],
    ["workflowExecutions", ["startedBy"]],
    ["schedules", ["createdBy"]],
    ["widgets", ["createdBy"]],
    ["apifyRuns", ["startedBy"]],
    ["salesDataImports", ["importedBy"]],
    ["salesDataCustomers", ["updatedBy"]],
    ["salesDataCustomerResearch", ["decidedBy"]],
    ["salesDataProspects", ["decidedBy"]],
    ["salesDataMarketDiscoveryJobs", ["startedBy"]],
    ["salesDataResearchJobs", ["startedBy"]],
    ["salesOpportunityReports", ["requestedBy"]],
    ["wikiOpenQuestions", ["resolvedBy"]],
    ["wikiReviews", ["decidedBy"]],
  ] as const).map(([table, fields]) => ({
    table,
    fields: [...fields],
    treatment: "DISSOCIATE" as const,
    reason: "A shared record that notes who touched it. The record stays; the name comes off.",
  })),
];

/** Tables an erasure has to visit, in the order the record reads best. */
export function rulesFor(treatment: PersonalDataTreatment): PersonalDataRule[] {
  return PERSONAL_DATA_RULES.filter((rule) => rule.treatment === treatment);
}

export function ruleFor(table: string): PersonalDataRule | undefined {
  return PERSONAL_DATA_RULES.find((rule) => rule.table === table);
}

export type ErasureTally = { table: string; treatment: PersonalDataTreatment; rows: number };

/**
 * What was done, in sentences.
 *
 * The person asking is answering a legal request, and "27 rows across 12
 * tables" is not an answer to give a regulator. Retained tables are named
 * explicitly with their reason: a silent exception is the thing that gets an
 * organisation into trouble.
 */
export function describeErasure(tallies: ErasureTally[]): string[] {
  const erased = tallies.filter((t) => t.treatment === "ERASE" && t.rows > 0);
  const dissociated = tallies.filter((t) => t.treatment === "DISSOCIATE" && t.rows > 0);
  const retained = rulesFor("RETAIN");

  const lines: string[] = [];

  lines.push(
    erased.length === 0
      ? "Nothing held only about this person was found."
      : `Deleted ${total(erased)} ${plural(total(erased), "record")} held about this person.`,
  );

  if (dissociated.length > 0) {
    lines.push(
      `Removed their name from ${total(dissociated)} shared ${plural(total(dissociated), "record")}, which were kept.`,
    );
  }

  for (const rule of retained) {
    lines.push(`Kept: ${rule.reason}`);
  }

  return lines;
}

function total(tallies: ErasureTally[]): number {
  return tallies.reduce((sum, tally) => sum + tally.rows, 0);
}

function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`;
}

/** One table's worth of what is held about a person. */
export type PersonalDataSection = {
  table: string;
  treatment: string;
  reason: string;
  rows: unknown[];
  /**
   * Set when the search stopped before the end of the table.
   *
   * A short answer given as though it were complete is the worst thing this
   * feature could produce, because it is handed to somebody exercising a legal
   * right. The ceiling exists so a vast table cannot hang the request; saying
   * when it was reached is what keeps the answer honest.
   */
  truncated?: boolean;
};

/**
 * Indexes that already exist and happen to lead with the field pointing at the
 * person.
 *
 * Gathering what is held about somebody used to run one unindexed scan per
 * table across the whole manifest inside a single execution, which read every
 * row of roughly fifty tables and died against Convex's sixteen-megabyte
 * ceiling — the screen showed a bare "Server Error" to an administrator
 * answering a legal request.
 *
 * Where an index leads with the right field, the search reads only that
 * person's rows. Everywhere else it pages through in bounded steps, which is
 * slower but reads a fixed amount at a time and therefore finishes.
 *
 * No index was added for the rest on purpose. They would have to be maintained
 * on every write to some of the busiest tables on the platform, for ever, to
 * speed up something run a handful of times a year — a cost paid constantly for
 * a benefit taken rarely.
 */
export const PERSONAL_DATA_INDEXES: Readonly<Record<string, string>> = {
  "agentRunFeedback.userId": "by_user_agent_updated",
  "messageFeedback.userId": "by_user_created",
  "aiActionRequests.actorId": "by_actor_action_requested",
  "analyticsDailySnapshots.userId": "by_user_date",
  "arcadeScores.userId": "by_user",
  "auditLogs.actorId": "by_actor",
  "logins.userId": "by_user",
  "messages.userId": "by_user_role_created",
  "threads.userId": "by_user",
};

/** The index to search a table's personal field by, when there is one. */
export function indexFor(table: string, field: string): string | undefined {
  return PERSONAL_DATA_INDEXES[`${table}.${field}`];
}

export type PersonSummary = {
  /** Typed as the caller sees it; the module that owns ids narrows it. */
  userId: string;
  name: string;
  email: string;
  role: string;
};

/**
 * Named rather than inferred, for the same reason the evidence pack is: the
 * assembled shape is large enough that TypeScript gives up threading it through
 * the generated Convex API and widens unrelated document types across the data
 * model, which surfaces as errors in files nowhere near this one.
 */
export type SubjectAccessResult = {
  person: PersonSummary;
  sections: PersonalDataSection[];
};

export type ErasureResult = {
  email: string;
  summary: string[];
  tallies: ErasureTally[];
};
