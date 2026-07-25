import React from "react";
import { fireEvent, renderWithProviders as render, screen, waitFor } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { AgentSkillDetail } from "./page";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "skill_risk" }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const detail = {
  skill: {
    _id: "skill_risk",
    name: "Risk Monitoring",
    description: "Monitor threat signals.",
    category: "STARTER",
    status: "ACTIVE",
    riskLevel: "HIGH",
    instruction: "Escalate material changes.",
    requiredToolMappingsJson: JSON.stringify(["risk.monitor.feed"]),
    recommendedToolMappingsJson: "[]",
    suggestedEvalFixturesJson: JSON.stringify([{ objective: "one" }, { objective: "two" }]),
    sourceFilename: "risk-monitoring.SKILL.md",
    sourceHash: "hash-1",
    sourceMarkdown: "# Risk Monitoring",
    createdBy: "user_1",
    createdAt: Date.UTC(2026, 5, 18),
    updatedAt: Date.UTC(2026, 5, 18),
  },
  latestVersion: {
    _id: "skill_version_2",
    skillId: "skill_risk",
    versionNumber: 2,
    snapshotHash: "snapshot-2",
    snapshotJson: "{}",
    instructionHash: "instruction",
    toolRequirementHash: "tools",
    evalHash: "evals",
    createdAt: Date.UTC(2026, 5, 19),
  },
  readiness: {
    requiredToolMappings: ["risk.monitor.feed"],
    recommendedToolMappings: [],
    missingRequiredToolMappings: [],
    missingRecommendedToolMappings: [],
  },
};

const rolloutBindings = [{
  binding: {
    _id: "binding_1",
    agentId: "agent_1",
    skillId: "skill_risk",
    skillVersionId: "skill_version_1",
    isEnabled: true,
    assignedBy: "user_1",
    assignedAt: Date.UTC(2026, 5, 18),
    updatedAt: Date.UTC(2026, 5, 18),
  },
  agent: {
    _id: "agent_1",
    name: "Risk Agent",
    isActive: true,
  },
  version: {
    _id: "skill_version_1",
    skillId: "skill_risk",
    versionNumber: 1,
    snapshotHash: "snapshot-1",
    snapshotJson: "{}",
    instructionHash: "instruction",
    toolRequirementHash: "tools",
    evalHash: "evals",
    createdAt: Date.UTC(2026, 5, 18),
  },
  latestVersion: detail.latestVersion,
  hasAvailableUpdate: true,
  evalCoverage: {
    activeFixtureCount: 2,
    latestRun: {
      runId: "run_old",
      status: "SUCCESS",
      startedAt: Date.UTC(2026, 5, 18),
      completedAt: Date.UTC(2026, 5, 18, 0, 1),
      isCurrent: true,
    },
    latestPassedRun: {
      runId: "run_old",
      startedAt: Date.UTC(2026, 5, 18),
      completedAt: Date.UTC(2026, 5, 18, 0, 1),
      isCurrent: true,
    },
  },
}, {
  binding: {
    _id: "binding_2",
    agentId: "agent_2",
    skillId: "skill_risk",
    skillVersionId: "skill_version_2",
    isEnabled: true,
    assignedBy: "user_1",
    assignedAt: Date.UTC(2026, 5, 19),
    updatedAt: Date.UTC(2026, 5, 19),
  },
  agent: {
    _id: "agent_2",
    name: "Updated Risk Agent",
    isActive: false,
  },
  version: detail.latestVersion,
  latestVersion: detail.latestVersion,
  hasAvailableUpdate: false,
  evalCoverage: {
    activeFixtureCount: 2,
    latestRun: null,
    latestPassedRun: null,
  },
}];

