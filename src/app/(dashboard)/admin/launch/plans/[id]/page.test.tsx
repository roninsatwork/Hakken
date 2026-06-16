import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import LaunchPlanDetailPage from "./page";

const refreshMock = vi.hoisted(() => vi.fn());

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "plan_1" }),
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const details = {
  plan: {
    _id: "plan_1",
    templateName: "Support Desk AI",
    category: "Customer Support",
    riskProfile: "MEDIUM",
    status: "DRAFT",
    targetCompanyName: "Acme Support",
    notes: "Use support playbooks first.",
    createdAt: Date.UTC(2026, 5, 16),
    updatedAt: Date.UTC(2026, 5, 16),
  },
  createdResources: null,
  createdResourceDetails: null,
  linkedWorkspace: null,
  connectorReadiness: [
    {
      key: "zendesk",
      label: "Zendesk",
      installed: true,
      installStatus: "INSTALLED",
      testStatus: "SUCCESS",
      authMode: "OAUTH",
      authConnectionStatus: "CONNECTED",
      isActive: true,
      tenantScoped: false,
      connectorId: "connector_1",
    },
    {
      key: "gmail",
      label: "Gmail",
      installed: false,
      tenantScoped: false,
    },
  ],
  readinessSummary: {
    status: "IN_PROGRESS",
    plannedAgentCount: 1,
    createdAgentCount: 0,
    plannedWorkflowCount: 1,
    createdWorkflowCount: 0,
    connectorReadyCount: 1,
    connectorTotalCount: 2,
    blockerCount: 2,
    blockers: ["Draft resources have not been created.", "1 connector needs setup or testing."],
    nextActions: ["Create draft agents and workflows from this build plan.", "Install, connect, or retest recommended connectors in Marketplace."],
  },
  developerHandoff: {
    status: "NEEDS_SCAFFOLDING",
    followUpCount: 1,
    extensionPointCount: 1,
    implementationPointerCount: 1,
    publishTargetCount: 1,
    checklist: [
      "Create or link the tenant workspace for this build plan.",
      "Map ticket fields to Zendesk.",
      "Start in code: convex/aiToolExecutionService.ts.",
      "Implement extension points: Support tool handlers.",
    ],
  },
  developerTasks: [
    {
      category: "Workspace",
      title: "Create or link workspace",
      status: "PENDING",
      detail: "Create a workspace before wiring tenant data, users, or customer-specific surfaces.",
      actionLabel: "Create workspace below",
    },
    {
      category: "Connectors",
      title: "Set up recommended connectors",
      status: "BLOCKED",
      detail: "1 recommended connector still needs installation, auth, activation, or testing.",
      actionLabel: "Open Marketplace",
      actionHref: "/admin/ai/tools",
    },
    {
      category: "Code",
      title: "Complete product-specific implementation",
      status: "PENDING",
      detail: "1 code pointer and 1 follow-up item need developer review.",
      actionLabel: "Review code pointers below",
    },
  ],
  developerTaskSummary: {
    blockedCount: 1,
    pendingCount: 2,
    readyCount: 0,
    nextTaskTitle: "Set up recommended connectors",
    nextTaskCategory: "Connectors",
    nextTaskStatus: "BLOCKED",
  },
  parsedPlan: {
    templateId: "support-desk-ai",
    recommendedConnectorKeys: ["zendesk", "gmail"],
    draftResources: {
      agents: ["Support Triage Agent"],
      knowledgeScopes: ["Help center"],
      workflows: ["New ticket triage"],
      evalFixtures: ["Refund promise blocked"],
      dashboardCards: ["Open high-risk cases"],
      publishTargets: ["Internal app"],
    },
    readinessChecks: ["Knowledge uploaded"],
    developerFollowUps: ["Map ticket fields to Zendesk."],
    extensionPoints: ["Support tool handlers"],
    implementationPointers: [
      {
        label: "Ticket handlers",
        filePath: "convex/aiToolExecutionService.ts",
        notes: "Wire support lookup handlers.",
      },
    ],
    safetyDefaults: {
      resourceStatus: "DRAFT",
      externalActionsRequireApproval: true,
      releaseGateRequired: true,
    },
  },
};

