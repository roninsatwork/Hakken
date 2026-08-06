import type { ProducedEvidencePack } from "@/convex/evidencePackService";

/**
 * The evidence pack as a document someone can keep.
 *
 * Markdown rather than a screen or a JSON blob: it opens in anything, prints,
 * attaches to a report, and is still readable in six months without this
 * platform being available to render it. An auditor asked for evidence, not a
 * link.
 *
 * Pure, and separate from the panel that triggers it, so the wording and the
 * ordering can be tested without a browser.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */

export type EvidencePackLabels = {
  title: string;
  period: string;
  scopePlatform: string;
  scopeWorkspace: string;
  systems: string;
  runs: string;
  decisions: string;
  policies: string;
  models: string;
  none: string;
  notRated: string;
  noOwner: string;
};

function formatDay(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

function formatMoment(at: number): string {
  return new Date(at).toISOString().slice(0, 16).replace("T", " ");
}

export function buildEvidencePackDocument(args: {
  pack: ProducedEvidencePack;
  from: number;
  to: number;
  labels: EvidencePackLabels;
}): string {
  const { pack, from, to, labels } = args;
  const lines: string[] = [];

  lines.push(`# ${labels.title}`);
  lines.push("");
  lines.push(`${labels.period}: ${formatDay(from)} to ${formatDay(to)}`);
  lines.push(pack.scope === "PLATFORM" ? labels.scopePlatform : labels.scopeWorkspace);
  lines.push("");
  lines.push(pack.summary);

  /**
   * The bound, stated.
   *
   * A pack that quietly omitted part of its period would be worse than one that
   * admits its edge: the reader would have no way to know, and an auditor
   * reading a complete-looking record is exactly who this is written for.
   */
  if (pack.runsOmitted > 0) {
    lines.push("");
    lines.push(
      `${pack.runsOmitted} earlier ${pack.runsOmitted === 1 ? "run" : "runs"} in this period could not be included. The most recent activity is shown; choose a shorter period to see the rest.`,
    );
  }

  lines.push("");

  // --- Every AI system --------------------------------------------------
  lines.push(`## ${labels.systems}`);
  lines.push("");
  if (pack.register.length === 0) {
    lines.push(labels.none);
  } else {
    for (const entry of pack.register) {
      lines.push(`### ${entry.name}`);
      lines.push("");
      lines.push(entry.purpose || entry.missing.join(" "));
      lines.push("");
      lines.push(`- Accountable: ${entry.ownerName || labels.noOwner}`);
      lines.push(`- Risk: ${entry.risk === "UNRATED" ? labels.notRated : entry.risk.toLowerCase()}`);
      lines.push(`- Oversight: ${entry.humanApproves ? "a person approves what it does" : "runs unattended"}`);
      if (entry.facesPublic) lines.push("- Talks to the public");
      if (entry.model) lines.push(`- Model: ${entry.model}`);
      lines.push("");
    }
  }

  // --- What the AI actually did ----------------------------------------
  lines.push(`## ${labels.runs}`);
  lines.push("");
  if (pack.runs.length === 0) {
    lines.push(labels.none);
    lines.push("");
  } else {
    for (const run of pack.runs) {
      lines.push(`**${formatMoment(run.at)}**`);
      lines.push("");
      for (const line of run.lines) lines.push(line);
      lines.push("");
    }
  }

  // --- Every human decision --------------------------------------------
  lines.push(`## ${labels.decisions}`);
  lines.push("");
  if (pack.decisions.length === 0) {
    lines.push(labels.none);
    lines.push("");
  } else {
    for (const decision of pack.decisions) {
      const who = decision.decidedBy || labels.noOwner;
      lines.push(
        `- ${formatMoment(decision.at)} — ${decision.agentName}: ${decision.status.toLowerCase()} by ${who}${
          decision.reason ? `, saying: ${decision.reason}` : ""
        }`,
      );
    }
    lines.push("");
  }

  // --- Every policy in force -------------------------------------------
  lines.push(`## ${labels.policies}`);
  lines.push("");
  if (pack.policies.length === 0) {
    lines.push(labels.none);
    lines.push("");
  } else {
    for (const policy of pack.policies) {
      lines.push(`- **${policy.name || policy.scope}** (${policy.scope}, ${policy.priority.toLowerCase()}): ${policy.instruction}`);
    }
    lines.push("");
  }

  // --- Every model used -------------------------------------------------
  lines.push(`## ${labels.models}`);
  lines.push("");
  lines.push(pack.models.length === 0 ? labels.none : pack.models.map((model) => `- ${model}`).join("\n"));
  lines.push("");

  return lines.join("\n");
}
