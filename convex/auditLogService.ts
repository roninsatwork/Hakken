import type { Doc } from "./_generated/dataModel";

export interface AuditPurgeConfig {
  enabled: boolean;
  retentionDays: number;
  dayOfMonth: number;
  hourOfDay: number;
  nextRunTimestamp: number;
}

export type AuditPurgeConfigUpdate = Omit<AuditPurgeConfig, "nextRunTimestamp"> & {
  nextRunTimestamp?: number;
};

export const DEFAULT_AUDIT_PURGE_CONFIG: AuditPurgeConfig = {
  enabled: false,
  retentionDays: 30,
  dayOfMonth: 1,
  hourOfDay: 2,
  nextRunTimestamp: 0,
};

export function parseAuditPurgeConfig(value: string | undefined) {
  if (!value) return DEFAULT_AUDIT_PURGE_CONFIG;
  return JSON.parse(value) as AuditPurgeConfig;
}

export function calculateNextAuditPurgeRun(dayOfMonth: number, hourOfDay: number, now = new Date()) {
  const nextRun = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), dayOfMonth, hourOfDay, 0, 0, 0)
  );

  if (nextRun.getTime() <= now.getTime()) {
    nextRun.setUTCMonth(nextRun.getUTCMonth() + 1);
  }

  return nextRun.getTime();
}

export function calculateFollowingMonthlyAuditPurgeRun(dayOfMonth: number, hourOfDay: number, now = new Date()) {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, dayOfMonth, hourOfDay, 0, 0, 0);
}

export function buildAuditPurgeConfigPayload(args: AuditPurgeConfigUpdate, now = new Date()) {
  return {
    ...args,
    nextRunTimestamp: calculateNextAuditPurgeRun(args.dayOfMonth, args.hourOfDay, now),
  };
}

export function calculateAuditPurgeCutoff(retentionDays: number, now = Date.now()) {
  return now - retentionDays * 24 * 60 * 60 * 1000;
}

export function serializeAuditPurgeConfig(config: AuditPurgeConfig) {
  return JSON.stringify(config);
}

/**
 * The record that a retention rule shortened the trail.
 *
 * Retention removed the oldest entries and wrote nothing to say it had. A trail
 * that can be silently shortened, with no record of the shortening, is the one
 * thing a review will not accept — the deletion is exactly as much a governance
 * event as anything it deleted.
 *
 * Entries of this type are never themselves purged. That exemption is the point
 * of the record: a summary that a later run could quietly remove would leave
 * the same hole one month further on.
 *
 * See docs/plans/active/audit-trail-plan.md.
 */
export const AUDIT_PURGE_ACTION = "AUDIT_RECORDS_PURGED";

/** Whether an entry is one of the deletion records that outlive every purge. */
export function isAuditPurgeRecord(actionType: string) {
  return actionType === AUDIT_PURGE_ACTION;
}

export function buildAuditPurgeSummary(args: {
  recordsRemoved: number;
  retentionDays: number;
  oldestRemovedAt?: number;
}) {
  return JSON.stringify({
    recordsRemoved: args.recordsRemoved,
    keptFor: `${args.retentionDays} days`,
    ...(args.oldestRemovedAt !== undefined ? { oldestRemovedAt: args.oldestRemovedAt } : {}),
  });
}

/**
 * What a change looked like, in words, for somebody reading the trail.
 *
 * The trail could say that a field changed and never what it changed to.
 * "UPDATE_AGENT" against `mh71mxwkegfxgxc6avhf…` with `{"updatedFields":
 * ["description"]}` tells a reader that something happened and nothing about
 * what — Anthony, 2026-08-06: *"its not much of an audit trail at the moment."*
 * Risk ratings were the one exception, because somebody wrote that one properly.
 *
 * This reads whatever shape the entry happens to carry, because entries written
 * before values were recorded still have to render. An old entry says which
 * fields moved and stops; a new one says what they moved from and to. Neither
 * is invented on the reader's behalf.
 */

/** How much of a long value the trail keeps. Enough to recognise, not enough to be a copy. */
export const AUDIT_VALUE_LIMIT = 120;

export type AuditFieldChange = { field: string; from: string | null; to: string | null };