describe("LaunchPlanDetailPage", () => {
  const archiveLaunchPlan = vi.fn();
  const materializeLaunchPlan = vi.fn();
  const createWorkspaceForLaunchPlan = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockImplementation((queryFn, _args?) => {
      const functionName = getFunctionName(queryFn);
      if (functionName === "appTemplates:getLaunchPlanDetails") {
        return details as unknown as ReturnType<typeof useQuery>;
      }
      return undefined as unknown as ReturnType<typeof useQuery>;
    });
    vi.mocked(useMutation).mockImplementation((mutationFn) => {
      const functionName = getFunctionName(mutationFn);
      if (functionName === "appTemplates:materializeLaunchPlan") {
        return materializeLaunchPlan as unknown as ReturnType<typeof useMutation>;
      }
      if (functionName === "appTemplates:createWorkspaceForLaunchPlan") {
        return createWorkspaceForLaunchPlan as unknown as ReturnType<typeof useMutation>;
      }
      return archiveLaunchPlan as unknown as ReturnType<typeof useMutation>;
    });
  });

  it("renders a saved build plan review", () => {
    render(<LaunchPlanDetailPage />);

    expect(screen.getAllByText("Acme Support").length).toBeGreaterThan(0);
    expect(screen.getByText("Support Desk AI")).toBeInTheDocument();
    expect(screen.getByText("Support Triage Agent")).toBeInTheDocument();
    expect(screen.getByText("Zendesk")).toBeInTheDocument();
    expect(screen.getAllByText("Ready").length).toBeGreaterThan(0);
    expect(screen.getByText("Missing")).toBeInTheDocument();
    expect(screen.getByText("Build Plan Readiness")).toBeInTheDocument();
    expect(screen.getAllByText("0/1")).toHaveLength(2);
    expect(screen.getByText("Draft resources have not been created.")).toBeInTheDocument();
    expect(screen.getByText("Knowledge uploaded")).toBeInTheDocument();
    expect(screen.getByText("Developer Follow-Up")).toBeInTheDocument();
    expect(screen.getAllByText("Map ticket fields to Zendesk.").length).toBeGreaterThan(0);
    expect(screen.getByText("Extension Points")).toBeInTheDocument();
    expect(screen.getByText("Support tool handlers")).toBeInTheDocument();
    expect(screen.getByText("Developer Handoff")).toBeInTheDocument();
    expect(screen.getByText("NEEDS SCAFFOLDING")).toBeInTheDocument();
    expect(screen.getByText("Create or link the tenant workspace for this build plan.")).toBeInTheDocument();
    expect(screen.getByText("Code Pointers")).toBeInTheDocument();
    expect(screen.getByText("Ticket handlers")).toBeInTheDocument();
    expect(screen.getAllByText("convex/aiToolExecutionService.ts").length).toBeGreaterThan(0);
    expect(screen.getByText("Developer Task Map")).toBeInTheDocument();
    expect(screen.getByText("Create or link workspace")).toBeInTheDocument();
    expect(screen.getByText("Set up recommended connectors")).toBeInTheDocument();
    expect(screen.getByText("Complete product-specific implementation")).toBeInTheDocument();
    expect(screen.getByText("BLOCKED")).toBeInTheDocument();
    expect(screen.getByText("Create workspace below")).toBeInTheDocument();
    expect(screen.getByText("Open Marketplace")).toHaveAttribute("href", "/admin/ai/tools");
    expect(screen.getByText("Review code pointers below")).toBeInTheDocument();
    expect(screen.getByText("Next Recommended Task")).toBeInTheDocument();
    expect(screen.getByText("Connectors: Set up recommended connectors")).toBeInTheDocument();
    expect(screen.getByText("Blocked")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getAllByText("Ready").length).toBeGreaterThan(0);
  });

  it("archives a draft build plan", async () => {
    archiveLaunchPlan.mockResolvedValue("plan_1");
    render(<LaunchPlanDetailPage />);

    fireEvent.click(screen.getByText("Archive"));

    await waitFor(() => {
      expect(archiveLaunchPlan).toHaveBeenCalledWith({ planId: "plan_1" });
      expect(refreshMock).toHaveBeenCalled();
    });
  });

  it("creates draft resources from a draft build plan", async () => {
    materializeLaunchPlan.mockResolvedValue({ agentIds: ["agent_1"], workflowIds: ["workflow_1"], fixtureIds: ["fixture_1"], sourceRunIds: ["run_1"] });
    render(<LaunchPlanDetailPage />);

    fireEvent.click(screen.getByText("Create draft resources"));

    await waitFor(() => {
      expect(materializeLaunchPlan).toHaveBeenCalledWith({ planId: "plan_1" });
      expect(refreshMock).toHaveBeenCalled();
    });
  });

  it("creates a linked workspace from a build plan", async () => {
    createWorkspaceForLaunchPlan.mockResolvedValue("company_1");
    render(<LaunchPlanDetailPage />);

    fireEvent.click(screen.getAllByText("Create workspace")[0]);

    await waitFor(() => {
      expect(createWorkspaceForLaunchPlan).toHaveBeenCalledWith({ planId: "plan_1" });
      expect(refreshMock).toHaveBeenCalled();
    });
  });

  it("renders created draft resource links", () => {
    vi.mocked(useQuery).mockImplementation((queryFn, _args?) => {
      const functionName = getFunctionName(queryFn);
      if (functionName === "appTemplates:getLaunchPlanDetails") {
        return {
          ...details,
          plan: { ...details.plan, status: "MATERIALIZED" },
          createdResources: {
            agentIds: ["agent_1"],
            workflowIds: ["workflow_1"],
            fixtureIds: ["fixture_1", "fixture_2"],
            sourceRunIds: ["run_1"],
          },
          createdResourceDetails: {
            agents: [{ id: "agent_1", name: "Support Triage Agent", isActive: false, fixtureCount: 2 }],
            workflows: [{ id: "workflow_1", name: "New ticket triage", isActive: false, triggerType: "MANUAL" }],
            evalFixtureCount: 2,
            missingResourceCount: 0,
          },
          linkedWorkspace: {
            id: "company_1",
            name: "Acme Support",
            createdAt: Date.UTC(2026, 5, 16),
          },
        } as unknown as ReturnType<typeof useQuery>;
      }
      return undefined as unknown as ReturnType<typeof useQuery>;
    });
    render(<LaunchPlanDetailPage />);

    expect(screen.getByText("Created Draft Resources")).toBeInTheDocument();
    expect(screen.getAllByText("Acme Support")[1]).toHaveAttribute("href", "/admin/companies/company_1");
    expect(screen.getAllByText("Support Triage Agent")[1].closest("a")).toHaveAttribute("href", "/admin/agents/agent_1");
    expect(screen.getAllByText("New ticket triage")[1].closest("a")).toHaveAttribute("href", "/admin/workflows/workflow_1");
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
  });
});
