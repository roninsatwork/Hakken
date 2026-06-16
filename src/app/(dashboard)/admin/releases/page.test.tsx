import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import ReleaseCenterPage from "./page";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const overview = {
  summary: {
    total: 2,
    DRAFT_BLOCKED: 1,
    READY_FOR_RELEASE: 1,
    LIVE_NEEDS_ATTENTION: 0,
    LIVE: 0,
    warningCount: 3,
  },
  agents: [
    {
      agentId: "agent_1",
      name: "Support Triage Agent",
      description: "Prepared support release candidate.",
      isActive: false,
      status: "READY_FOR_RELEASE",
      activationRisk: false,
      activationWarnings: [],
      toolBindingCount: 2,
      knowledgeDocumentCount: 1,
      activeEvalFixtureCount: 3,
      successfulSmokeEvalRunCount: 2,
      latestSmokeEvalAt: Date.UTC(2026, 5, 16, 10, 30),
      releaseGatePolicy: {
        mode: "TAG",
        criticalFixtureCount: 1,
        passedCriticalFixtureCount: 1,
        blockedCriticalFixtureCount: 0,
      },
      nextAction: "Review release notes, owner, and activation window.",
      latestRelease: null,
      updatedAt: Date.UTC(2026, 5, 16),
    },
    {
      agentId: "agent_2",
      name: "Billing Analyst",
      description: "Needs launch coverage.",
      isActive: false,
      status: "DRAFT_BLOCKED",
      activationRisk: false,
      activationWarnings: ["tools", "smokeEval"],
      toolBindingCount: 0,
      knowledgeDocumentCount: 1,
      activeEvalFixtureCount: 1,
      successfulSmokeEvalRunCount: 0,
      latestSmokeEvalAt: undefined,
      releaseGatePolicy: {
        mode: "TAG",
        criticalFixtureCount: 0,
        passedCriticalFixtureCount: 0,
        blockedCriticalFixtureCount: 0,
      },
      nextAction: "Attach at least one approved connector or tool.",
      latestRelease: null,
      updatedAt: Date.UTC(2026, 5, 15),
    },
  ],
};

const recentReleases = [
  {
    _id: "release_1",
    agentId: "agent_1",
    agentVersionId: "version_1",
    agentName: "Support Triage Agent",
    versionNumber: 1,
    status: "PENDING_SIGNOFF",
    title: "Support Triage Agent v1",
    releaseNotes: "Ready after smoke eval and release gate coverage.",
    rollbackPlan: "Deactivate the agent and review recent runs.",
    createdAt: Date.UTC(2026, 5, 16, 11, 0),
    updatedAt: Date.UTC(2026, 5, 16, 11, 0),
  },
  {
    _id: "release_2",
    agentId: "agent_3",
    agentVersionId: "version_2",
    agentName: "Knowledge Assistant",
    versionNumber: 2,
    status: "APPROVED",
    title: "Knowledge Assistant v2",
    releaseNotes: "Updated knowledge handling.",
    rollbackPlan: "Deactivate the agent if answers regress.",
    createdAt: Date.UTC(2026, 5, 16, 9, 0),
    updatedAt: Date.UTC(2026, 5, 16, 9, 30),
    approvedAt: Date.UTC(2026, 5, 16, 9, 30),
  },
  {
    _id: "release_3",
    agentId: "agent_4",
    agentVersionId: "version_3",
    agentName: "Billing Analyst",
    versionNumber: 3,
    status: "ACTIVATED",
    title: "Billing Analyst v3",
    releaseNotes: "Billing exception handling.",
    rollbackPlan: "Deactivate and inspect billing runs.",
    createdAt: Date.UTC(2026, 5, 15, 9, 0),
    updatedAt: Date.UTC(2026, 5, 15, 10, 0),
    approvedAt: Date.UTC(2026, 5, 15, 9, 30),
    activatedAt: Date.UTC(2026, 5, 15, 10, 0),
  },
];

describe("ReleaseCenterPage", () => {
  const releaseAction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockImplementation((queryFn, _args?) => {
      const functionName = getFunctionName(queryFn);
      if (functionName === "releases:getReleaseReadinessOverview") {
        return overview as unknown as ReturnType<typeof useQuery>;
      }
      if (functionName === "releases:getRecentReleases") {
        return recentReleases as unknown as ReturnType<typeof useQuery>;
      }
      return undefined as unknown as ReturnType<typeof useQuery>;
    });
    vi.mocked(useMutation).mockReturnValue(releaseAction as unknown as ReturnType<typeof useMutation>);
  });

  it("renders release readiness summary and agent rows", () => {
    render(<ReleaseCenterPage />);

    expect(screen.getByText("Developer Ship Checks")).toBeInTheDocument();
    expect(screen.getAllByText("Support Triage Agent").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Billing Analyst").length).toBeGreaterThan(0);
    expect(screen.getByText("Ready for review")).toBeInTheDocument();
    expect(screen.getAllByText("Draft blocked").length).toBeGreaterThan(0);
    expect(screen.getByText("Attach at least one approved connector or tool.")).toBeInTheDocument();
    expect(screen.getByText("Smoke eval")).toBeInTheDocument();
    expect(screen.getByText("Create release candidate")).toBeInTheDocument();
    expect(screen.getByText("Ship Check Records")).toBeInTheDocument();
    expect(screen.getByText("Support Triage Agent v1")).toBeInTheDocument();
    expect(screen.getByText("Pending sign-off")).toBeInTheDocument();
    expect(screen.getAllByText("Approved").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Activated").length).toBeGreaterThan(0);
    expect(screen.getByText("Rollback")).toBeInTheDocument();
  });
});
