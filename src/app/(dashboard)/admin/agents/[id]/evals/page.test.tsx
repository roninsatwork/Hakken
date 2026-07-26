import React from "react";
import { fireEvent, renderWithProviders as render, screen, within } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import AgentEvalsPage from "./page";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "agent_1" }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const fixtures = [
  {
    _id: "fixture_skill_risk",
    agentId: "agent_1",
    type: "HAPPY_PATH",
    objective: "Assess whether a new adverse event should be escalated.",
    expectedToolPlanJson: JSON.stringify([{ handlerMapping: "risk.monitor.feed" }]),
    expectedFinalOutputRubric: "Includes severity, rationale, confidence, and next action.",
    sourceEvidenceJson: JSON.stringify({
      source: "agent_skill",
      skillId: "skill_risk",
      skillVersionId: "skill_version_1",
      skillName: "Risk Monitoring",
    }),
    tags: ["happy_path", "skill", "risk"],
    status: "ACTIVE",
    createdBy: "user_1",
    createdAt: Date.UTC(2026, 5, 18),
    updatedAt: Date.UTC(2026, 5, 18),
  },
  {
    _id: "fixture_general",
    agentId: "agent_1",
    type: "HAPPY_PATH",
    objective: "Answer a general onboarding question.",
    expectedFinalOutputRubric: "Gives a safe, direct answer.",
    sourceEvidenceJson: "{}",
    tags: ["happy_path", "general"],
    status: "ACTIVE",
    createdBy: "user_1",
    createdAt: Date.UTC(2026, 5, 18),
    updatedAt: Date.UTC(2026, 5, 18),
  },
];

const readiness = {
  latestSmokeEvalRun: null,
  releaseGatePolicy: {
    mode: "NONE",
    requiredTags: [],
    criticalFixtureCount: 0,
    passedCriticalFixtureCount: 0,
    blockedCriticalFixtureCount: 0,
    fixtures: [],
  },
  skillReadiness: {
    enabledCount: 1,
    missingRequiredToolCount: 0,
    missingHighRiskEvalCount: 1,
    skills: [{
      skillId: "skill_risk",
      name: "Risk Monitoring",
      riskLevel: "HIGH",
      activeEvalFixtureCount: 1,
      skillSmokePassed: false,
      latestSkillSmokeEval: {
        runId: "run_1",
        status: "SUCCESS",
        startedAt: Date.UTC(2026, 5, 18),
        completedAt: Date.UTC(2026, 5, 18, 0, 1),
        isCurrent: false,
      },
    }],
  },
};

const evalHistory = {
  totals: {
    total: 1,
    passed: 0,
    failed: 1,
    queued: 0,
  },
  entries: [],
};

const releaseComparison = {
  policy: {
    warning: undefined,
    modelGradingRequired: false,
  },
  totals: {
    total: 0,
    passed: 0,
    failed: 0,
    stale: 0,
    notRun: 0,
    active: 0,
    modelRequired: 0,
    changed: 0,
  },
  entries: [],
};

const runSmokeEval = vi.fn();

function mockQueries(history: typeof evalHistory = evalHistory, gate = readiness.releaseGatePolicy) {
  vi.mocked(useQuery).mockImplementation((queryFn, args?) => {
    void args;
    const functionName = getFunctionName(queryFn);
    if (functionName === "agentEvalFixtures:getRecentForAgent") return fixtures as unknown as ReturnType<typeof useQuery>;
    if (functionName === "agentEvalFixtures:getSmokeEvalHistory") return history as unknown as ReturnType<typeof useQuery>;
    if (functionName === "agents:getAgentReadiness") {
      return { ...readiness, releaseGatePolicy: gate } as unknown as ReturnType<typeof useQuery>;
    }
    return undefined as unknown as ReturnType<typeof useQuery>;
  });
}

describe("AgentEvalsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    void releaseComparison;
    mockQueries();
    vi.mocked(useMutation).mockImplementation((mutationFn) => {
      const functionName = getFunctionName(mutationFn);
      if (functionName === "agentEvalFixtures:runSmokeEval") {
        return runSmokeEval as unknown as ReturnType<typeof useMutation>;
      }
      return vi.fn() as unknown as ReturnType<typeof useMutation>;
    });
  });

  it("uses the standard table and leads with one sentence", () => {
    render(<AgentEvalsPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Checks" })).toBeInTheDocument();
    expect(screen.getByText("0 of 2 checks passing. 2 not proven yet.")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Check" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Status" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Must pass" })).toBeInTheDocument();
    expect(screen.getByText("Assess whether a new adverse event should be escalated.")).toBeInTheDocument();
  });

  // Six tiles, five competing buttons, a policy strip, a skill panel and a release
  // comparison panel — several of which never rendered for a company admin at all,
  // because readiness was super-admin only.
  it("shows no machine constants, counters or jargon", () => {
    render(<AgentEvalsPage />);

    const body = document.body.textContent ?? "";
    for (const jargon of [
      "MODEL_GRADED",
      "CONTRACT_ONLY",
      "fixture",
      "Fixture",
      "rubric",
      "suite",
      "Suite",
      "release gate",
      "checkpoint",
      "Eval runs",
    ]) {
      expect(body).not.toContain(jargon);
    }
  });

  // A contract run calls no model. Showing its success as a pass is why the screen
  // and the activation gate reported different numbers.
  it("reports a setup-only result as not proven, never as passing", () => {
    mockQueries({
      totals: { total: 1, passed: 0, failed: 0, queued: 0 },
      entries: [{
        status: "SUCCESS",
        gradingMode: "CONTRACT_ONLY",
        completedAt: Date.UTC(2026, 5, 18),
        startedAt: Date.UTC(2026, 5, 18),
        fixture: { fixtureId: "fixture_general" },
      }],
    } as unknown as typeof evalHistory);

    render(<AgentEvalsPage />);

    expect(screen.getByText("Setup only")).toBeInTheDocument();
    expect(screen.queryByText("Passing")).not.toBeInTheDocument();
    expect(screen.getByText("0 of 2 checks passing. 2 not proven yet.")).toBeInTheDocument();
  });

  // The per-row Run button used to default to the configuration check — the thing
  // that is not a test — and report that it had passed.
  it("runs a real graded check from the row, not a setup check", () => {
    render(<AgentEvalsPage />);

    fireEvent.click(within(screen.getAllByRole("row")[1]).getByRole("button", { name: /Run/ }));

    expect(runSmokeEval).toHaveBeenCalledWith({
      agentId: "agent_1",
      fixtureId: "fixture_skill_risk",
      gradingMode: "MODEL_GRADED",
    });
  });

  it("says plainly when nothing has to pass before going live", () => {
    render(<AgentEvalsPage />);

    expect(screen.getByText(/No check has to pass before this agent goes live/)).toBeInTheDocument();
  });
});
