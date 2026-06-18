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
    "Confirm connector bundle ownership, auth mode, tenant scope, and Marketplace setup before activation.",
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
      category: "Brand",
      title: "Confirm workspace brand",
      status: "BLOCKED",
      detail: "Prepare the Acme Support name, product description, logo assets, and brand accent before tenant-facing surfaces are enabled.",
      actionLabel: "Create workspace first",
    },
    {
      category: "Access",
      title: "Invite first admin",
      status: "BLOCKED",
      detail: "Invite one accountable tenant admin first, keep super-admin privileges platform-owned, and confirm who can invite additional users.",
      actionLabel: "Create workspace first",
    },
    {
      category: "Models",
      title: "Set tenant model defaults",
      status: "BLOCKED",
      detail: "Review tenant model defaults for agent, workflow, chat, report, router, and embedding use cases before release gates run.",
      actionLabel: "Open model defaults",
      actionHref: "/admin/ai/models",
    },
    {
      category: "Plan",
      title: "Assign billing plan",
      status: "BLOCKED",
      detail: "Assign a tenant plan deliberately so quotas, budgets, and inventory rollups match the starter's expected use.",
      actionLabel: "Create workspace first",
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
      category: "Surfaces",
      title: "Plan publish surfaces",
      status: "PENDING",
      detail: "Review saved surface intent for 1 target surface and 1 dashboard card.",
      actionLabel: "Review surface plan below",
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
    blockedCount: 5,
    pendingCount: 3,
    readyCount: 0,
    nextTaskTitle: "Confirm workspace brand",
    nextTaskCategory: "Brand",
    nextTaskStatus: "BLOCKED",
  },
  workspaceSetupActions: [
    {
      key: "brand",
      title: "Apply brand and profile intent",
      status: "BLOCKED",
      detail: "Prepare the Acme Support name, product description, logo assets, and brand accent before tenant-facing surfaces are enabled.",
      actionLabel: "Create workspace first",
      savedInputs: ["Product name: Acme Help", "Brand accent candidate: #0f766e"],
    },
    {
      key: "invitePolicy",
      title: "Prepare first admin invite",
      status: "BLOCKED",
      detail: "Invite one accountable tenant admin first, keep super-admin privileges platform-owned, and confirm who can invite additional users.",
      actionLabel: "Create workspace first",
      savedInputs: ["First admin candidate: owner@acme.example"],
    },
    {
      key: "modelDefaults",
      title: "Review model defaults",
      status: "PENDING",
      detail: "Review tenant model defaults for agent, workflow, chat, report, router, and embedding use cases before release gates run.",
      actionLabel: "Open global model defaults",
      actionHref: "/admin/ai/models",
      savedInputs: ["Requested defaults: agent, workflow, chat, report, router, embedding"],
    },
    {
      key: "planAssignment",
      title: "Assign tenant plan",
      status: "BLOCKED",
      detail: "Assign a tenant plan deliberately so quotas, budgets, and inventory rollups match the starter's expected use.",
      actionLabel: "Create workspace first",
      savedInputs: ["Target plan candidate: Scale"],
    },
  ],
  surfaceImplementationActions: [
    {
      key: "target-internal-app",
      kind: "target",
      title: "Review Internal app",
      status: "PENDING",
      detail: "Review the product-specific app screen, permissions, empty states, and release gate before enabling this surface.",
      actionLabel: "Review app surface",
      actionHref: "/app",
    },
    {
      key: "target-support-widget",
      kind: "target",
      title: "Review Support widget",
      status: "PENDING",
      detail: "Review widget branding, allowed domains, embed code, escalation policy, and release gating before enabling this surface.",
      actionLabel: "Open widget settings",
      actionHref: "/admin/ai/widget",
    },
    {
      key: "dashboard-open-high-risk-cases",
      kind: "dashboardCard",
      title: "Map dashboard card: Open high-risk cases",
      status: "PENDING",
      detail: "Map this dashboard card to a metric source, owner, empty state, permissions boundary, and freshness expectation before launch review.",
      actionLabel: "Review reports",
      actionHref: "/app/reports",
    },
  ],
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
    knowledgeImport: {
      title: "Starter knowledge import",
      summary: "Prepare approved source material for the planned knowledge scopes before draft agents are tested or released.",
      scopes: ["Help center", "Refund policy"],
      checklist: [
        "Map each planned scope to approved source documents, URLs, or owner-provided notes.",
        "Run retrieval tests against the planned eval fixtures after ingestion.",
      ],
      savedInputs: [
        "Knowledge owner: docs@acme.example",
        "Import note: Missing billing edge cases.",
        "Source candidates: Help Center, Refund SOP",
      ],
    },
    connectorBundle: {
      title: "Connector bundle plan",
      summary: "Confirm connector ownership, auth mode, tenant scope, and Marketplace readiness before any connector-backed agent or workflow is activated.",
      connectorKeys: ["zendesk", "sonae-knowledge"],
      checklist: [
        "Install, authorize, activate, and test each connector through Marketplace.",
        "Keep connector-backed workflows inactive until auth and tenant scope are reviewed.",
      ],
      savedInputs: [
        "Connector owner: integrations@acme.example",
        "Selected connectors: zendesk, sonae-knowledge",
        "Connector note: Zendesk OAuth needs customer approval.",
      ],
    },
    publishSurface: {
      title: "Publish surface plan",
      summary: "Review internal app, widget, webhook, API, digest, and dashboard surfaces before any customer-facing activation.",
      targets: ["Internal app", "Support widget"],
      dashboardCards: ["Open high-risk cases"],
      checklist: [
        "Keep widgets, webhooks, APIs, and external actions disabled until release checks pass.",
      ],
      savedInputs: [
        "Surface owner: surfaces@acme.example",
        "Selected targets: Internal app, Support widget",
        "Surface note: Widget embed needs branded QA.",
      ],
    },
    workspaceSetup: {
      brand: {
        title: "Brand and theme",
        summary: "Prepare the Acme Support name, product description, logo assets, and brand accent before tenant-facing surfaces are enabled.",
        checklist: [
          "Confirm the workspace display name and short product description.",
          "Add light and dark logo assets or document that global platform branding should be inherited.",
        ],
        savedInputs: ["Product name: Acme Help", "Brand accent candidate: #0f766e"],
      },
      invitePolicy: {
        title: "First admin and invite policy",
        summary: "Invite one accountable tenant admin first, keep super-admin privileges platform-owned, and confirm who can invite additional users.",
        firstAdminRole: "ADMIN",
        checklist: ["Invite the first tenant owner as ADMIN after the workspace exists."],
        savedInputs: ["First admin candidate: owner@acme.example"],
      },
      modelDefaults: {
        title: "Model defaults",
        summary: "Review tenant model defaults for agent, workflow, chat, report, router, and embedding use cases before release gates run.",
        useCases: ["agent", "workflow", "chat", "report", "router", "embedding"],
        checklist: ["Run smoke evals after model defaults are selected."],
        savedInputs: ["Requested defaults: agent, workflow, chat, report, router, embedding"],
      },
      planAssignment: {
        title: "Plan assignment",
        summary: "Assign a tenant plan deliberately so quotas, budgets, and inventory rollups match the starter's expected use.",
        checklist: ["Choose an active plan that covers expected agent, widget, workflow, and API volume."],
        savedInputs: ["Target plan candidate: Scale"],
      },
    },
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
  const linkWorkspaceToLaunchPlan = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockImplementation((queryFn, args?) => {
      void args;
      const functionName = getFunctionName(queryFn);
      if (functionName === "appTemplates:getLaunchPlanDetails") {
        return details as unknown as ReturnType<typeof useQuery>;
      }
      if (functionName === "companies:getCompanyOptions") {
        return [
          { _id: "company_existing", name: "Existing Support Workspace" },
          { _id: "company_other", name: "Other Workspace" },
        ] as unknown as ReturnType<typeof useQuery>;
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
      if (functionName === "appTemplates:linkWorkspaceToLaunchPlan") {
        return linkWorkspaceToLaunchPlan as unknown as ReturnType<typeof useMutation>;
      }
      return archiveLaunchPlan as unknown as ReturnType<typeof useMutation>;
    });
  });

  it("renders a saved build plan review", () => {
    render(<LaunchPlanDetailPage />);

    expect(screen.getAllByText("Acme Support").length).toBeGreaterThan(0);
    expect(screen.getByText("Support Desk AI")).toBeInTheDocument();
    expect(screen.getByText("Support Triage Agent")).toBeInTheDocument();
    expect(screen.getAllByText("Zendesk").length).toBeGreaterThan(0);
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
    expect(screen.getByText("Workspace Setup Plan")).toBeInTheDocument();
    expect(screen.getByText("Guided setup actions")).toBeInTheDocument();
    expect(screen.getByText("Apply brand and profile intent")).toBeInTheDocument();
    expect(screen.getByText("Prepare first admin invite")).toBeInTheDocument();
    expect(screen.getByText("Review model defaults")).toBeInTheDocument();
    expect(screen.getByText("Assign tenant plan")).toBeInTheDocument();
    expect(screen.getByText("Open global model defaults")).toHaveAttribute("href", "/admin/ai/models");
    expect(screen.getByText("Starter knowledge import")).toBeInTheDocument();
    expect(screen.getByText("Knowledge owner: docs@acme.example")).toBeInTheDocument();
    expect(screen.getByText("Source candidates: Help Center, Refund SOP")).toBeInTheDocument();
    expect(screen.getByText("Run retrieval tests against the planned eval fixtures after ingestion.")).toBeInTheDocument();
    expect(screen.getByText("Connector bundle plan")).toBeInTheDocument();
    expect(screen.getByText("Connector owner: integrations@acme.example")).toBeInTheDocument();
    expect(screen.getByText("Selected connectors: zendesk, sonae-knowledge")).toBeInTheDocument();
    expect(screen.getByText("Connector note: Zendesk OAuth needs customer approval.")).toBeInTheDocument();
    expect(screen.getByText("Install, authorize, activate, and test each connector through Marketplace.")).toBeInTheDocument();
    expect(screen.getByText("Publish surface plan")).toBeInTheDocument();
    expect(screen.getByText("Surface owner: surfaces@acme.example")).toBeInTheDocument();
    expect(screen.getByText("Selected targets: Internal app, Support widget")).toBeInTheDocument();
    expect(screen.getByText("Surface note: Widget embed needs branded QA.")).toBeInTheDocument();
    expect(screen.getByText("Keep widgets, webhooks, APIs, and external actions disabled until release checks pass.")).toBeInTheDocument();
    expect(screen.getByText("Surface implementation actions")).toBeInTheDocument();
    expect(screen.getByText("Review Internal app")).toBeInTheDocument();
    expect(screen.getByText("Review Support widget")).toBeInTheDocument();
    expect(screen.getByText("Map dashboard card: Open high-risk cases")).toBeInTheDocument();
    expect(screen.getByText("Open widget settings")).toHaveAttribute("href", "/admin/ai/widget");
    expect(screen.getByText("Review reports")).toHaveAttribute("href", "/app/reports");
    expect(screen.getByText("Brand and theme")).toBeInTheDocument();
    expect(screen.getByText("First admin and invite policy")).toBeInTheDocument();
    expect(screen.getByText("Model defaults")).toBeInTheDocument();
    expect(screen.getByText("Plan assignment")).toBeInTheDocument();
    expect(screen.getAllByText("Saved intent").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Product name: Acme Help").length).toBeGreaterThan(0);
    expect(screen.getAllByText("First admin candidate: owner@acme.example").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Target plan candidate: Scale").length).toBeGreaterThan(0);
    expect(screen.getByText("Use cases: agent, workflow, chat, report, router, embedding")).toBeInTheDocument();
    expect(screen.getAllByText("Open model defaults").every((link) => link.getAttribute("href") === "/admin/ai/models")).toBe(true);
    expect(screen.getByText("Create or link workspace")).toBeInTheDocument();
    expect(screen.getByText("Confirm workspace brand")).toBeInTheDocument();
    expect(screen.getByText("Invite first admin")).toBeInTheDocument();
    expect(screen.getByText("Set tenant model defaults")).toBeInTheDocument();
    expect(screen.getByText("Assign billing plan")).toBeInTheDocument();
    expect(screen.getByText("Set up recommended connectors")).toBeInTheDocument();
    expect(screen.getByText("Plan publish surfaces")).toBeInTheDocument();
    expect(screen.getByText("Complete product-specific implementation")).toBeInTheDocument();
    expect(screen.getAllByText("BLOCKED").length).toBeGreaterThan(0);
    expect(screen.getByText("Create workspace below")).toBeInTheDocument();
    expect(screen.getByLabelText("Existing workspace")).toBeInTheDocument();
    expect(screen.getByText("Existing Support Workspace")).toBeInTheDocument();
    expect(screen.getByText("Link workspace")).toBeDisabled();
    expect(screen.getAllByText("Open Marketplace").every((link) => link.getAttribute("href") === "/admin/ai/tools")).toBe(true);
    expect(screen.getByText("Review code pointers below")).toBeInTheDocument();
    expect(screen.getByText("Next Recommended Task")).toBeInTheDocument();
    expect(screen.getByText("Brand: Confirm workspace brand")).toBeInTheDocument();
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

  it("links an existing workspace to a build plan", async () => {
    linkWorkspaceToLaunchPlan.mockResolvedValue("company_existing");
    render(<LaunchPlanDetailPage />);

    fireEvent.change(screen.getByLabelText("Existing workspace"), {
      target: { value: "company_existing" },
    });
    fireEvent.click(screen.getByText("Link workspace"));

    await waitFor(() => {
      expect(linkWorkspaceToLaunchPlan).toHaveBeenCalledWith({
        planId: "plan_1",
        companyId: "company_existing",
      });
      expect(refreshMock).toHaveBeenCalled();
    });
  });

  it("renders created draft resource links", () => {
    vi.mocked(useQuery).mockImplementation((queryFn, args?) => {
      void args;
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
