import type { Doc } from "./_generated/dataModel";

/**
 * What counts as an AI system, and how one is described.
 *
 * An assistant is the obvious entry and not the only one. A widget is embedded
 * on a customer's own public site and talks to the public, which makes it the
 * entry a regulator asks about first — listing the assistant behind a widget
 * and not the widget itself describes the engine and omits the car. A workflow
 * that calls AI is running AI whether or not anyone thinks of it that way.
 *
 * Kept free of database access so the rules are testable on their own, and so
 * the query module only has to fetch rows and hand them here.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */

export type AiSystemKind = "ASSISTANT" | "WIDGET" | "WORKFLOW";

export type AiSystemRisk = "LOW" | "MEDIUM" | "HIGH" | "UNRATED";

export type AiSystemEntry = {
  id: string;
  kind: AiSystemKind;
  name: string;
  /** What it is for. Empty until someone says, which is the point of the flag. */
  purpose: string;
  /** Who is accountable. A name, never an identifier. */
  ownerName: string;
  risk: AiSystemRisk;
  /** Whether a person approves what it does before it happens. */
  humanApproves: boolean;
  /** Reaches the public, rather than only people who have signed in. */
  facesPublic: boolean;
  model?: string;
  lastActiveAt?: number;
  /**
   * How many times this has run recently.
   *
   * The register lists what exists; this says what is busy, and the two are
   * routinely different. "Not rated" against something that ran two hundred
   * times last month and "not rated" against a sandbox nobody has touched since
   * April are the same words describing very different situations, and the
   * screen had no way to tell them apart.
   *
   * Undefined where the idea does not apply — a widget or a workflow is not run
   * the way an assistant is.
   */
  activity?: number;
  /** Why this entry is incomplete, in plain sentences. Empty when it is not. */
  missing: string[];
};

/**
 * An entry is incomplete when nobody has said what it is for or who owns it.
 *
 * Both are recorded as prose rather than a code, because the register is read
 * by a compliance officer rather than by the person who set the thing up.
 */
export function describeMissing(purpose: string, ownerName: string): string[] {
  const missing: string[] = [];
  if (!purpose.trim()) missing.push("No purpose recorded.");
  if (!ownerName.trim()) missing.push("Nobody is accountable for this.");
  return missing;
}

export function toAssistantEntry(
  agent: Doc<"agents">,
  ownerName: string,
  lastActiveAt: number | undefined,
): AiSystemEntry {
  const purpose = (agent.description ?? "").trim();

  return {
    id: agent._id,
    kind: "ASSISTANT",
    name: agent.name,
    purpose,
    ownerName,
    // `UNRATED` where nobody has classified it. Honest, where defaulting to LOW
    // would be a claim nobody made — and it is the figure the dashboard needs
    // in order to say how much of the estate has actually been looked at.
    risk: agent.riskLevel ?? "UNRATED",
    // Absent or false means gated: an agent only runs unattended when someone
    // deliberately switched that on.
    humanApproves: agent.autonomousToolExecution !== true,
    facesPublic: false,
    model: agent.modelId,
    lastActiveAt,
    missing: describeMissing(purpose, ownerName),
  };
}

export function toWidgetEntry(
  widget: Doc<"widgets">,
  ownerName: string,
  agent: Doc<"agents"> | null,
): AiSystemEntry {
  const purpose = (widget.themeGreeting ?? "").trim();

  return {
    id: widget._id,
    kind: "WIDGET",
    name: widget.name,
    purpose,
    ownerName,
    risk: "UNRATED",
    humanApproves: agent ? agent.autonomousToolExecution !== true : true,
    // The whole reason a widget belongs on the register in its own right.
    facesPublic: widget.allowedDomains.length > 0,
    model: agent?.modelId,
    lastActiveAt: widget.createdAt,
    missing: describeMissing(purpose, ownerName),
  };
}

export function toWorkflowEntry(
  workflow: Doc<"workflows">,
  ownerName: string,
): AiSystemEntry {
  const purpose = (workflow.description ?? "").trim();

  return {
    id: workflow._id,
    kind: "WORKFLOW",
    name: workflow.name,
    purpose,
    ownerName,
    risk: "UNRATED",
    humanApproves: true,
    facesPublic: false,
    lastActiveAt: workflow.updatedAt ?? workflow.createdAt,
    missing: describeMissing(purpose, ownerName),
  };
}

