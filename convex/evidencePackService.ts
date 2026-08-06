/**
 * Turning a complete record into something a person can read.
 *
 * The platform already stores every step a run took, every tool it called and
 * everything it read. That record is thorough and it is written for someone who
 * administers AI. There has never been a version a compliance officer, an
 * executive or an auditor could read, and "every decision can be explained" is
 * not met by a complete record nobody can follow.
 *
 * So this converts runs, approvals and policies into plain sentences: no
 * identifiers, no tool names, no raw arguments, no status codes. If a reader
 * has to ask what a line means, it has failed.
 *
 * Kept free of database access so the wording can be tested directly, which is
 * the only way wording of this kind stays honest.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */

export type EvidencePeriod = { from: number; to: number };

export type RunOutcome = "SUCCESS" | "FAILED" | "CANCELLED" | "PENDING_APPROVAL" | "RUNNING" | "QUEUED";

export type ToolAction = {
  /** What the tool is called in the catalogue. Never shown to the reader. */
  normalizedToolName: string;
  sideEffectLevel?: "READ" | "WRITE" | "DESTRUCTIVE" | "EXTERNAL";
  status: string;
  blocked: boolean;
};

/** A day, so a chosen period covers whole days rather than part of one. */
export const DAY_MS = 24 * 60 * 60 * 1000;

export function periodEndingNow(days: number, now: number): EvidencePeriod {
  return { from: now - days * DAY_MS, to: now };
}

export function isWithin(period: EvidencePeriod, at: number | undefined): boolean {
  if (at === undefined) return false;
  return at >= period.from && at <= period.to;
}

/**
 * A tool name turned into something a reader recognises.
 *
 * Catalogue names are written for the runtime — `send_email_notification`,
 * `salesDataUpsertCustomer`. Splitting on the usual separators and lowercasing
 * gets closer to English than showing the identifier, and is honest about being
 * a description rather than a name.
 */
export function describeToolPlainly(normalizedToolName: string): string {
  const words = normalizedToolName
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-.]+/g, " ")
    .trim()
    .toLowerCase();

  return words || "an unnamed action";
}

/** What a run's outcome means, said rather than coded. */
export function describeOutcome(status: RunOutcome): string {
  switch (status) {
    case "SUCCESS":
      return "It finished what it was asked to do.";
    case "FAILED":
      return "It stopped before finishing, and the failure was recorded.";
    case "CANCELLED":
      return "Someone stopped it before it finished.";
    case "PENDING_APPROVAL":
      return "It is waiting for a person to approve something before it can go on.";
    case "RUNNING":
      return "It was still working when this record was taken.";
    case "QUEUED":
      return "It had not started when this record was taken.";
  }
}

/**
 * How a run was set off, in words.
 *
 * Worth saying plainly: "a schedule started it, with nobody watching" is a
 * different fact about oversight than "someone asked it to".
 */
export function describeTrigger(trigger: string): string {
  switch (trigger) {
    case "CHAT":
      return "Someone asked it to, in a conversation.";
    case "MANUAL":
      return "Someone started it by hand.";
    case "SCHEDULE":
      return "A schedule started it, with nobody watching.";
    case "WEBHOOK":
      return "Another system called in and started it.";
    case "WORKFLOW":
      return "It ran as one step of a larger sequence.";
    case "EVENT":
      return "Something that happened on the platform set it off.";
    default:
      return "It was started, though how was not recorded.";
  }
}

/**
 * What the run actually did, grouped by consequence rather than by tool.
 *
 * A reader does not care that it called `http_request` four times. They care
 * that it looked things up, that it changed two things, and that one thing it
 * tried was refused.
 */
export function describeActions(actions: ToolAction[]): string[] {
  if (actions.length === 0) return ["It did not take any action outside the conversation."];

  const readOnly = actions.filter((a) => !a.blocked && (a.sideEffectLevel ?? "READ") === "READ");
  const changed = actions.filter(
    (a) => !a.blocked && a.sideEffectLevel && a.sideEffectLevel !== "READ",
  );
  const blocked = actions.filter((a) => a.blocked);

  const sentences: string[] = [];

  if (readOnly.length > 0) {
    sentences.push(`It looked things up ${countPhrase(readOnly.length)}, changing nothing.`);
  }

  if (changed.length > 0) {
    const what = unique(changed.map((a) => describeToolPlainly(a.normalizedToolName)));
    sentences.push(`It made changes ${countPhrase(changed.length)}: ${joinPlainly(what)}.`);
  }

  if (blocked.length > 0) {
    const what = unique(blocked.map((a) => describeToolPlainly(a.normalizedToolName)));
    // The most important sentence in the pack: the platform stopped something.
    sentences.push(`It tried to do something it was not allowed to do, and was stopped: ${joinPlainly(what)}.`);
  }

  return sentences;
}