/**
 * A value as the trail should hold it.
 *
 * Long text is cut down on purpose. An audit entry that stored every system
 * prompt in full would turn the trail into a second copy of them, kept under a
 * different retention rule and read by people who were never meant to have it.
 */
export function summariseAuditValue(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;

  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text.length <= AUDIT_VALUE_LIMIT) return text;

  return `${text.slice(0, AUDIT_VALUE_LIMIT)}…`;
}

/** The before-and-after pairs an entry carries, if it carries any. */
export function auditChangesFrom(metadata: string | undefined): AuditFieldChange[] {
  if (!metadata) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(metadata);
  } catch {
    // A metadata blob that will not parse is still evidence that something
    // happened. Returning nothing here lets the screen fall back to showing it
    // raw rather than swallowing the entry.
    return [];
  }

  if (!parsed || typeof parsed !== "object") return [];
  const record = parsed as Record<string, unknown>;

  // The shape written from now on.
  if (Array.isArray(record.changes)) {
    return record.changes
      .filter((change): change is Record<string, unknown> => !!change && typeof change === "object")
      .map((change) => ({
        field: String(change.field ?? ""),
        from: summariseAuditValue(change.from),
        to: summariseAuditValue(change.to),
      }))
      .filter((change) => change.field !== "");
  }

  // The shape risk changes have always used.
  if ("from" in record || "to" in record) {
    return [
      {
        field: "riskLevel",
        from: summariseAuditValue(record.from),
        to: summariseAuditValue(record.to),
      },
    ];
  }

  // The old shape: which fields moved, and nothing about where to.
  // `modifiedFields` is the same idea under the name system settings used.
  const fieldNames = Array.isArray(record.updatedFields)
    ? record.updatedFields
    : Array.isArray(record.modifiedFields)
      ? record.modifiedFields
      : null;

  if (fieldNames) {
    return fieldNames.map((field) => ({ field: String(field), from: null, to: null }));
  }

  return [];
}

/**
 * What an agent did on its own account.
 *
 * A person changing an agent's purpose was recorded; the agent then going off
 * and acting was not. On a platform sold as AI governance, the trail covering
 * only the humans is the conspicuous hole in it.
 *
 * Reads are left out, deliberately and permanently. An agent answering a
 * question by looking something up is the bulk of what agents do, and a trail
 * carrying all of it is a trail nobody can read — the entries that matter would
 * be buried under thousands that do not. What is recorded is what an agent
 * changed, deleted, or sent outside the platform.
 *
 * See docs/plans/active/audit-trail-plan.md.
 */
export type ToolSideEffect = "READ" | "WRITE" | "DESTRUCTIVE" | "EXTERNAL";

export function isAuditableAgentAction(sideEffectLevel: string) {
  return sideEffectLevel !== "READ";
}

/** What the side effect was, as a person would say it. */
const SIDE_EFFECT_WORDS: Record<string, string> = {
  WRITE: "changed something",
  DESTRUCTIVE: "deleted something",
  EXTERNAL: "sent something outside",
};

export function buildAgentActionAuditMetadata(args: {
  agentName?: string;
  tool: string;
  sideEffectLevel: string;
  status: string;
  wasApproved?: boolean;
  error?: string;
}) {
  return JSON.stringify({
    ...(args.agentName ? { agent: args.agentName } : {}),
    did: SIDE_EFFECT_WORDS[args.sideEffectLevel] ?? args.sideEffectLevel,
    using: args.tool,
    outcome: args.status,
    // Only worth saying when it is true. "Approved by a person: no" against
    // every unattended call reads as a finding rather than as the norm.
    ...(args.wasApproved ? { approvedByAPerson: "yes" } : {}),
    ...(args.error ? { error: args.error } : {}),
  });
}

/**
 * How a run ended.
 *
 * One entry per run, at the point it finishes. Not one per step — step-level
 * detail already lives in the agent observability screens, and duplicating it
 * here would bury everything else in the trail within a week.
 */
/**
 * A Decision that acted on its own.
 *
 * Only runs that acted are written: a run handed to a person has its task or
 * queue item as the record, and a run on which nothing hung would bury the
 * trail. The certainty is a word, never a number, and the source says
 * whether TypeSafe judged it or the simple rule did while TypeSafe was off.
 * docs/plans/active/decisions-typesafe-plan.md, commitment 9.
 */
