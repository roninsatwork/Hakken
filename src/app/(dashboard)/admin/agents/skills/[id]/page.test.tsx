import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import AgentSkillDetailPage from "./page";

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
    suggestedEvalFixturesJson: "[]",
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

    render(<AgentSkillDetailPage />);

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

  it("saves edited skill settings and archives the skill", async () => {
    updateSkill.mockResolvedValue({ skillId: "skill_risk", skillVersionId: "skill_version_3" });
    archiveSkill.mockResolvedValue({ skillId: "skill_risk" });

    render(<AgentSkillDetailPage />);

    await screen.findByDisplayValue("Risk Monitoring");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Risk Monitoring Plus" } });
    fireEvent.change(screen.getByLabelText("Risk"), { target: { value: "MEDIUM" } });
    fireEvent.change(screen.getByLabelText("Skill instruction"), { target: { value: "Escalate material changes and cite source confidence." } });
    fireEvent.click(screen.getByRole("button", { name: /Save skill/ }));

    await waitFor(() => {
      expect(updateSkill).toHaveBeenCalledWith(expect.objectContaining({
        skillId: "skill_risk",
        name: "Risk Monitoring Plus",
        description: "Monitor threat signals.",
        category: "STARTER",
        status: "ACTIVE",
        riskLevel: "MEDIUM",
        instruction: "Escalate material changes and cite source confidence.",
        requiredToolMappingsJson: "[\n  \"risk.monitor.feed\"\n]",
        recommendedToolMappingsJson: "[]",
        suggestedEvalFixturesJson: "[]",
      }));
    });
    expect(await screen.findByText("Skill saved and version snapshot refreshed.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Archive/ }));

    await waitFor(() => {
      expect(archiveSkill).toHaveBeenCalledWith({ skillId: "skill_risk" });
    });
    expect(await screen.findByText("Skill archived. Existing historical bindings remain auditable.")).toBeInTheDocument();
  });

  it("clones the skill as a draft from the detail page", async () => {
    cloneSkill.mockResolvedValue({ skillId: "skill_clone", skillVersionId: "skill_clone_version_1" });

    render(<AgentSkillDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: /Clone/ }));

    await waitFor(() => {
      expect(cloneSkill).toHaveBeenCalledWith({ skillId: "skill_risk" });
    });
    expect(await screen.findByText("Skill cloned as a draft. Review it before attaching agents.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open clone" })).toHaveAttribute("href", "/admin/agents/skills/skill_clone");
  });

  it("downloads the exported skill bundle", () => {
    const createObjectURL = vi.fn(() => "blob:skill-bundle");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    render(<AgentSkillDetailPage />);

    fireEvent.click(screen.getByRole("button", { name: /Export/ }));

    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:skill-bundle");
    click.mockRestore();
    vi.unstubAllGlobals();
  });
});