function countPhrase(count: number): string {
  return count === 1 ? "once" : `${count} times`;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function joinPlainly(values: string[]): string {
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")} and ${values[values.length - 1]}`;
}

/**
 * A whole run as a short paragraph.
 *
 * The order is the order a reader asks in: what was it asked to do, who set it
 * off, what did it do, was anyone in the loop, how did it end.
 */
export function narrateRun(args: {
  agentName: string;
  objective: string;
  trigger: string;
  status: RunOutcome;
  actions: ToolAction[];
  approvedBy?: string;
  approvalReason?: string;
}): string[] {
  const lines = [
    `${args.agentName} was asked to: ${trimObjective(args.objective)}`,
    describeTrigger(args.trigger),
    ...describeActions(args.actions),
  ];

  if (args.approvedBy) {
    lines.push(
      args.approvalReason
        ? `${args.approvedBy} approved it, saying: ${args.approvalReason}`
        : `${args.approvedBy} approved it.`,
    );
  }

  lines.push(describeOutcome(args.status));

  return lines;
}

/**
 * An objective is free text a person typed, and can run to any length. Cut long
 * enough to be meaningful and short enough to read in a list.
 */
export function trimObjective(objective: string, limit = 240): string {
  const trimmed = objective.trim();
  if (!trimmed) return "nothing was recorded.";
  if (trimmed.length <= limit) return trimmed.endsWith(".") ? trimmed : `${trimmed}.`;
  return `${trimmed.slice(0, limit).trimEnd()}…`;
}

/** The one-line summary at the top of the pack. */
export function summarisePack(args: {
  systems: number;
  runs: number;
  approvals: number;
  blocked: number;
}): string {
  const parts = [
    `${args.systems} AI ${args.systems === 1 ? "system" : "systems"}`,
    `${args.runs} ${args.runs === 1 ? "run" : "runs"}`,
    `${args.approvals} human ${args.approvals === 1 ? "decision" : "decisions"}`,
  ];

  const blocked =
    args.blocked === 0
      ? "Nothing was blocked."
      : `${args.blocked} ${args.blocked === 1 ? "action was" : "actions were"} blocked.`;

  return `${parts.join(", ")}. ${blocked}`;
}

/** A run, told as sentences. */
export type NarratedRun = {
  id: string;
  at: number;
  agentName: string;
  lines: string[];
  blockedCount: number;
};

export type RecordedDecision = {
  id: string;
  at: number;
  agentName: string;
  status: string;
  decidedBy: string;
  reason: string;
};

export type RecordedPolicy = {
  id: string;
  name: string;
  priority: string;
  instruction: string;
  scope: string;
};

export type EvidencePackCounts = {
  systems: number;
  runs: number;
  decisions: number;
  policies: number;
  blocked: number;
};

/**
 * The whole pack, named explicitly.
 *
 * Written out rather than inferred. The assembled shape is large enough that
 * TypeScript gives up inferring it through the generated Convex API and widens
 * unrelated document types across the data model — which surfaced as errors in
 * a test file nowhere near this one.
 */
export type EvidencePack = {
  register: AiSystemEntryLike[];
  runs: NarratedRun[];
  decisions: RecordedDecision[];
  policies: RecordedPolicy[];
  models: string[];
  summary: string;
  counts: EvidencePackCounts;
  /** Runs inside the period that this pack did not have room to narrate. */
  runsOmitted: number;
};

/** The pack plus whose it is. What `produce` hands back. */
export type ProducedEvidencePack = EvidencePack & { scope: "PLATFORM" | "WORKSPACE" };

/** Structural, to avoid this module depending on the register's imports. */
export type AiSystemEntryLike = {
  id: string;
  kind: string;
  name: string;
  purpose: string;
  ownerName: string;
  risk: string;
  humanApproves: boolean;
  facesPublic: boolean;
  model?: string;
  lastActiveAt?: number;
  missing: string[];
};