export function buildDecisionActedAuditMetadata(args: {
  decisionName: string;
  answer: string;
  certainty: string | null;
  action: string;
  source: "TYPESAFE" | "TEXT_MODEL" | "RULES";
}) {
  return JSON.stringify({
    decision: args.decisionName,
    answer: args.answer,
    ...(args.certainty ? { certainty: args.certainty } : {}),
    did: args.action,
    ...(args.source === "RULES" ? { judgedBy: "the simple rule (TypeSafe was off)" } : {}),
  });
}

export function buildAgentRunAuditMetadata(args: {
  agentName?: string;
  objective?: string;
  status: string;
  durationMs?: number;
  error?: string;
}) {
  return JSON.stringify({
    ...(args.agentName ? { agent: args.agentName } : {}),
    outcome: args.status,
    ...(args.objective ? { asked: args.objective } : {}),
    ...(args.durationMs !== undefined ? { took: `${Math.round(args.durationMs / 1000)} seconds` } : {}),
    ...(args.error ? { error: args.error } : {}),
  });
}

/** Field names as a person would say them. Anything unlisted keeps its own name. */
const FIELD_WORDS: Record<string, string> = {
  description: "Purpose",
  ownerId: "Accountable person",
  riskLevel: "Risk rating",
  name: "Name",
  systemPrompt: "Instructions",
  isActive: "Switched on",
  humanApprovalRequired: "Needs approval",
  autonomousToolExecution: "Runs unattended",
  modelId: "Model",
  mode: "Mode",

  // System settings. These moved from "which fields were touched" to real
  // before-and-after values, so they need reader-facing names for the first
  // time.
  platformName: "Platform name",
  brandColorHex: "Brand colour",
  logoUrlLight: "Logo (light)",
  logoUrlDark: "Logo (dark)",
  emailSenderName: "Email sender name",
  emailSenderAddress: "Email sender address",
  currencySymbol: "Currency",
  monthlyBasePrice: "Monthly base price",
  monthlySeatPrice: "Monthly seat price",
  diagnosticRoutingEnabled: "Diagnostic routing",

  // Keys the trail records alongside an action rather than as a change.
  ip: "IP address",
  location: "Where from",
  counts: "Covering",
  recordsRemoved: "Records removed",
  keptFor: "Kept for",
  oldestRemovedAt: "Oldest removed",
  removedBeforeAt: "Everything before",
  pipelineKey: "What was cleared",
  startedBy: "Started by",
  attemptedEmail: "Account",
  recordsTaken: "Records taken",
  stoppedAtTheLimit: "Stopped at the limit",
  coveringFromAt: "Covering from",
  narrowedToAction: "Narrowed to",
  searchedFor: "Searched for",
  keyPrefix: "Key",
  requiredScope: "Needed permission",
  refusedBecause: "Refused because",
  agent: "Agent",
  did: "Did",
  using: "Using",
  outcome: "Outcome",
  asked: "Asked to",
  took: "Took",
  approvedByAPerson: "Approved by a person",
};

/**
 * A camelCase key as words.
 *
 * The fallback for anything unlisted. `sourceFilename` reads better as "Source
 * filename" than as itself, and the alternative — a table naming every key any
 * part of the platform has ever written — goes stale the day somebody adds one.
 */
