import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import AgentOverviewPage from "./page";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "agent_1" }),
}));

vi.mock("next/image", () => ({
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => <img alt={alt} {...props} />,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => {
    return (key: string, values?: Record<string, string | number>) => {
      if (key.endsWith(".title")) return key.split(".").at(-2) || key;
      if (key.includes("status.active")) return "Active";
      if (key.includes("status.inactive")) return "Draft";
      if (key.includes("loading")) return "Loading...";
      if (values?.count !== undefined) return `${key} ${values.count}`;
      return key;
    };
  },
}));

const agent = {
  _id: "agent_1",
  name: "Support Triage Agent",
  description: "Handles support triage.",
  avatar: "",
  modelId: "default-agent-model",
  modelSelectionMode: "inherit",
  thinkingMode: false,
  reasoningEffort: "MEDIUM",
  allowInternetAccess: false,
  isActive: false,
  createdAt: Date.UTC(2026, 5, 16),
  updatedAt: Date.UTC(2026, 5, 16),
};

const readiness = {
  activationWarnings: [],
  successfulSmokeEvalRunCount: 1,
  latestSmokeEvalRun: {
    runId: "run_1",
    objective: "Smoke eval: Support answer",
    status: "SUCCESS",
    completedAt: Date.UTC(2026, 5, 16, 10),
    finalOutput: "Smoke eval passed.",
  },
  releaseGatePolicy: {
    blockedCriticalFixtureCount: 0,
    warning: undefined,
  },
  fixtureCoverage: [],
  checks: [],
  activeEvalFixtureCount: 1,
};

const latestRelease = {
  _id: "release_1",
  agentId: "agent_1",
  agentVersionId: "version_1",
  status: "APPROVED",
  title: "Support Triage Agent v1",
  releaseNotes: "Ready after release gate coverage.",
  rollbackPlan: "Deactivate and review recent runs.",
  versionNumber: 1,
  createdAt: Date.UTC(2026, 5, 16),
  approvedAt: Date.UTC(2026, 5, 16, 11),
};

describe("AgentOverviewPage release visibility", () => {
  const mutationMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockImplementation((queryFn, _args?) => {
      const functionName = getFunctionName(queryFn);
      if (functionName === "agents:get") return agent as unknown as ReturnType<typeof useQuery>;
      if (functionName === "agents:getAgentReadiness") return readiness as unknown as ReturnType<typeof useQuery>;
      if (functionName === "releases:getLatestReleaseForAgent") return latestRelease as unknown as ReturnType<typeof useQuery>;
      if (functionName === "aiModels:getActiveModels") return [] as unknown as ReturnType<typeof useQuery>;
      return undefined as unknown as ReturnType<typeof useQuery>;
    });
    vi.mocked(useMutation).mockReturnValue(mutationMock as unknown as ReturnType<typeof useMutation>);
  });

  it("shows the latest release state on the agent settings page", () => {
    render(<AgentOverviewPage />);

    expect(screen.getByText("Release Status")).toBeInTheDocument();
    expect(screen.getByText("Support Triage Agent v1 · v1")).toBeInTheDocument();
    expect(screen.getByText("Ready after release gate coverage.")).toBeInTheDocument();
    expect(screen.getByText("APPROVED")).toBeInTheDocument();
    expect(screen.getByText("Activate release")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Ship Checks" })).toHaveAttribute("href", "/admin/releases");
  });

  it("can activate an approved release from agent settings", async () => {
    mutationMock.mockResolvedValue("release_1");
    render(<AgentOverviewPage />);

    fireEvent.click(screen.getByText("Activate release"));

    await waitFor(() => {
      expect(mutationMock).toHaveBeenCalledWith({ releaseId: "release_1" });
    });
    expect(await screen.findByText("Release activated.")).toBeInTheDocument();
  });
});
