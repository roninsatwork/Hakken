import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import LaunchPage from "./page";
import { AppKitDetailContent, AppKitSetupContent } from "../app-kits/AppKitsClient";

const routerPush = vi.fn();

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

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPush,
  }),
}));

const templates = [
  {
    id: "support-desk-ai",
    category: "Customer Support",
    name: "Support Desk AI",
    tagline: "Triage tickets and draft replies.",
    description: "A governed support starter.",
    riskProfile: "MEDIUM",
    primaryUsers: ["Support leads"],
    recommendedConnectorKeys: ["zendesk", "gmail"],
    recommendedSkills: ["Document Extraction", "Approval Handoff"],
    agents: ["Support Triage Agent"],
    knowledgeScopes: ["Help center"],
    workflows: ["New ticket triage"],
    evalFixtures: ["Refund promise blocked"],
    dashboardCards: ["Open high-risk cases"],
    publishTargets: ["Internal app"],
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
  },
  {
    id: "sales-research-copilot",
    category: "Sales",
    name: "Sales Research Copilot",
    tagline: "Prepare account briefs.",
    description: "A sales research starter.",
    riskProfile: "MEDIUM",
    primaryUsers: ["Sales reps"],
    recommendedConnectorKeys: ["hubspot"],
    recommendedSkills: ["Research Briefing"],
    agents: ["Prospect Research Agent"],
    knowledgeScopes: ["ICP"],
    workflows: ["Target account brief"],
    evalFixtures: ["No invented contact claims"],
    dashboardCards: ["Qualified leads"],
    publishTargets: ["Internal app"],
    readinessChecks: ["ICP uploaded"],
    developerFollowUps: ["Map CRM lead fields."],
    extensionPoints: ["Lead enrichment handlers"],
    implementationPointers: [
      {
        label: "Lead enrichment handlers",
        filePath: "convex/aiToolExecutionService.ts",
        notes: "Wire enrichment handlers.",
      },
    ],
  },
];

const launchPlans = [
  {
    _id: "plan_1",
    templateName: "Support Desk AI",
    category: "Customer Support",
    riskProfile: "MEDIUM",
    status: "DRAFT",
    targetCompanyName: "Acme Support",
    notes: "Initial plan",
    createdAt: Date.UTC(2026, 5, 16),
  },
];

const activeSkills = [
  {
    _id: "skill_approval",
    name: "Approval Handoff",
    description: "Pause risky actions before side effects.",
    category: "STARTER",
    status: "ACTIVE",
    riskLevel: "HIGH",
    instruction: "Ask for approval before side effects.",
    createdBy: "user_1",
    createdAt: Date.UTC(2026, 5, 16),
    updatedAt: Date.UTC(2026, 5, 16),
  },
  {
    _id: "skill_extraction",
    name: "Document Extraction",
    description: "Extract facts with provenance.",
    category: "STARTER",
    status: "ACTIVE",
    riskLevel: "MEDIUM",
    instruction: "Extract supported facts only.",
    createdBy: "user_1",
    createdAt: Date.UTC(2026, 5, 16),
    updatedAt: Date.UTC(2026, 5, 16),
  },
];

const catalogRegistry = [
  {
    templateId: "support-desk-ai",
    templateName: "Support Desk AI",
    category: "Customer Support",
    riskProfile: "MEDIUM",
    registry: {
      templateId: "support-desk-ai",
      lifecycleStatus: "ACTIVE",
      ownerEmail: "catalog@example.com",
      editorialNotes: "Ready for support starters.",
      lastSyncedAt: Date.UTC(2026, 5, 16),
      updatedAt: Date.UTC(2026, 5, 16),
    },
    isSynced: true,
  },
  {
    templateId: "sales-research-copilot",
    templateName: "Sales Research Copilot",
    category: "Sales",
    riskProfile: "MEDIUM",
    registry: null,
    isSynced: false,
  },
];