function keyToWords(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();

  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function auditFieldWords(field: string): string {
  return FIELD_WORDS[field] ?? keyToWords(field);
}

/**
 * What the entry holds, besides a before-and-after.
 *
 * Most of the trail is not a diff. A sign-in is not a diff, an export is not a
 * diff, a maintenance run is not a diff — and because the screen only knew how
 * to read diffs, every one of those rows was labelled "nothing recorded about
 * what changed" over a record that held the address it came from, the period it
 * covered, or the script it ran. Anthony, 2026-08-06: *"we have a lot of blanks
 * in the audit trail."*
 *
 * Read from the record rather than from a list of action names, so an action
 * nobody has written yet still renders as something.
 *
 * See docs/plans/active/audit-trail-plan.md.
 */
export type AuditDetail = { key: string; value: string };

/** Keys the diff path has already spoken for. Saying them twice helps nobody. */
const CONSUMED_KEYS = new Set(["changes", "updatedFields", "modifiedFields", "from", "to"]);

/**
 * Identifiers say nothing to a reader on their own.
 *
 * `mh71mxwkegfxgxc6avhf9zyapd8btcbg` in a sentence is worse than no sentence.
 * They stay in the record — the detail screen shows it in full — they just do
 * not get read out.
 */
function isIdentifierKey(key: string): boolean {
  return /(^|[a-z0-9])Ids?$/.test(key) || key === "id";
}

/**
 * A stored code as a person would read it.
 *
 * The platform stores states as `explicit_logout` and `REPLAYED_FAILURE`, which
 * are right for a database and wrong on a screen. Only values that are entirely
 * code-shaped are touched — anything with a space in it is prose somebody wrote
 * on purpose, and rewriting that would be putting words in their mouth.
 */
function codeToWords(value: string): string {
  if (!/^[A-Za-z][A-Za-z0-9]*([_-][A-Za-z0-9]+)+$/.test(value)) return value;

  const spaced = value.replace(/[_-]+/g, " ").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * A moment in time, where the record holds one.
 *
 * Evidence pack exports record the period they cover as two epoch numbers, and
 * "period from 1754006400000" is not a period anybody can read. Formatted in UTC
 * rather than the reader's zone: this string is built on the server, and a date
 * that shifts by a day depending on who is looking is worse on this screen than
 * one that is plainly universal.
 */
const DATE_KEY = /(^|[a-z])(At|From|To|Timestamp)$/;
const AUDIT_DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** Epoch milliseconds within a range this platform could plausibly have written. */
function looksLikeTimestamp(value: number): boolean {
  return Number.isFinite(value) && value > 1_000_000_000_000 && value < 4_000_000_000_000;
}

/** One value, as a phrase. */
function detailValue(key: string, value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") {
    if (DATE_KEY.test(key) && looksLikeTimestamp(value)) return AUDIT_DATE_FORMAT.format(new Date(value));
    return String(value);
  }
  if (typeof value === "string") return summariseAuditValue(codeToWords(value));

  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return summariseAuditValue(value.map((item) => String(item)).join(", "));
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, inner]) => inner !== undefined && inner !== null && inner !== "",
    );
    if (entries.length === 0) return null;

    // A bag of counts — `{systems: 12, runs: 340}` — reads as counts.
    if (entries.every(([, inner]) => typeof inner === "number")) {
      return summariseAuditValue(entries.map(([key, inner]) => `${inner} ${keyToWords(key).toLowerCase()}`).join(", "));
    }

    return summariseAuditValue(value);
  }

  return null;
}

export function auditDetailsFrom(metadata: string | undefined): AuditDetail[] {
  if (!metadata) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(metadata);
  } catch {
    return [];
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];

  return Object.entries(parsed as Record<string, unknown>)
    .filter(([key]) => !CONSUMED_KEYS.has(key) && !isIdentifierKey(key))
    .map(([key, value]) => ({ key, value: detailValue(key, value) }))
    .filter((detail): detail is AuditDetail => detail.value !== null);
}

/**
 * How an action reads when it is not a change.
 *
 * Only the ones people actually look at. Anything unlisted falls back to its own
 * name in words, which is plainer than a phrase somebody invented for it and
 * never checked.
 */
