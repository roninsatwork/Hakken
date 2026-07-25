import React from "react";
import { renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import AgentMemoryPage from "./page";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  usePaginatedQuery: vi.fn(),
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

const reviewInbox = {
  totals: {
    open: 2,
    memoryCandidates: 1,
    improvementSuggestions: 1,
    reflections: 0,
    highRisk: 1,
  },
  reviewGuidance: {
    priority: "HIGH",
    label: "High-risk learning requires review",
    detail: "1 high-risk learning item should be reviewed before routine memory approvals.",
    nextAction: "Open High risk mode, inspect source runs, and approve only changes with clear evidence.",
  },
  memoryCandidates: [{
    candidateId: "candidate_1",
    sourceRun: {
      runId: "run_1",
      status: "FAILED",
      triggerType: "WORKFLOW",
      objective: "Prepare escalation summary",
      error: "Missing context",
      startedAt: Date.UTC(2026, 5, 18, 9),
      completedAt: Date.UTC(2026, 5, 18, 9, 1),
      costGBP: 0.02,
    },
    sourceReflectionId: "reflection_1",
    kind: "FACT",
    content: "Escalation summaries should include owner, blocker, and next action.",
    confidence: 0.8,
    riskLevel: "MEDIUM",
    status: "PROPOSED",
    proposedBy: "SYSTEM_REFLECTION",
    sourceSkill: {
      skillId: "skill_escalation",
      name: "Escalation Workflow",
      category: "Operations",
      riskLevel: "MEDIUM",
      skillVersionId: "skill_version_1",
      versionNumber: 1,
      attributionReason: "failed tool overlap: client.escalations.read",
    },
    createdAt: Date.UTC(2026, 5, 18, 9, 2),
  }],
  improvementSuggestions: [{
    suggestionId: "suggestion_1",
    sourceRun: null,
    sourceReflectionId: "reflection_1",
    sourceEvalFixtureId: undefined,
    type: "PROMPT_CHANGE",
    title: "Add escalation summary guidance",
    description: "Teach the agent to include owner, blocker, and next action.",
    riskLevel: "HIGH",
    status: "PROPOSED",
    proposedPatchJson: JSON.stringify({ appendSystemPrompt: "Escalation summaries require owner, blocker, and next action." }),
    patchPreview: [{
      operation: "APPEND",
      target: "Agent system prompt",
      after: "Escalation summaries require owner, blocker, and next action.",
      note: "Adds approved learning guidance to the end of the prompt.",
    }],
    createdAt: Date.UTC(2026, 5, 18, 9, 3),
  }],
  reflections: [],
};

describe("AgentMemoryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePaginatedQuery).mockReturnValue({
      results: [],
      status: "Exhausted",
      loadMore: vi.fn(),
    } as unknown as ReturnType<typeof usePaginatedQuery>);
    vi.mocked(useQuery).mockImplementation((queryFn, args?) => {
      void args;
      const functionName = getFunctionName(queryFn);
      if (functionName === "agentMemories:getQualityForAgent") {
        return [] as unknown as ReturnType<typeof useQuery>;
      }
      if (functionName === "agentMemoryCandidates:getReviewInboxForAgent") {
        return reviewInbox as unknown as ReturnType<typeof useQuery>;
      }
      return undefined as unknown as ReturnType<typeof useQuery>;
    });
    vi.mocked(useMutation).mockReturnValue(vi.fn() as unknown as ReturnType<typeof useMutation>);
  });

  it("renders learning review guidance before inbox actions", () => {
    render(<AgentMemoryPage />);

    expect(screen.getByText("Learning review inbox")).toBeInTheDocument();
    expect(screen.getByText("High-risk learning requires review")).toBeInTheDocument();
    expect(screen.getByText("1 high-risk learning item should be reviewed before routine memory approvals.")).toBeInTheDocument();
    expect(screen.getByText("Open High risk mode, inspect source runs, and approve only changes with clear evidence.")).toBeInTheDocument();
    expect(screen.getByText("Add escalation summary guidance")).toBeInTheDocument();
    expect(screen.getByText("Escalation summaries should include owner, blocker, and next action.")).toBeInTheDocument();
    expect(screen.getByText("Skill attribution")).toBeInTheDocument();
    expect(screen.getByText("Escalation Workflow")).toBeInTheDocument();
    expect(screen.getByText("Operations: failed tool overlap: client.escalations.read")).toBeInTheDocument();
  });
});
