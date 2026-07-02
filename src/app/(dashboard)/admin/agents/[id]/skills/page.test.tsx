import type React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import AgentSkillsPage from "./page";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "agent_1" }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const bindingRows = [{
  binding: {
    _id: "binding_risk",
    agentId: "agent_1",
    skillId: "skill_risk",
    skillVersionId: "skill_version_2",
    isEnabled: true,
    assignedBy: "user_1",
    assignedAt: Date.UTC(2026, 5, 18),
    updatedAt: Date.UTC(2026, 5, 18),
  },
  skill: {
    _id: "skill_risk",
    name: "Risk Monitoring",
    description: "Monitor threat signals and escalate material changes.",
    category: "STARTER",
    status: "ACTIVE",
    riskLevel: "HIGH",
    instruction: "Escalate only material risk changes.",
    createdBy: "user_1",
    createdAt: Date.UTC(2026, 5, 18),
    updatedAt: Date.UTC(2026, 5, 18),
  },
  version: {
    _id: "skill_version_2",
    skillId: "skill_risk",
    versionNumber: 2,
    snapshotHash: "hash",
    snapshotJson: "{}",
    instructionHash: "instruction",
    toolRequirementHash: "tools",
    evalHash: "evals",
    createdAt: Date.UTC(2026, 5, 18),
  },
  latestVersion: {
    _id: "skill_version_3",
    skillId: "skill_risk",
    versionNumber: 3,
    snapshotHash: "hash-3",
    snapshotJson: "{}",
    instructionHash: "instruction-3",
    toolRequirementHash: "tools",
    evalHash: "evals",
    createdAt: Date.UTC(2026, 5, 19),
  },
  hasAvailableUpdate: true,
  readiness: {
    requiredToolMappings: ["risk.monitor.feed"],
    recommendedToolMappings: [],
    missingRequiredToolMappings: ["risk.monitor.feed"],
    missingRecommendedToolMappings: [],
  },
  evalCoverage: {
    activeFixtureCount: 1,
    latestRun: {
      runId: "run_1",
      status: "SUCCESS",
      startedAt: Date.UTC(2026, 5, 18),
      completedAt: Date.UTC(2026, 5, 18, 0, 1),
      isCurrent: false,
    },
    latestPassedRun: null,
  },
}];

const activeSkills = [
  bindingRows[0].skill,
  {
    _id: "skill_followup",
    name: "Client Follow-up",
    description: "Draft respectful client follow-up messages.",
    category: "STARTER",
    status: "ACTIVE",
    riskLevel: "LOW",
    instruction: "Use concrete next steps.",
    createdBy: "user_1",
    createdAt: Date.UTC(2026, 5, 18),
    updatedAt: Date.UTC(2026, 5, 18),
  },
];

describe("AgentSkillsPage", () => {
  const bindSkill = vi.fn();
  const upgradeSkillBinding = vi.fn();
  const setBindingEnabled = vi.fn();
  const unbindSkill = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockImplementation((queryFn, args?) => {
      void args;
      const functionName = getFunctionName(queryFn);
      if (functionName === "agentSkills:getForAgent") {
        return bindingRows as unknown as ReturnType<typeof useQuery>;
      }
      if (functionName === "agentSkills:getActiveSkills") {
        return activeSkills as unknown as ReturnType<typeof useQuery>;
      }
      return undefined as unknown as ReturnType<typeof useQuery>;
    });
    vi.mocked(useMutation).mockImplementation((mutationFn) => {
      const functionName = getFunctionName(mutationFn);
      if (functionName === "agentSkills:bindSkillToAgent") return bindSkill as unknown as ReturnType<typeof useMutation>;
      if (functionName === "agentSkills:upgradeSkillBindingToLatest") return upgradeSkillBinding as unknown as ReturnType<typeof useMutation>;
      if (functionName === "agentSkills:setBindingEnabled") return setBindingEnabled as unknown as ReturnType<typeof useMutation>;
      return unbindSkill as unknown as ReturnType<typeof useMutation>;
    });
  });

  it("shows readiness, stale eval coverage, and attach actions", async () => {
    bindSkill.mockResolvedValue({ bindingId: "binding_followup" });
    upgradeSkillBinding.mockResolvedValue({ bindingId: "binding_risk", skillVersionId: "skill_version_3" });
    setBindingEnabled.mockResolvedValue("binding_risk");

    render(<AgentSkillsPage />);

    expect(screen.getByText("Attached Skill Catalog")).toBeInTheDocument();
    expect(screen.getByText("Available")).toBeInTheDocument();
    expect(screen.getByText("Risk Monitoring")).toBeInTheDocument();
    expect(screen.getByText("New skill version available: v3. Review and upgrade this agent when ready.")).toBeInTheDocument();
    expect(screen.getByText("1 required tool mapping(s) are missing.")).toBeInTheDocument();
    expect(screen.getByText("1 skill fixture(s), smoke evidence is stale.")).toBeInTheDocument();
    expect(screen.getByText("risk.monitor.feed")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Update to v3" }));
    await waitFor(() => {
      expect(upgradeSkillBinding).toHaveBeenCalledWith({
        bindingId: "binding_risk",
        seedEvalFixtures: true,
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Disable" }));
    await waitFor(() => {
      expect(setBindingEnabled).toHaveBeenCalledWith({ bindingId: "binding_risk", isEnabled: false });
    });

    fireEvent.click(screen.getByRole("button", { name: "Add from Skill Center" }));
    expect(screen.getByText("Add From Skill Center")).toBeInTheDocument();
    expect(screen.getAllByText("Client Follow-up")).toHaveLength(2);
    expect(screen.getByPlaceholderText("Search active skills")).toBeInTheDocument();
    expect(screen.getByText("Instruction preview")).toBeInTheDocument();
    expect(screen.getByText("Use concrete next steps.")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search active skills"), { target: { value: "follow" } });
    expect(screen.getAllByText("Client Follow-up")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: /Attach selected skill/ }));
    await waitFor(() => {
      expect(bindSkill).toHaveBeenCalledWith({
        agentId: "agent_1",
        skillId: "skill_followup",
        seedEvalFixtures: true,
      });
    });
  });

  it("links to Skill Center when no active central skills are available", () => {
    vi.mocked(useQuery).mockImplementation((queryFn, args?) => {
      void args;
      const functionName = getFunctionName(queryFn);
      if (functionName === "agentSkills:getForAgent") {
        return [] as unknown as ReturnType<typeof useQuery>;
      }
      if (functionName === "agentSkills:getActiveSkills") {
        return [] as unknown as ReturnType<typeof useQuery>;
      }
      return undefined as unknown as ReturnType<typeof useQuery>;
    });

    render(<AgentSkillsPage />);

    fireEvent.click(screen.getAllByRole("button", { name: "Add from Skill Center" })[0]);

    expect(screen.getByText("No unattached active skills are available.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Skill Center" })).toHaveAttribute("href", "/admin/ai/skills");
  });
});