const ACTION_WORDS: Record<string, string> = {
  SYSTEM_AUTHENTICATION: "Signed in",
  SYSTEM_DISCONNECTION: "Signed out",
  SIGN_IN_FAILED: "A sign-in was refused",
  AGENT_ACTION: "An agent acted on its own",
  AGENT_RUN_FINISHED: "An agent run finished",
  DECISION_ACTED: "A Decision acted",
  DECISION_MODE_CHANGED: "A Decision's mode was changed",
  API_REQUEST_REFUSED: "An API request was refused",
  API_KEY_FIRST_USED: "An API key was used for the first time",
  EXPORT_AUDIT_TRAIL: "Took a copy of the audit trail",
  AUDIT_RECORDS_PURGED: "Removed audit records past their retention date",
  RECORDS_PURGED: "Removed records past their retention date",
  IMPERSONATE_COMPANY: "Started working inside a workspace",
  END_IMPERSONATION: "Stopped working inside a workspace",
  EXPORT_EVIDENCE_PACK: "Exported an evidence pack",
  EXPORT_PERSONAL_DATA: "Exported everything held about a person",
  ERASE_PERSONAL_DATA: "Erased everything held about a person",
  UPDATE_SYSTEM_PREFERENCES: "Changed platform settings",
  UPDATE_AUDIT_PURGE_CONFIG: "Changed how long records are kept",
  MAINTENANCE_SCRIPT_STARTED: "Started a maintenance script",
  MAINTENANCE_SCRIPT_SUCCEEDED: "Ran a maintenance script",
  MAINTENANCE_SCRIPT_FAILED: "A maintenance script failed",
  MANUAL_PURGE_TRIGGER: "Started a clear-out by hand",
  MANUAL_PURGE_CANCEL: "Cancelled a clear-out",
  BLOCKED_WIDGET_ACCESS: "Blocked a widget request",
  RATE_LIMITED_WIDGET_THREADS: "A widget hit its hourly conversation ceiling",
  RATE_LIMITED_WIDGET_MESSAGES: "A widget hit its hourly message ceiling",
  ASSISTANT_SAFETY_REFUSAL: "The assistant refused a request",
  CREATE_INVITE: "Invited someone",
  REVOKE_INVITE: "Withdrew an invitation",
  CREATE_API_KEY: "Created an API key",
  REVOKE_API_KEY: "Revoked an API key",
  ASSIGN_SUPER_ADMIN: "Made someone a super administrator",
  DETACH_SUPER_ADMIN: "Removed super administrator access",
  UPLOAD_DOCUMENT: "Uploaded a document",
  DELETE_DOCUMENT: "Deleted a document",
};

export function auditActionWords(actionType: string | undefined): string {
  if (!actionType) return "";
  return ACTION_WORDS[actionType] ?? keyToWords(actionType.toLowerCase());
}

/** How many facts a single line carries before it stops being a line. */
const AUDIT_DETAIL_LIMIT = 3;

/**
 * The facts an entry holds, as one phrase.
 *
 * Labelled, because "Signed in: 147.90.132.3, London" leaves the reader to work
 * out which is which and the record already knows.
 */
export function describeAuditDetails(details: AuditDetail[]): string {
  if (details.length === 0) return "";

  // A single fact that is already a sentence speaks for itself. Labelling it
  // produces "Summary: Produced everything held about anthony@example.com",
  // which says the same thing twice and reads worse for it.
  const [only] = details;
  if (details.length === 1 && only.value.includes(" ") && only.value.length > 30) {
    return only.value;
  }

  const shown = details.slice(0, AUDIT_DETAIL_LIMIT);
  const rest = details.length - shown.length;
  const more = rest > 0 ? ` and ${rest} more` : "";

  return `${shown.map((detail) => `${auditFieldWords(detail.key)}: ${detail.value}`).join(", ")}${more}`;
}

/**
 * The one line the list shows against an entry.
 *
 * Written from the entry itself rather than from a lookup table of action
 * types, so an action nobody has thought about yet still reads as something.
 *
 * A change of values is one kind of happening, not the definition of one. Where
 * there is a before and an after this says so; where there is not, it says what
 * the entry does hold. It returns an empty string only for an entry that
 * genuinely holds nothing, because "nothing was recorded" printed over a record
 * that holds plenty is the worst thing an audit surface can say.
 */
export function describeAuditChange(metadata: string | undefined, actionType?: string): string {
  const changes = auditChangesFrom(metadata);

  if (changes.length === 0) {
    const details = describeAuditDetails(auditDetailsFrom(metadata));
    const stem = auditActionWords(actionType);

    if (!stem) return details;
    return details ? `${stem} — ${details}` : stem;
  }

  const [first] = changes;
  const rest = changes.length - 1;
  const more = rest > 0 ? ` and ${rest} more` : "";

  if (first.from === null && first.to === null) {
    return `${auditFieldWords(first.field)} changed${more}`;
  }

  const from = first.from ?? "nothing";
  const to = first.to ?? "nothing";

  return `${auditFieldWords(first.field)}: ${from} → ${to}${more}`;
}

export function withAuditLogActorName(log: Doc<"auditLogs">, actor: Doc<"users"> | null) {
  return {
    ...log,
    actorName: actor?.name || actor?.email || "Unknown Admin",
  };
}