/**
 * Anything incomplete first, because it needs a person; then riskiest; then
 * most recently active.
 *
 * Risk sits below completeness on purpose. An unrated high-risk assistant is
 * indistinguishable from an unrated harmless one until somebody says, so the
 * missing record is the more urgent thing.
 */
export function sortRegister(entries: AiSystemEntry[]): AiSystemEntry[] {
  return [...entries].sort((a, b) => {
    if (a.missing.length !== b.missing.length) return b.missing.length - a.missing.length;
    if (riskRank(a.risk) !== riskRank(b.risk)) return riskRank(a.risk) - riskRank(b.risk);
    return (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0);
  });
}

export function summariseRegister(entries: AiSystemEntry[]) {
  return {
    total: entries.length,
    incomplete: entries.filter((entry) => entry.missing.length > 0).length,
    publicFacing: entries.filter((entry) => entry.facesPublic).length,
    unattended: entries.filter((entry) => !entry.humanApproves).length,
    highRisk: entries.filter((entry) => entry.risk === "HIGH").length,
    unrated: entries.filter((entry) => entry.risk === "UNRATED").length,
  };
}

export type RegisterSort = "ATTENTION" | "ACTIVITY" | "LAST_ACTIVE" | "NAME" | "RISK";

/**
 * Reordering the register without losing what it is for.
 *
 * `ATTENTION` is the default and stays the default: the register exists to
 * surface what nobody has described or taken responsibility for, and a screen
 * that opens sorted by name buries that under the alphabet. The other orders
 * are there because a reader with a specific question — what is busiest, what
 * has gone quiet — should not have to read every row to answer it.
 *
 * Ties always fall back to the attention order, so switching sorts never
 * produces an arrangement with no reasoning behind it.
 */
export function sortRegisterBy(entries: AiSystemEntry[], sort: RegisterSort): AiSystemEntry[] {
  const byAttention = sortRegister(entries);
  if (sort === "ATTENTION") return byAttention;

  const compare: Record<Exclude<RegisterSort, "ATTENTION">, (a: AiSystemEntry, b: AiSystemEntry) => number> = {
    ACTIVITY: (a, b) => (b.activity ?? -1) - (a.activity ?? -1),
    LAST_ACTIVE: (a, b) => (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0),
    NAME: (a, b) => a.name.localeCompare(b.name),
    RISK: (a, b) => riskRank(a.risk) - riskRank(b.risk),
  };

  return [...byAttention].sort((a, b) => compare[sort](a, b));
}

export type RegisterFilters = {
  /** Free text, matched against everything a reader can see on the row. */
  search: string;
  risk: AiSystemRisk | "ALL";
  kind: AiSystemKind | "ALL";
  /** Only the entries nobody has described or taken responsibility for. */
  attentionOnly: boolean;
};

export const NO_REGISTER_FILTERS: RegisterFilters = {
  search: "",
  risk: "ALL",
  kind: "ALL",
  attentionOnly: false,
};

/**
 * Narrowing the register down to the rows somebody is looking for.
 *
 * The list builds itself and therefore grows on its own, which is the point of
 * it — but it arrived as one unbroken table with no way to search, filter or
 * page through. Anthony, 2026-08-06: *"the UX is not great."* A register nobody
 * can find anything in is a list rather than a register.
 *
 * Matched against what the row actually shows: its name, what it is for, who is
 * accountable and which model it runs on. Searching a field the reader cannot
 * see returns rows that look like mistakes.
 *
 * Kept here beside the sorting and the summary so every rule about what the
 * register means lives in one place, and can be tested without a screen.
 */
export function filterRegister(entries: AiSystemEntry[], filters: RegisterFilters): AiSystemEntry[] {
  const needle = filters.search.trim().toLowerCase();

  return entries.filter((entry) => {
    if (filters.attentionOnly && entry.missing.length === 0) return false;
    if (filters.risk !== "ALL" && entry.risk !== filters.risk) return false;
    if (filters.kind !== "ALL" && entry.kind !== filters.kind) return false;
    if (!needle) return true;

    return [entry.name, entry.purpose, entry.ownerName, entry.model ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });
}

/** Riskiest first within a rating, so the entries that matter surface. */
const RISK_ORDER: Record<AiSystemRisk, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
  UNRATED: 3,
};

export function riskRank(risk: AiSystemRisk): number {
  return RISK_ORDER[risk];
}