const learningAnalytics = {
  totals: {
    suggestions: 2,
    openSuggestions: 1,
    appliedSuggestions: 1,
    rejectedSuggestions: 0,
    memoryCandidates: 2,
    openMemoryCandidates: 1,
    appliedMemoryCandidates: 0,
    rejectedMemoryCandidates: 1,
    highRiskOpenItems: 1,
  },
  suggestionStatusCounts: {
    PROPOSED: 1,
    APPROVED: 0,
    REJECTED: 0,
    APPLIED: 1,
  },
  candidateStatusCounts: {
    PROPOSED: 1,
    APPROVED: 0,
    REJECTED: 1,
    APPLIED: 0,
  },
  recentLearning: [{
    kind: "suggestion",
    id: "suggestion_1",
    status: "PROPOSED",
    riskLevel: "HIGH",
    label: "SKILL_INSTRUCTION_CHANGE",
    title: "Review shared skill guidance: Risk Monitoring",
    summary: "Add confidence thresholds before escalating material risk.",
    createdAt: Date.UTC(2026, 5, 20),
  }, {
    kind: "memory",
    id: "candidate_1",
    status: "REJECTED",
    riskLevel: "MEDIUM",
    label: "FACT",
    title: "fact memory candidate",
    summary: "Risk updates should include source credibility.",
    createdAt: Date.UTC(2026, 5, 19),
  }],
};

const exportBundle = {
  filename: "risk-monitoring-bundle.json",
  bundleJson: JSON.stringify({
    format: "sonae.agentSkillBundle.v1",
    skill: { name: "Risk Monitoring" },
  }, null, 2),
  bundle: {
    format: "sonae.agentSkillBundle.v1",
  },
};

