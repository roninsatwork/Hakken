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