describe("LaunchPage", () => {
  const createLaunchPlan = vi.fn();
  const syncCatalogRegistry = vi.fn();
  const updateCatalogItem = vi.fn();

  function renderDetailPage(templateId = "support-desk-ai") {
    return render(<AppKitDetailContent templateId={templateId} />);
  }

  function renderSetupPage(templateId = "support-desk-ai") {
    return render(<AppKitSetupContent templateId={templateId} />);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    routerPush.mockClear();
    vi.mocked(useQuery).mockImplementation((queryFn, args?) => {
      void args;
      const functionName = getFunctionName(queryFn);
      if (functionName === "appTemplates:getAppTemplateGallery") {
        return templates as unknown as ReturnType<typeof useQuery>;
      }
      if (functionName === "appTemplates:getRecentLaunchPlans") {
        return launchPlans as unknown as ReturnType<typeof useQuery>;
      }
      if (functionName === "appTemplates:getAppTemplateCatalogRegistry") {
        return catalogRegistry as unknown as ReturnType<typeof useQuery>;
      }
      if (functionName === "agentSkills:getActiveSkills") {
        return activeSkills as unknown as ReturnType<typeof useQuery>;
      }
      return undefined as unknown as ReturnType<typeof useQuery>;
    });
    vi.mocked(useMutation).mockImplementation((mutationFn) => {
      const functionName = getFunctionName(mutationFn);
      if (functionName === "appTemplates:syncAppTemplateCatalogRegistry") {
        return syncCatalogRegistry as unknown as ReturnType<typeof useMutation>;
      }
      if (functionName === "appTemplates:updateAppTemplateCatalogItem") {
        return updateCatalogItem as unknown as ReturnType<typeof useMutation>;
      }
      return createLaunchPlan as unknown as ReturnType<typeof useMutation>;
    });
  });

  it("renders a focused app kit catalog and recent draft plans", () => {
    render(<LaunchPage />);

    expect(screen.getByText("App Kits")).toBeInTheDocument();
    expect(screen.getByText("Guided launch path")).toBeInTheDocument();
    expect(screen.getByText("Start with a safe draft, then review before release.")).toBeInTheDocument();
    expect(screen.getByText("Choose a starter")).toBeInTheDocument();
    expect(screen.getByText("Run setup")).toBeInTheDocument();
    expect(screen.getByText("Create drafts")).toBeInTheDocument();
    const supportKitLink = screen
      .getAllByRole("link", { name: /Support Desk AI/i })
      .find((link) => link.getAttribute("href") === "/admin/app-kits/support-desk-ai");
    expect(supportKitLink).toBeDefined();
    expect(screen.getByText("Sales Research Copilot")).toBeInTheDocument();
    expect(screen.getAllByText("Best for")).toHaveLength(2);
    expect(screen.getByText("Support leads")).toBeInTheDocument();
    expect(screen.getByText("Zendesk, Gmail · Help center")).toBeInTheDocument();
    expect(screen.getAllByText("1 agents, 2 skills, 1 workflows")).toHaveLength(1);
    expect(screen.getAllByText("1 agents, 1 skills, 1 workflows")).toHaveLength(1);
    expect(screen.getByText("Draft-only resources · Saved · synced")).toBeInTheDocument();
    expect(screen.getAllByText("Review kit")).toHaveLength(2);
    expect(screen.queryByText("Draft Build Plan")).not.toBeInTheDocument();
    expect(screen.queryByText("Catalogue Registry")).not.toBeInTheDocument();
    expect(screen.getByText("Draft-only resources · Not saved")).toBeInTheDocument();
    expect(screen.getByText("1/2 saved")).toBeInTheDocument();
    expect(screen.getByText("Acme Support")).toBeInTheDocument();
  });

  it("renders app kit detail content", async () => {
    renderDetailPage();

    expect(await screen.findByRole("link", { name: /App Kits/i })).toHaveAttribute("href", "/admin/app-kits");
    expect(screen.getByRole("heading", { name: "Support Desk AI" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Start setup/i })[0]).toHaveAttribute("href", "/admin/app-kits/support-desk-ai/setup");
    expect(screen.getByText("Internal catalog status")).toBeInTheDocument();
    expect(screen.getByText("ACTIVE · synced")).toBeInTheDocument();
    expect(screen.getByDisplayValue("catalog@example.com")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Ready for support starters.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Approval Handoff/ })).toHaveAttribute("href", "/admin/ai/skills/skill_approval");
    expect(screen.getByText("Developer work still needed")).toBeInTheDocument();
    expect(screen.getByText("Map ticket fields to Zendesk.")).toBeInTheDocument();
    expect(screen.getByText("Where this can be customized")).toBeInTheDocument();
    expect(screen.getByText("Support tool handlers")).toBeInTheDocument();
    expect(screen.getByText("Developer reference files")).toBeInTheDocument();
    expect(screen.getByText("Ticket handlers")).toBeInTheDocument();
    expect(screen.getByText("convex/aiToolExecutionService.ts")).toBeInTheDocument();
  });

  it("persists a draft build plan from the setup wizard", async () => {
    createLaunchPlan.mockResolvedValue("plan_2");
    renderSetupPage();

    expect(await screen.findByRole("heading", { name: "Use case" })).toBeInTheDocument();
    expect(screen.getByText("What to decide")).toBeInTheDocument();
    expect(screen.getByText("Safe to leave blank")).toBeInTheDocument();
    expect(screen.getByText("Decide whether this starter matches the customer problem before collecting setup details.")).toBeInTheDocument();
    expect(screen.getByText("No fields are required here. Continue when the use case, audience, and safety model look right.")).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Next"));
    expect(await screen.findByRole("heading", { name: "Workspace" })).toBeInTheDocument();
    expect(screen.getByText("Capture the customer workspace, first owner, product label, and model-use defaults for the draft plan.")).toBeInTheDocument();
    expect(screen.getByText("Leave unknown fields blank. The plan can still be saved and completed from the maintenance dashboard.")).toBeInTheDocument();
    expect(screen.getAllByText("Complete")).toHaveLength(1);

    fireEvent.change(await screen.findByPlaceholderText("Target workspace name"), {
      target: { value: "Beta Support" },
    });
    fireEvent.change(screen.getByPlaceholderText("Product or app name"), {
      target: { value: "Beta Desk" },
    });
    fireEvent.change(screen.getByPlaceholderText("Brand accent HEX, e.g. #0f766e"), {
      target: { value: "#0f766e" },
    });
    fireEvent.change(screen.getByPlaceholderText("First tenant admin email"), {
      target: { value: "owner@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Invite policy note"), {
      target: { value: "Platform team sends first invite" },
    });
    fireEvent.change(screen.getByPlaceholderText("Model default use cases"), {
      target: { value: "agent, workflow, chat" },
    });
    fireEvent.change(screen.getByPlaceholderText("Target plan name"), {
      target: { value: "Scale" },
    });
    fireEvent.click(screen.getByText("Next"));

    expect(screen.getByLabelText(/Zendesk/i)).toBeChecked();
    expect(screen.getByLabelText(/Gmail/i)).toBeChecked();
    fireEvent.click(screen.getByLabelText(/Gmail/i));
    expect(screen.getByPlaceholderText("Connector keys, comma separated")).toHaveValue("zendesk");
    fireEvent.click(screen.getByLabelText(/Zendesk/i));
    expect(screen.getByPlaceholderText("Connector keys, comma separated")).toHaveValue("");
    fireEvent.click(screen.getByLabelText(/Gmail/i));
    expect(screen.getByPlaceholderText("Connector keys, comma separated")).toHaveValue("gmail");
    fireEvent.change(screen.getByPlaceholderText("Connector owner email"), {
      target: { value: "integrations@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Connector keys, comma separated"), {
      target: { value: "zendesk, sonae-knowledge" },
    });
    fireEvent.change(screen.getByPlaceholderText("Connector setup notes or missing integrations"), {
      target: { value: "Zendesk OAuth needs customer approval" },
    });
    fireEvent.click(screen.getByText("Next"));

    expect(screen.getByLabelText(/Help center/i)).toBeChecked();
    fireEvent.change(screen.getByPlaceholderText("Knowledge owner email"), {
      target: { value: "docs@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Source candidates, comma separated"), {
      target: { value: "Help Center, Refund SOP" },
    });
    fireEvent.change(screen.getByPlaceholderText("Knowledge import notes or missing sources"), {
      target: { value: "Missing billing edge cases" },
    });
    fireEvent.click(screen.getByText("Next"));

    expect(screen.getByLabelText(/Internal app/i)).toBeChecked();
    fireEvent.change(screen.getByPlaceholderText("Surface owner email"), {
      target: { value: "surfaces@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Target surfaces, comma separated"), {
      target: { value: "Internal app, Support widget" },
    });
    fireEvent.change(screen.getByPlaceholderText("Surface notes, embed needs, or callback work"), {
      target: { value: "Widget embed needs branded QA" },
    });
    fireEvent.click(screen.getByText("Next"));

    fireEvent.change(screen.getByPlaceholderText("Developer notes, constraints, or custom work needed"), {
      target: { value: "Use support template" },
    });
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Create draft build plan"));

    await waitFor(() => {
      expect(createLaunchPlan).toHaveBeenCalledWith({
        templateId: "support-desk-ai",
        targetCompanyName: "Beta Support",
        notes: "Use support template",
        setupOverrides: {
          brandProductName: "Beta Desk",
          brandAccentHex: "#0f766e",
          firstAdminEmail: "owner@example.com",
          invitePolicyNotes: "Platform team sends first invite",
          modelDefaultUseCases: ["agent", "workflow", "chat"],
          targetPlanName: "Scale",
          connectorOwnerEmail: "integrations@example.com",
          selectedConnectorKeys: ["zendesk", "sonae-knowledge"],
          connectorBundleNotes: "Zendesk OAuth needs customer approval",
          knowledgeOwnerEmail: "docs@example.com",
          starterKnowledgeSources: ["Help Center", "Refund SOP"],
          knowledgeSourceNotes: "Missing billing edge cases",
          surfaceOwnerEmail: "surfaces@example.com",
          selectedPublishTargets: ["Internal app", "Support widget"],
          publishSurfaceNotes: "Widget embed needs branded QA",
        },
      });
    });
    expect(routerPush).toHaveBeenCalledWith("/admin/app-kits/plans/plan_2");
  });

  it("syncs and edits app kit registry metadata from the detail page", async () => {
    syncCatalogRegistry.mockResolvedValue({ createdCount: 1, updatedCount: 1, totalCount: 2 });
    updateCatalogItem.mockResolvedValue("registry_1");
    renderDetailPage();

    fireEvent.click(await screen.findByText("Sync registry"));

    await waitFor(() => {
      expect(syncCatalogRegistry).toHaveBeenCalledWith({});
    });
    expect(await screen.findByText("Registry synced: 1 created, 1 updated.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Catalog lifecycle status"), {
      target: { value: "NEEDS_REVIEW" },
    });
    fireEvent.change(screen.getByPlaceholderText("Catalog owner email"), {
      target: { value: "owner@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Catalog registry notes"), {
      target: { value: "Needs pricing review." },
    });
    fireEvent.click(screen.getByText("Save registry item"));

    await waitFor(() => {
      expect(updateCatalogItem).toHaveBeenCalledWith({
        templateId: "support-desk-ai",
        lifecycleStatus: "NEEDS_REVIEW",
        ownerEmail: "owner@example.com",
        editorialNotes: "Needs pricing review.",
      });
    });
    expect(await screen.findByText("Registry item saved.")).toBeInTheDocument();
  });
});