describe("AgentSkillDetailPage rollout review", () => {
  const updateSkill = vi.fn();
  const cloneSkill = vi.fn();
  const archiveSkill = vi.fn();
  const upgradeSkillBindings = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockImplementation((queryFn, args?) => {
      void args;
      const functionName = getFunctionName(queryFn);
      if (functionName === "agentSkills:getSkill") return detail as unknown as ReturnType<typeof useQuery>;
      if (functionName === "agentSkills:getBindingsForSkill") return rolloutBindings as unknown as ReturnType<typeof useQuery>;
      if (functionName === "agentSkills:getSkillLearningAnalytics") return learningAnalytics as unknown as ReturnType<typeof useQuery>;
      if (functionName === "agentSkills:exportSkillBundle") return exportBundle as unknown as ReturnType<typeof useQuery>;
      return undefined as unknown as ReturnType<typeof useQuery>;
    });
    vi.mocked(useMutation).mockImplementation((mutationFn) => {
      const functionName = getFunctionName(mutationFn);
      if (functionName === "agentSkills:updateSkill") return updateSkill as unknown as ReturnType<typeof useMutation>;
      if (functionName === "agentSkills:cloneSkill") return cloneSkill as unknown as ReturnType<typeof useMutation>;
      if (functionName === "agentSkills:archiveSkill") return archiveSkill as unknown as ReturnType<typeof useMutation>;
      return upgradeSkillBindings as unknown as ReturnType<typeof useMutation>;
    });
  });

  it("shows pinned agents and can bulk upgrade outdated bindings", async () => {
    upgradeSkillBindings.mockResolvedValue({ upgradedCount: 1, skillVersionId: "skill_version_2" });

    render(<AgentSkillDetail />);

    expect(screen.getByText("Agent rollout")).toBeInTheDocument();
    expect(screen.getByText("1 update")).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getByText("Validated")).toBeInTheDocument();
    expect(screen.getByText("Needs smoke")).toBeInTheDocument();
    expect(screen.getByText("Risk Agent")).toBeInTheDocument();
    expect(screen.getByText("active · current v1 · latest v2")).toBeInTheDocument();
    expect(screen.getByText("Updated Risk Agent")).toBeInTheDocument();
    expect(screen.getByText("draft · current v2 · latest v2")).toBeInTheDocument();
    expect(screen.getByText("Current skill version has not been smoke tested on this agent yet.")).toBeInTheDocument();
    expect(screen.getByText("Learning outcomes")).toBeInTheDocument();
    expect(screen.getByText("1 high-risk learning item still needs review.")).toBeInTheDocument();
    expect(screen.getByText("Review shared skill guidance: Risk Monitoring")).toBeInTheDocument();
    expect(screen.getByText("Risk updates should include source credibility.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Update all outdated agents/ }));

    await waitFor(() => {
      expect(upgradeSkillBindings).toHaveBeenCalledWith({
        skillId: "skill_risk",
        seedEvalFixtures: true,
      });
    });
    expect(await screen.findByText("1 agent updated to the latest skill version.")).toBeInTheDocument();
  });

  it("reads as a document rather than a form, and publishing is the only edit", async () => {
    updateSkill.mockResolvedValue({ skillId: "skill_risk", skillVersionId: "skill_version_3" });
    archiveSkill.mockResolvedValue({ skillId: "skill_risk" });

    render(<AgentSkillDetail />);

    // The uploaded file itself is the content. Anthony's question on first
    // seeing this page was "I don't see the MD file", and he was right: a
    // prettified breakdown of the file's parsed fields is a second rendering of
    // something he wrote and would recognise.
    expect(await screen.findByText("# Risk Monitoring")).toBeInTheDocument();
    expect(screen.getByText("risk-monitoring.SKILL.md")).toBeInTheDocument();
    expect(screen.queryByLabelText("Skill instruction")).not.toBeInTheDocument();

    // The five JSON boxes are gone. This is the whole point of the change: a
    // reader who does not write software could not use them, and a stray comma
    // failed silently.
    expect(screen.queryByLabelText("Required tool mappings")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Recommended knowledge JSON")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Default rules JSON")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Suggested eval fixtures JSON")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Save skill/ })).not.toBeInTheDocument();

    // What the file cannot tell you stays beside it: whether the tools it needs
    // actually exist here, and who is using it.
    expect(screen.getAllByText("risk.monitor.feed").length).toBeGreaterThan(0);
    expect(screen.getByText("Required tools are available.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Upload new version/ })).toHaveAttribute("href", "/admin/ai/skills?import=1");

    // Publishing is an operational decision the file cannot carry, so it stays.
    fireEvent.click(screen.getByRole("button", { name: /Return to draft/ }));
    await waitFor(() => {
      expect(updateSkill).toHaveBeenCalledWith({ skillId: "skill_risk", status: "DRAFT" });
    });

    fireEvent.click(screen.getByRole("button", { name: /Archive/ }));
    await waitFor(() => {
      expect(archiveSkill).toHaveBeenCalledWith({ skillId: "skill_risk" });
    });
  });

  it("clones the skill as a draft from the detail page", async () => {
    cloneSkill.mockResolvedValue({ skillId: "skill_clone", skillVersionId: "skill_clone_version_1" });

    render(<AgentSkillDetail />);

    fireEvent.click(screen.getByRole("button", { name: /Clone/ }));

    await waitFor(() => {
      expect(cloneSkill).toHaveBeenCalledWith({ skillId: "skill_risk" });
    });
    expect(await screen.findByText("Skill cloned as a draft. Review it before attaching agents.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open clone" })).toHaveAttribute("href", "/admin/ai/skills/skill_clone");
  });

  it("keeps detail navigation inside a custom base path", async () => {
    render(<AgentSkillDetail basePath="/admin/ai/skills" />);

    expect(await screen.findByRole("link", { name: /Back to skills/ })).toHaveAttribute("href", "/admin/ai/skills");
  });

  it("downloads the exported skill bundle", () => {
    const createObjectURL = vi.fn(() => "blob:skill-bundle");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    render(<AgentSkillDetail />);

    fireEvent.click(screen.getByRole("button", { name: /Export/ }));

    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:skill-bundle");
    click.mockRestore();
    vi.unstubAllGlobals();
  });
});
