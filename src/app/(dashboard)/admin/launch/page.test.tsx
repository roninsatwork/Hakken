import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import LaunchPage from "./page";

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

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockImplementation((queryFn, _args?) => {
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

  it("renders launch templates and recent draft plans", () => {
    render(<LaunchPage />);

    expect(screen.getByText("App Kits")).toBeInTheDocument();
    expect(screen.getAllByText("Support Desk AI").length).toBeGreaterThan(0);
    expect(screen.getByText("Sales Research Copilot")).toBeInTheDocument();
    expect(screen.getByText("Draft Build Plan")).toBeInTheDocument();
    expect(screen.getByText("Catalogue Registry")).toBeInTheDocument();
    expect(screen.getByText("ACTIVE · synced")).toBeInTheDocument();
    expect(screen.getByText("1/2 saved")).toBeInTheDocument();
    expect(screen.getByDisplayValue("catalog@example.com")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Ready for support starters.")).toBeInTheDocument();
    expect(screen.getByText("Acme Support")).toBeInTheDocument();
    expect(screen.getByText("Developer Follow-Up")).toBeInTheDocument();
    expect(screen.getByText("Map ticket fields to Zendesk.")).toBeInTheDocument();
    expect(screen.getByText("Extension Points")).toBeInTheDocument();
    expect(screen.getByText("Support tool handlers")).toBeInTheDocument();
    expect(screen.getByText("Code Pointers")).toBeInTheDocument();
    expect(screen.getByText("Ticket handlers")).toBeInTheDocument();
    expect(screen.getByText("convex/aiToolExecutionService.ts")).toBeInTheDocument();
  });

  it("persists a draft build plan for the selected template", async () => {
    createLaunchPlan.mockResolvedValue("plan_2");
    render(<LaunchPage />);

    fireEvent.change(screen.getByPlaceholderText("Target workspace name"), {
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
    fireEvent.change(screen.getByPlaceholderText("Connector owner email"), {
      target: { value: "integrations@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Connector keys, comma separated"), {
      target: { value: "zendesk, sonae-knowledge" },
    });
    fireEvent.change(screen.getByPlaceholderText("Connector setup notes or missing integrations"), {
      target: { value: "Zendesk OAuth needs customer approval" },
    });
    fireEvent.change(screen.getByPlaceholderText("Knowledge owner email"), {
      target: { value: "docs@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Source candidates, comma separated"), {
      target: { value: "Help Center, Refund SOP" },
    });
    fireEvent.change(screen.getByPlaceholderText("Knowledge import notes or missing sources"), {
      target: { value: "Missing billing edge cases" },
    });
    fireEvent.change(screen.getByPlaceholderText("Surface owner email"), {
      target: { value: "surfaces@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Target surfaces, comma separated"), {
      target: { value: "Internal app, Support widget" },
    });
    fireEvent.change(screen.getByPlaceholderText("Surface notes, embed needs, or callback work"), {
      target: { value: "Widget embed needs branded QA" },
    });
    fireEvent.change(screen.getByPlaceholderText("Developer notes, constraints, or custom work needed"), {
      target: { value: "Use support template" },
    });
    fireEvent.click(screen.getByText("Save draft build plan"));

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
    expect(await screen.findByText("Draft build plan saved.")).toBeInTheDocument();
  });

  it("syncs and edits app kit registry metadata", async () => {
    syncCatalogRegistry.mockResolvedValue({ createdCount: 1, updatedCount: 1, totalCount: 2 });
    updateCatalogItem.mockResolvedValue("registry_1");
    render(<LaunchPage />);

    fireEvent.click(screen.getByText("Sync registry"));

    await waitFor(() => {
      expect(syncCatalogRegistry).toHaveBeenCalledWith({});
    });
    expect(await screen.findByText("Registry synced: 1 created, 1 updated.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Catalogue lifecycle status"), {
      target: { value: "NEEDS_REVIEW" },
    });
    fireEvent.change(screen.getByPlaceholderText("Catalogue owner email"), {
      target: { value: "owner@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Catalogue registry notes"), {
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
