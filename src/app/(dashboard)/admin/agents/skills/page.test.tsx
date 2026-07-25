import React from "react";
import { fireEvent, renderWithProviders as render, screen, waitFor } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { AgentSkillsCatalog } from "./page";

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

const tools = [
  {
    _id: "tool_browser_open",
    name: "Open browser",
    description: "Open a browser page.",
    type: "MCP",
    handlerMapping: "browser.open",
    inputSchemaJson: "{}",
    isActive: true,
    createdBy: "user_1",
    createdAt: Date.UTC(2026, 5, 18),
    updatedAt: Date.UTC(2026, 5, 18),
  },
  {
    _id: "tool_browser_screenshot",
    name: "Browser screenshot",
    description: "Capture a browser screenshot.",
    type: "MCP",
    handlerMapping: "browser.screenshot",
    inputSchemaJson: "{}",
    isActive: true,
    createdBy: "user_1",
    createdAt: Date.UTC(2026, 5, 18),
    updatedAt: Date.UTC(2026, 5, 18),
  },
];

describe("AgentSkillsCatalogPage", () => {
  const createSkill = vi.fn();
  const importSkillBundle = vi.fn();
  const previewSkillMarkdownImport = vi.fn();
  const importSkillMarkdown = vi.fn();
  const seedStarterSkills = vi.fn();
  const loadMore = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePaginatedQuery).mockReturnValue({
      results: skills,
      status: "CanLoadMore",
      loadMore,
    } as unknown as ReturnType<typeof usePaginatedQuery>);
    vi.mocked(useQuery).mockImplementation((...args) => {
      const [queryFn] = args;
      const functionName = getFunctionName(queryFn);
      if (functionName === "aiTools:getTools") {
        return tools as unknown as ReturnType<typeof useQuery>;
      }
      return analytics as unknown as ReturnType<typeof useQuery>;
    });
    vi.mocked(useMutation).mockImplementation((mutationFn) => {
      const functionName = getFunctionName(mutationFn);
      if (functionName === "agentSkills:seedStarterSkills") {
        return seedStarterSkills as unknown as ReturnType<typeof useMutation>;
      }
      if (functionName === "agentSkills:importSkillBundle") {
        return importSkillBundle as unknown as ReturnType<typeof useMutation>;
      }
      if (functionName === "agentSkills:previewSkillMarkdownImport") {
        return previewSkillMarkdownImport as unknown as ReturnType<typeof useMutation>;
      }
      if (functionName === "agentSkills:importSkillMarkdown") {
        return importSkillMarkdown as unknown as ReturnType<typeof useMutation>;
      }
      return createSkill as unknown as ReturnType<typeof useMutation>;
    });
  });

  it("renders skill cards and catalog actions", async () => {
    seedStarterSkills.mockResolvedValue({ createdCount: 2, skippedCount: 4 });

    render(<AgentSkillsCatalog />);

    expect(screen.getByText("Skill Center")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Upload a skill file/ })).toBeInTheDocument();
    expect(screen.getByText("How your skills are being used")).toBeInTheDocument();
    expect(screen.getByText("In use by agents")).toBeInTheDocument();
    expect(screen.getByText("Out of date")).toBeInTheDocument();
    expect(screen.getByText("Untested")).toBeInTheDocument();
    expect(screen.getByText("2 outdated")).toBeInTheDocument();
    expect(screen.getByText("1 needs smoke")).toBeInTheDocument();
    expect(screen.getByText("Research Briefing")).toBeInTheDocument();
    expect(screen.getAllByText("Approval Handoff")).toHaveLength(2);
    expect(screen.getByText("medium risk")).toBeInTheDocument();
    expect(screen.getByText("high risk")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Research Briefing/ })).toHaveAttribute("href", "/admin/ai/skills/skill_research");

    fireEvent.click(screen.getByRole("button", { name: /Add example skills/ }));
    await waitFor(() => {
      expect(seedStarterSkills).toHaveBeenCalledWith({});
    });
    expect(await screen.findByText("Created 2 starter skills; skipped 4 existing.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(loadMore).toHaveBeenCalledWith(15);
  });

  it("keeps catalog links inside a custom base path", () => {
    render(<AgentSkillsCatalog basePath="/admin/ai/skills" />);

    expect(screen.getByRole("link", { name: /Research Briefing/ })).toHaveAttribute("href", "/admin/ai/skills/skill_research");
  });

  it("narrows by status in the database rather than sifting a fetched page", async () => {
    render(<AgentSkillsCatalog />);

    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "DRAFT" } });

    await waitFor(() => {
      expect(vi.mocked(usePaginatedQuery).mock.calls.at(-1)?.[1]).toMatchObject({ status: "DRAFT" });
    });
  });

  it("hides the health panel until it has something to measure", () => {
    // Five counters reading zero was the most prominent thing on an empty
    // account, and a panel that measures nothing reads as broken, not as new.
    vi.mocked(usePaginatedQuery).mockReturnValue({
      results: [],
      status: "Exhausted",
      loadMore,
    } as unknown as ReturnType<typeof usePaginatedQuery>);
    vi.mocked(useQuery).mockImplementation((...args) => {
      const [queryFn] = args;
      if (getFunctionName(queryFn) === "aiTools:getTools") {
        return tools as unknown as ReturnType<typeof useQuery>;
      }
      return {
        totals: { skills: 0, enabledBindings: 0, outdatedBindings: 0, validatedBindings: 0, needsSmokeBindings: 0 },
        needsAttention: [],
        computedAt: null,
        skillsCounted: 0,
        isPartial: false,
      } as unknown as ReturnType<typeof useQuery>;
    });

    render(<AgentSkillsCatalog />);

    expect(screen.queryByText("How your skills are being used")).not.toBeInTheDocument();
    // The way in is still obvious.
    expect(screen.getByRole("button", { name: /Upload a skill file/ })).toBeInTheDocument();
  });

  it("imports a SKILL.md file as a reviewed draft", async () => {
    previewSkillMarkdownImport.mockResolvedValue({
      sourceFilename: "SKILL.md",
      sourceHash: "skillhash",
      name: "Browser QA",
      description: "Verify browser workflows.",
      category: "QA",
      riskLevel: "MEDIUM",
      instruction: "Use browser checks to verify local UI behavior.",
      requiredToolMappingsJson: "[\"browser.open\"]",
      recommendedToolMappingsJson: "[]",
      suggestedEvalFixturesJson: "[]",
      validation: {
        errors: [],
        warnings: ["No examples or eval fixtures were found."],
        suggestions: ["Add at least two starter eval fixtures before marking the skill production-ready."],
      },
    });
    importSkillMarkdown.mockResolvedValue({ skillId: "skill_markdown", skillVersionId: "skill_markdown_version_1", outcome: "CREATED" });
    const file = new File(["# Browser QA\n\nVerify browser workflows."], "SKILL.md", { type: "text/markdown" });
    Object.defineProperty(file, "text", {
      value: vi.fn().mockResolvedValue("# Browser QA\n\nVerify browser workflows."),
    });

    render(<AgentSkillsCatalog />);

    fireEvent.click(screen.getByRole("button", { name: /Upload a skill file/ }));
    fireEvent.change(screen.getByLabelText("SKILL.md file"), { target: { files: [file] } });
    expect(await screen.findByText("Selected file:")).toBeInTheDocument();
    const parseButton = screen.getByRole("button", { name: "Parse file" });
    await waitFor(() => {
      expect(parseButton).not.toBeDisabled();
    });
    fireEvent.click(parseButton);

    await waitFor(() => {
      expect(previewSkillMarkdownImport).toHaveBeenCalledWith({
        markdown: "# Browser QA\n\nVerify browser workflows.",
        filename: "SKILL.md",
      });
    });
    expect(await screen.findByDisplayValue("Browser QA")).toBeInTheDocument();
    expect(screen.getByText("No examples or eval fixtures were found.")).toBeInTheDocument();
    expect(screen.getByText("Production readiness")).toBeInTheDocument();
    expect(screen.getByText("All imported mappings match active tools.")).toBeInTheDocument();
    expect(screen.getByText("No starter fixtures.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "browser.open" })).toHaveLength(2);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Browser QA Review" } });
    fireEvent.click(screen.getAllByRole("button", { name: "browser.screenshot" })[1]);
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(importSkillMarkdown).toHaveBeenCalledWith({
        sourceFilename: "SKILL.md",
        sourceHash: "skillhash",
        // The file itself now travels with the import, so the skill can show
        // what was uploaded and a re-upload can be matched to it.
        sourceMarkdown: "# Browser QA\n\nVerify browser workflows.",
        name: "Browser QA Review",
        description: "Verify browser workflows.",
        category: "QA",
        riskLevel: "MEDIUM",
        instruction: "Use browser checks to verify local UI behavior.",
        requiredToolMappingsJson: "[\"browser.open\"]",
        recommendedToolMappingsJson: "[\"browser.screenshot\"]",
        suggestedEvalFixturesJson: "[]",
      });
    });
    expect(await screen.findByText("Added Browser QA Review as a draft skill.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open imported skill" })).toHaveAttribute("href", "/admin/ai/skills/skill_markdown");
  });

  it("creates a skill from the catalog modal", async () => {
    createSkill.mockResolvedValue("skill_new");

    render(<AgentSkillsCatalog />);

    fireEvent.click(screen.getByRole("button", { name: /Write one here/ }));
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

    render(<AgentSkillsCatalog />);

    fireEvent.click(screen.getByRole("button", { name: /Restore from backup/ }));
    fireEvent.change(screen.getByLabelText("Bundle JSON"), { target: { value: bundleJson } });
    fireEvent.click(screen.getByRole("button", { name: "Import draft" }));

    await waitFor(() => {
      expect(importSkillBundle).toHaveBeenCalledWith({ bundleJson });
    });
    expect(await screen.findByText("Skill bundle imported as a draft.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open imported skill" })).toHaveAttribute("href", "/admin/ai/skills/skill_imported");
  });
});
