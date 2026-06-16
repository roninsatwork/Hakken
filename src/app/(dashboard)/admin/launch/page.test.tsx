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

describe("LaunchPage", () => {
  const createLaunchPlan = vi.fn();

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
      return undefined as unknown as ReturnType<typeof useQuery>;
    });
    vi.mocked(useMutation).mockReturnValue(createLaunchPlan as unknown as ReturnType<typeof useMutation>);
  });

  it("renders launch templates and recent draft plans", () => {
    render(<LaunchPage />);

    expect(screen.getByText("App Kits")).toBeInTheDocument();
    expect(screen.getAllByText("Support Desk AI").length).toBeGreaterThan(0);
    expect(screen.getByText("Sales Research Copilot")).toBeInTheDocument();
    expect(screen.getByText("Draft Build Plan")).toBeInTheDocument();
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
    fireEvent.change(screen.getByPlaceholderText("Developer notes, constraints, or custom work needed"), {
      target: { value: "Use support template" },
    });
    fireEvent.click(screen.getByText("Save draft build plan"));

    await waitFor(() => {
      expect(createLaunchPlan).toHaveBeenCalledWith({
        templateId: "support-desk-ai",
        targetCompanyName: "Beta Support",
        notes: "Use support template",
      });
    });
    expect(await screen.findByText("Draft build plan saved.")).toBeInTheDocument();
  });
});
