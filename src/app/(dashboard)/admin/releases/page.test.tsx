import React from "react";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/src/test/renderWithProviders";
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
    ownerEmail: "owner@example.com",
    activationWindowStart: Date.UTC(2026, 5, 16, 12, 0),
    activationWindowEnd: Date.UTC(2026, 5, 16, 14, 0),
    createdAt: Date.UTC(2026, 5, 16, 11, 0),
    updatedAt: Date.UTC(2026, 5, 16, 11, 0),
    evidenceSummary: {
      summary: "Release evidence was complete when this record was created or refreshed.",
      items: [
        { label: "Tools", value: "1 attached", status: "PASS" },
        { label: "Smoke evals", value: "2 passed", status: "PASS" },
        { label: "Release gate", value: "1/1 critical passed", status: "PASS" },
      ],
    },
    nextAction: {
      tone: "READY",
      label: "Ready for sign-off",
      detail: "Review evidence, snapshot changes, owner, and activation window; then approve or cancel.",
    },
    snapshotComparison: {
      currentVersionNumber: 1,
      changedAreas: ["Initial release snapshot"],
      unchangedAreas: [],
      details: [{
        area: "Initial release snapshot",
        before: "No previous live snapshot",
        after: "Prompt: Empty | Tools: knowledge.search | Model: inherit / default / standard / no thinking",
      }],
      summary: "No previous live release snapshot exists for comparison.",
    },
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
    ownerEmail: "builder@example.com",
    approvalComment: "Reviewed retrieval evidence and smoke eval pass.",
    activationWindowStart: Date.UTC(2099, 0, 1, 9, 0),
    activationWindowEnd: Date.UTC(2099, 0, 1, 11, 0),
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
    ownerEmail: "finance-owner@example.com",
    approvalComment: "Confirmed billing fixtures and rollback owner.",
    createdAt: Date.UTC(2026, 5, 15, 9, 0),
    updatedAt: Date.UTC(2026, 5, 15, 10, 0),
    approvedAt: Date.UTC(2026, 5, 15, 9, 30),
    activatedAt: Date.UTC(2026, 5, 15, 10, 0),
  },
  {
    _id: "release_4",
    agentId: "agent_5",
    agentVersionId: "version_4",
    agentName: "Incident Assistant",
    versionNumber: 4,
    status: "ROLLED_BACK",
    title: "Incident Assistant v4",
    releaseNotes: "Incident summarization update.",
    rollbackPlan: "Deactivate and compare incident run evidence.",
    ownerEmail: "ops-owner@example.com",
    approvalComment: "Reviewed incident evals.",
    rollbackReason: "Rollback after failed production-style run review.",
    createdAt: Date.UTC(2026, 5, 14, 9, 0),
    updatedAt: Date.UTC(2026, 5, 14, 11, 0),
    approvedAt: Date.UTC(2026, 5, 14, 9, 30),
    activatedAt: Date.UTC(2026, 5, 14, 10, 0),
    rolledBackAt: Date.UTC(2026, 5, 14, 11, 0),
  },
  {
    _id: "release_5",
    agentId: "agent_6",
    agentVersionId: "version_5",
    agentName: "Sales Research Agent",
    versionNumber: 5,
    status: "CANCELLED",
    title: "Sales Research Agent v5",
    releaseNotes: "Sales research update.",
    rollbackPlan: "No rollback needed before activation.",
    ownerEmail: "sales-owner@example.com",
    cancellationReason: "Cancelled after scope changed before activation.",
    createdAt: Date.UTC(2026, 5, 13, 9, 0),
    updatedAt: Date.UTC(2026, 5, 13, 10, 0),
    cancelledAt: Date.UTC(2026, 5, 13, 10, 0),
  },
];

describe("ReleaseCenterPage", () => {
  const releaseAction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockImplementation((queryFn, args?) => {
      void args;
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
    renderWithProviders(<ReleaseCenterPage />);

    expect(screen.getByText("Developer Ship Checks")).toBeInTheDocument();
    expect(screen.getByText("Release Lifecycle")).toBeInTheDocument();
    expect(screen.getByText("Recent ship-check records by lifecycle state.")).toBeInTheDocument();
    expect(screen.getByText("5 recent records")).toBeInTheDocument();
    expect(screen.getAllByText("Support Triage Agent").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Billing Analyst").length).toBeGreaterThan(0);
    expect(screen.getByText("Ready for review")).toBeInTheDocument();
    expect(screen.getAllByText("Draft blocked").length).toBeGreaterThan(0);
    expect(screen.getByText("Attach at least one approved connector or tool.")).toBeInTheDocument();
    expect(screen.getByText("Smoke eval")).toBeInTheDocument();
    expect(screen.getByText("Create release candidate")).toBeInTheDocument();
    expect(screen.getByText("Release owner email")).toBeInTheDocument();
    expect(screen.getByText("Activation window opens")).toBeInTheDocument();
    expect(screen.getByText("Activation window closes")).toBeInTheDocument();
    expect(screen.getByText("Ship Check Records")).toBeInTheDocument();
    expect(screen.getByText("Support Triage Agent v1")).toBeInTheDocument();
    expect(screen.getByText("Release evidence")).toBeInTheDocument();
    expect(screen.getByText("Release evidence was complete when this record was created or refreshed.")).toBeInTheDocument();
    expect(screen.getByText("1 attached")).toBeInTheDocument();
    expect(screen.getByText("2 passed")).toBeInTheDocument();
    expect(screen.getByText("Recommended next action")).toBeInTheDocument();
    expect(screen.getByText("Ready for sign-off")).toBeInTheDocument();
    expect(screen.getByText("Snapshot comparison")).toBeInTheDocument();
    expect(screen.getByText("No previous live release snapshot exists for comparison.")).toBeInTheDocument();
    expect(screen.getAllByText("Initial release snapshot").length).toBeGreaterThan(0);
    expect(screen.getByText("No previous live snapshot")).toBeInTheDocument();
    expect(screen.getByText("Prompt: Empty | Tools: knowledge.search | Model: inherit / default / standard / no thinking")).toBeInTheDocument();
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
    expect(screen.getAllByText("Activation window").length).toBeGreaterThan(0);
    expect(screen.getByText("Approval comment")).toBeInTheDocument();
    expect(screen.getByText("Reviewed retrieval evidence and smoke eval pass.")).toBeInTheDocument();
    expect(screen.getAllByText("Pending sign-off").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Approved").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Window not open" })).toBeDisabled();
    expect(screen.getByText(/Activation opens/)).toBeInTheDocument();
    expect(screen.getAllByText("Activated").length).toBeGreaterThan(0);
    expect(screen.getByText("Rollback after failed production-style run review.")).toBeInTheDocument();
    expect(screen.getAllByText("Rollback reason").length).toBeGreaterThan(0);
    expect(screen.getByText("Cancelled after scope changed before activation.")).toBeInTheDocument();
    expect(screen.getAllByText("Cancellation reason").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Cancel candidate").length).toBeGreaterThan(0);
    expect(screen.getByText("Rollback")).toBeInTheDocument();
  });
});
