import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import AgentSkillsCatalogPage from "./page";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  usePaginatedQuery: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const skills = [
  {
    _id: "skill_research",
    name: "Research Briefing",
    description: "Produce concise sourced briefings.",
    category: "STARTER",
    status: "ACTIVE",
    riskLevel: "MEDIUM",
    instruction: "Separate known facts from assumptions.",
    createdBy: "user_1",
    createdAt: Date.UTC(2026, 5, 18),
    updatedAt: Date.UTC(2026, 5, 18),
  },
  {
    _id: "skill_approval",
    name: "Approval Handoff",
    description: "Pause risky operations before side effects.",
    category: "STARTER",
    status: "DRAFT",
    riskLevel: "HIGH",
    instruction: "Ask for approval before sending.",
    createdBy: "user_1",
    createdAt: Date.UTC(2026, 5, 18),
    updatedAt: Date.UTC(2026, 5, 18),
  },
];

const analytics = {
  totals: {
    skills: 6,
    activeSkills: 5,
    draftSkills: 1,
    archivedSkills: 0,
    highRiskSkills: 2,
    totalBindings: 8,
    enabledBindings: 7,
    activeAgentBindings: 5,
    outdatedBindings: 2,
    currentBindings: 5,
    validatedBindings: 3,
    needsSmokeBindings: 2,
    highRiskNeedsSmokeBindings: 1,
  },
  needsAttention: [{
    skillId: "skill_approval",
    name: "Approval Handoff",
    category: "STARTER",
    riskLevel: "HIGH",
    boundAgents: 4,
    enabledAgents: 4,
    outdatedAgents: 2,
    needsSmokeAgents: 1,
    validatedAgents: 1,
  }],
};

describe("AgentSkillsCatalogPage", () => {
  const createSkill = vi.fn();
  const importSkillBundle = vi.fn();
  const seedStarterSkills = vi.fn();
  const loadMore = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePaginatedQuery).mockReturnValue({
      results: skills,
      status: "CanLoadMore",
      loadMore,
    } as unknown as ReturnType<typeof usePaginatedQuery>);
    vi.mocked(useQuery).mockReturnValue(analytics as unknown as ReturnType<typeof useQuery>);
    vi.mocked(useMutation).mockImplementation((mutationFn) => {
      const functionName = getFunctionName(mutationFn);
      if (functionName === "agentSkills:seedStarterSkills") {
        return seedStarterSkills as unknown as ReturnType<typeof useMutation>;
      }
      if (functionName === "agentSkills:importSkillBundle") {
        return importSkillBundle as unknown as ReturnType<typeof useMutation>;
      }
      return createSkill as unknown as ReturnType<typeof useMutation>;
    });
  });

  it("renders skill cards and catalog actions", async () => {
    seedStarterSkills.mockResolvedValue({ createdCount: 2, skippedCount: 4 });

    render(<AgentSkillsCatalogPage />);

    expect(screen.getByText("Agent skills")).toBeInTheDocument();
    expect(screen.getByText("Skill rollout health")).toBeInTheDocument();
    expect(screen.getByText("Enabled agents")).toBeInTheDocument();
    expect(screen.getByText("Outdated")).toBeInTheDocument();
    expect(screen.getByText("Needs smoke")).toBeInTheDocument();
    expect(screen.getByText("2 outdated")).toBeInTheDocument();
    expect(screen.getByText("1 needs smoke")).toBeInTheDocument();
    expect(screen.getByText("Research Briefing")).toBeInTheDocument();
    expect(screen.getAllByText("Approval Handoff")).toHaveLength(2);
    expect(screen.getByText("medium risk")).toBeInTheDocument();
    expect(screen.getByText("high risk")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Research Briefing/ })).toHaveAttribute("href", "/admin/agents/skills/skill_research");

    fireEvent.click(screen.getByRole("button", { name: /Seed starters/ }));
    await waitFor(() => {
      expect(seedStarterSkills).toHaveBeenCalledWith({});
    });
    expect(await screen.findByText("Created 2 starter skills; skipped 4 existing.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(loadMore).toHaveBeenCalledWith(15);
  });

  it("creates a skill from the catalog modal", async () => {
    createSkill.mockResolvedValue("skill_new");

    render(<AgentSkillsCatalogPage />);

    fireEvent.click(screen.getByRole("button", { name: /New skill/ }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Client Follow-up" } });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "COMMUNICATIONS" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "ACTIVE" } });
    fireEvent.change(screen.getByLabelText("Risk"), { target: { value: "LOW" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Draft client-safe follow-up messages." } });
    fireEvent.change(screen.getByLabelText("Instruction"), { target: { value: "Draft concise follow-ups using approved context only." } });
    fireEvent.change(screen.getByLabelText("Required tool mappings JSON"), { target: { value: "[\"crm.contacts.read\"]" } });
    fireEvent.change(screen.getByLabelText("Suggested eval fixtures JSON"), { target: { value: "[]" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(createSkill).toHaveBeenCalledWith({
        name: "Client Follow-up",
        description: "Draft client-safe follow-up messages.",
        category: "COMMUNICATIONS",
        status: "ACTIVE",
        riskLevel: "LOW",
        instruction: "Draft concise follow-ups using approved context only.",
        requiredToolMappingsJson: "[\"crm.contacts.read\"]",
        recommendedToolMappingsJson: "[]",
        suggestedEvalFixturesJson: "[]",
      });
    });
  });

  it("imports a skill bundle as a draft", async () => {
    importSkillBundle.mockResolvedValue({ skillId: "skill_imported", skillVersionId: "skill_imported_version_1" });
    const bundleJson = JSON.stringify({
      format: "sonae.agentSkillBundle.v1",
      skill: {
        name: "Imported Skill",
        category: "IMPORTED",
        riskLevel: "LOW",
        instruction: "Imported behavior.",
        requiredToolMappings: [],
        recommendedToolMappings: [],
        suggestedEvalFixtures: [],
      },
    });

    render(<AgentSkillsCatalogPage />);

    fireEvent.click(screen.getByRole("button", { name: /Import bundle/ }));
    fireEvent.change(screen.getByLabelText("Bundle JSON"), { target: { value: bundleJson } });
    fireEvent.click(screen.getByRole("button", { name: "Import draft" }));

    await waitFor(() => {
      expect(importSkillBundle).toHaveBeenCalledWith({ bundleJson });
    });
    expect(await screen.findByText("Skill bundle imported as a draft.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open imported skill" })).toHaveAttribute("href", "/admin/agents/skills/skill_imported");
  });
});
