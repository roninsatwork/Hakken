import React from "react";
import { NextIntlClientProvider } from "next-intl";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders as renderBase } from "@/src/test/renderWithProviders";
import messages from "../../../../../../../messages/en.json";

// The screen resolves its copy through the catalogue, so it renders inside
// the same intl provider the root layout supplies.
function renderWithProviders(ui: React.ReactElement) {
  return renderBase(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import AgentSkillsPage from "./page";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
  usePaginatedQuery: vi.fn(),
}));

/** The picker pages through the database now, so it stubs a paginated result. */
function pickerResult(page: unknown[], status = "Exhausted") {
  return { results: page, status, loadMore: vi.fn(), isLoading: false } as unknown as ReturnType<typeof usePaginatedQuery>;
}

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

const unattachedSkills = [
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
  {
    _id: "skill_research",
    name: "Research Briefing",
    description: "Turn a question into a sourced briefing.",
    category: "STARTER",
    status: "ACTIVE",
    riskLevel: "MEDIUM",
    instruction: "Cite every claim.",
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
      return undefined as unknown as ReturnType<typeof useQuery>;
    });
    // The server excludes already-attached skills, so the stub returns only the
    // unattached one. Returning the attached skill here would test a page the
    // real query can never produce.
    vi.mocked(usePaginatedQuery).mockReturnValue(pickerResult(unattachedSkills));
    vi.mocked(useMutation).mockImplementation((mutationFn) => {
      const functionName = getFunctionName(mutationFn);
      if (functionName === "agentSkills:bindSkillToAgent") return bindSkill as unknown as ReturnType<typeof useMutation>;
      if (functionName === "agentSkills:upgradeSkillBindingToLatest") return upgradeSkillBinding as unknown as ReturnType<typeof useMutation>;
      if (functionName === "agentSkills:setBindingEnabled") return setBindingEnabled as unknown as ReturnType<typeof useMutation>;
      return unbindSkill as unknown as ReturnType<typeof useMutation>;
    });
  });

  it("lists the agent's skills in the standard table and adds a set at once", async () => {
    bindSkill.mockResolvedValue({ bindingId: "binding_followup" });

    renderWithProviders(<AgentSkillsPage />);

    // The row is the skill and when it arrived. Readiness, eval coverage,
    // version numbers and the enable/disable toggle were machinery that a
    // reader could not act on.
    expect(screen.getByText("Risk Monitoring")).toBeInTheDocument();
    expect(screen.queryByText("Attached Skill Catalog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Disable" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Update to v3/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add from Skill Center" }));

    // Tick and add, rather than select-preview-attach one at a time.
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    fireEvent.click(screen.getByRole("button", { name: /Add 2 skills/ }));

    // Both of them, not just the first: the reader ticked a set.
    await waitFor(() => {
      expect(bindSkill).toHaveBeenCalledTimes(2);
    });
    expect(bindSkill).toHaveBeenCalledWith({ agentId: "agent_1", skillId: "skill_followup", seedEvalFixtures: true });
    expect(bindSkill).toHaveBeenCalledWith({ agentId: "agent_1", skillId: "skill_research", seedEvalFixtures: true });
  });

  it("links to Skill Center when no active central skills are available", () => {
    vi.mocked(useQuery).mockImplementation((queryFn, args?) => {
      void args;
      const functionName = getFunctionName(queryFn);
      if (functionName === "agentSkills:getForAgent") {
        return [] as unknown as ReturnType<typeof useQuery>;
      }
      return undefined as unknown as ReturnType<typeof useQuery>;
    });
    vi.mocked(usePaginatedQuery).mockReturnValue(pickerResult([]));

    renderWithProviders(<AgentSkillsPage />);

    fireEvent.click(screen.getAllByRole("button", { name: "Add from Skill Center" })[0]);

    expect(screen.getByText("Every skill in the Skill Center is already attached to this agent.")).toBeInTheDocument();
    // The way out of an empty picker is the Skill Center link in the header.
    expect(screen.getAllByRole("link", { name: /Skill Center/ })[0]).toHaveAttribute("href", "/admin/ai/skills");
  });
});
