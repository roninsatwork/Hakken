import { describe, expect, test } from "vitest";
import { buildEvidencePackDocument, type EvidencePackLabels } from "./evidencePackDocument";
import type { ProducedEvidencePack } from "@/convex/evidencePackService";

const labels: EvidencePackLabels = {
  title: "AI governance evidence pack",
  period: "Covering",
  scopePlatform: "Covering every workspace on this platform.",
  scopeWorkspace: "Covering this workspace only.",
  systems: "Every AI system",
  runs: "What the AI did",
  decisions: "Decisions a person made",
  policies: "Policies in force",
  models: "Models used",
  none: "Nothing to report for this period.",
  notRated: "not yet rated",
  noOwner: "nobody assigned",
};

const emptyPack = (overrides: Partial<ProducedEvidencePack> = {}): ProducedEvidencePack => ({
  register: [],
  runs: [],
  decisions: [],
  policies: [],
  models: [],
  summary: "0 AI systems, 0 runs, 0 human decisions. Nothing was blocked.",
  counts: { systems: 0, runs: 0, decisions: 0, policies: 0, blocked: 0 },
  runsOmitted: 0,
  scope: "WORKSPACE",
  ...overrides,
});

const build = (pack: ProducedEvidencePack) =>
  buildEvidencePackDocument({ pack, from: 0, to: 86_400_000, labels });

describe("the pack is a document, not a data dump", () => {
  test("it opens with what it covers and whose it is", () => {
    const doc = build(emptyPack());

    expect(doc).toContain("# AI governance evidence pack");
    expect(doc).toContain("Covering: 1970-01-01 to 1970-01-02");
    expect(doc).toContain("Covering this workspace only.");
  });

  test("a platform pack says it covers every workspace", () => {
    expect(build(emptyPack({ scope: "PLATFORM" }))).toContain("Covering every workspace on this platform.");
  });

  test("every section appears even when there is nothing in it", () => {
    // A missing section reads as an omission an auditor has to ask about.
    const doc = build(emptyPack());

    for (const heading of [labels.systems, labels.runs, labels.decisions, labels.policies, labels.models]) {
      expect(doc).toContain(`## ${heading}`);
    }
    expect(doc.match(/Nothing to report for this period\./g)).toHaveLength(5);
  });
});

describe("an incomplete record says so in the document too", () => {
  const withSystem = (extra: Record<string, unknown>) =>
    emptyPack({
      register: [
        {
          id: "a",
          kind: "ASSISTANT",
          name: "Invoice checker",
          purpose: "",
          ownerName: "",
          risk: "UNRATED",
          humanApproves: true,
          facesPublic: false,
          missing: ["No purpose recorded.", "Nobody is accountable for this."],
          ...extra,
        },
      ],
    });

  test("what is missing is printed where the purpose would be", () => {
    const doc = build(withSystem({}));

    expect(doc).toContain("No purpose recorded. Nobody is accountable for this.");
    expect(doc).toContain("Accountable: nobody assigned");
    expect(doc).toContain("Risk: not yet rated");
  });

  test("a complete record prints its purpose and rating instead", () => {
    const doc = build(
      withSystem({ purpose: "Checks invoices.", ownerName: "Danette Cole", risk: "HIGH", missing: [] })
    );

    expect(doc).toContain("Checks invoices.");
    expect(doc).toContain("Accountable: Danette Cole");
    expect(doc).toContain("Risk: high");
  });

  test("an unattended public-facing system is flagged on both counts", () => {
    const doc = build(withSystem({ humanApproves: false, facesPublic: true }));

    expect(doc).toContain("Oversight: runs unattended");
    expect(doc).toContain("Talks to the public");
  });
});

describe("the readable account of what the AI did", () => {
  test("each run is printed as its sentences, newest first as given", () => {
    const doc = build(
      emptyPack({
        runs: [
          {
            id: "r1",
            at: 3_600_000,
            agentName: "Invoice checker",
            lines: ["Invoice checker was asked to: check invoices.", "It finished what it was asked to do."],
            blockedCount: 0,
          },
        ],
      })
    );

    expect(doc).toContain("**1970-01-01 01:00**");
    expect(doc).toContain("Invoice checker was asked to: check invoices.");
    expect(doc).toContain("It finished what it was asked to do.");
  });

  test("a decision names who made it and why", () => {
    const doc = build(
      emptyPack({
        decisions: [
          {
            id: "d1",
            at: 0,
            agentName: "Invoice checker",
            status: "APPROVED",
            decidedBy: "Ravi Menon",
            reason: "Checked the totals myself",
          },
        ],
      })
    );

    expect(doc).toContain("approved by Ravi Menon, saying: Checked the totals myself");
  });

  test("a decision with no recorded reason still reads as a sentence", () => {
    const doc = build(
      emptyPack({
        decisions: [{ id: "d1", at: 0, agentName: "A", status: "REJECTED", decidedBy: "Priya Shah", reason: "" }],
      })
    );

    expect(doc).toContain("rejected by Priya Shah");
    expect(doc).not.toContain("saying:");
  });

  test("a policy prints its scope, priority and what it says", () => {
    const doc = build(
      emptyPack({
        policies: [
          { id: "p1", name: "No spending", priority: "CRITICAL", instruction: "Never spend money.", scope: "Everywhere" },
        ],
      })
    );

    expect(doc).toContain("**No spending** (Everywhere, critical): Never spend money.");
  });
});

describe("a bounded pack says where it stopped", () => {
  test("nothing is said when nothing was left out", () => {
    // Silence here would be correct and unremarkable; a note would imply doubt.
    expect(build(emptyPack())).not.toContain("could not be included");
  });

  test("omitted runs are declared rather than silently dropped", () => {
    const doc = build(emptyPack({ runsOmitted: 37 }));

    expect(doc).toContain("37");
    expect(doc).toContain("could not be included");
  });

  test("a single omitted run reads properly", () => {
    expect(build(emptyPack({ runsOmitted: 1 }))).toContain("1 earlier run in this period could not be included");
  });
});

