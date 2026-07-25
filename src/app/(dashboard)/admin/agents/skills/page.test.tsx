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

const push = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
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
  const updateSkill = vi.fn();
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
      if (functionName === "agentSkills:updateSkill") {
        return updateSkill as unknown as ReturnType<typeof useMutation>;
      }
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

  it("lists skills in the standard admin table, with upload as the only way in", async () => {
    render(<AgentSkillsCatalog />);

    expect(screen.getByText("Skill Center")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add new skill/ })).toBeInTheDocument();
    expect(screen.getByText("How your skills are being used")).toBeInTheDocument();
    expect(screen.getByText("In use by agents")).toBeInTheDocument();
    expect(screen.getByText("Out of date")).toBeInTheDocument();
    expect(screen.getByText("Untested")).toBeInTheDocument();
    expect(screen.getByText("Research Briefing")).toBeInTheDocument();
    expect(screen.getByText("Research Briefing")).toBeInTheDocument();

    // Uploading a SKILL.md is the only way skills arrive, so it is the only
    // action on the page. Seeding examples, writing one by hand and restoring a
    // bundle were removed at Anthony's direction; their Convex functions remain.
    expect(screen.queryByRole("button", { name: /Add example skills/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Write one here/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Restore from backup/ })).not.toBeInTheDocument();

    // The standard admin table with the standard numbered pager.
    expect(screen.getByRole("button", { name: /Next/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Previous/ })).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: /Add new skill/ })).toBeInTheDocument();
  });

  it("adds a skill from a name and a file, and asks for nothing else", async () => {
    previewSkillMarkdownImport.mockResolvedValue({
      sourceFilename: "SKILL.md",
      sourceHash: "skillhash",
      name: "Browser QA",
      description: "Verify browser workflows.",
      category: "QA",
      riskLevel: "MEDIUM",
      instruction: "Use browser checks.",
      requiredToolMappingsJson: "[]",
      recommendedToolMappingsJson: "[]",
      suggestedEvalFixturesJson: "[]",
      validation: { errors: [], warnings: [], suggestions: [] },
    });
    importSkillMarkdown.mockResolvedValue({ skillId: "skill_new", skillVersionId: "v1", outcome: "CREATED" });
    updateSkill.mockResolvedValue({ skillId: "skill_new" });

    const file = new File(["# Browser QA"], "SKILL.md", { type: "text/markdown" });
    Object.defineProperty(file, "text", { value: vi.fn().mockResolvedValue("# Browser QA") });

    render(<AgentSkillsCatalog />);
    fireEvent.click(screen.getByRole("button", { name: /Add new skill/ }));

    // A skill is a name, a description and a file. There is no parse step, no
    // readiness panel, no risk picker and no publish button.
    expect(screen.queryByRole("button", { name: "Parse file" })).not.toBeInTheDocument();
    expect(screen.queryByText("Production readiness")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Browser QA Review" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Checks the UI." } });
    fireEvent.change(screen.getByLabelText(/Skill file/), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Add skill" }));

    await waitFor(() => {
      expect(importSkillMarkdown).toHaveBeenCalledWith(expect.objectContaining({
        // The name typed here wins over the one in the file's frontmatter.
        name: "Browser QA Review",
        description: "Checks the UI.",
        sourceMarkdown: "# Browser QA",
      }));
    });
    // Added means available: no publish step to forget.
    await waitFor(() => {
      expect(updateSkill).toHaveBeenCalledWith({ skillId: "skill_new", status: "ACTIVE" });
    });
  });

});
