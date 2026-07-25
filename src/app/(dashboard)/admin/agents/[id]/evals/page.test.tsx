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

describe("AgentEvalsPage skill filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockImplementation((queryFn, args?) => {
      void args;
      const functionName = getFunctionName(queryFn);
      if (functionName === "agentEvalFixtures:getRecentForAgent") return fixtures as unknown as ReturnType<typeof useQuery>;
      if (functionName === "agentEvalFixtures:getSmokeEvalHistory") return evalHistory as unknown as ReturnType<typeof useQuery>;
      if (functionName === "agentEvalFixtures:getReleaseCandidateComparison") return releaseComparison as unknown as ReturnType<typeof useQuery>;
      if (functionName === "agentEvalFixtures:listSuitePresets") return [] as unknown as ReturnType<typeof useQuery>;
      if (functionName === "agents:getAgentReadiness") return readiness as unknown as ReturnType<typeof useQuery>;
      return undefined as unknown as ReturnType<typeof useQuery>;
    });
    vi.mocked(useMutation).mockReturnValue(vi.fn() as unknown as ReturnType<typeof useMutation>);
  });

  it("shows skill coverage and filters fixtures by selected skill", () => {
    render(<AgentEvalsPage />);

    expect(screen.getByText("Skill eval coverage")).toBeInTheDocument();
    expect(screen.getAllByText("Risk Monitoring").length).toBeGreaterThan(0);
    expect(screen.getByText("stale")).toBeInTheDocument();
    expect(screen.getByText("Fixture contracts run without executing external or destructive side effects.")).toBeInTheDocument();
    expect(screen.getByText("Assess whether a new adverse event should be escalated.")).toBeInTheDocument();
    expect(screen.getByText("Answer a general onboarding question.")).toBeInTheDocument();

    const skillCoverage = screen.getByText("Skill eval coverage").closest("section");
    expect(skillCoverage).not.toBeNull();
    fireEvent.click(within(skillCoverage as HTMLElement).getByRole("button", { name: "Filter" }));

    expect(screen.getByText("1 fixture shown for the selected skill.")).toBeInTheDocument();
    expect(screen.getByText("Assess whether a new adverse event should be escalated.")).toBeInTheDocument();
    expect(screen.queryByText("Answer a general onboarding question.")).not.toBeInTheDocument();

    fireEvent.click(within(skillCoverage as HTMLElement).getByRole("button", { name: "Clear" }));
    expect(screen.getByText("Fixture contracts run without executing external or destructive side effects.")).toBeInTheDocument();
    expect(screen.getByText("Answer a general onboarding question.")).toBeInTheDocument();
  });
});
