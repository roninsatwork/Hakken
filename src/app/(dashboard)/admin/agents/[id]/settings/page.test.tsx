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
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
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
      // The model name is interpolated into the inherit option, so the mock has
      // to carry it through or the test cannot see what the screen names.
      if (values?.model !== undefined) return `${key} ${values.model}`;
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
  snapshotComparison: {
    baselineVersionNumber: 0,
    currentVersionNumber: 1,
    changedAreas: ["Prompt and schemas", "Tools", "Policy"],
    unchangedAreas: ["Model config"],
    details: [
      {
        area: "Prompt and schemas",
        before: "Prompt: Draft support prompt",
        after: "Prompt: Reviewed support prompt",
      },
      {
        area: "Tools",
        before: "knowledge.search",
        after: "knowledge.search | tickets.create",
      },
      {
        area: "Policy",
        before: "internet blocked / manual trigger",
        after: "internet allowed / manual trigger",
      },
    ],
    summary: "3 release areas changed from the previous live snapshot.",
  },
  createdAt: Date.UTC(2026, 5, 16),
  approvedAt: Date.UTC(2026, 5, 16, 11),
};

const models = [
  {
    _id: "model_default",
    modelId: "default-agent-model",
    friendlyName: "Default Agent Model",
    displayName: "Default Agent Model",
    providerKey: "google",
    isEnabled: true,
    isDefault: true,
    supportedUseCases: ["agent"],
    standardInputCostBelow200k: 1.5,
    outputResponseCost: 7.5,
  },
  {
    _id: "model_claude",
    modelId: "alt-agent-model",
    friendlyName: "Alternate Model",
    displayName: "Alternate Model",
    providerKey: "anthropic",
    isEnabled: true,
    isDefault: false,
    supportedUseCases: ["agent"],
    standardInputCostBelow200k: 3,
    outputResponseCost: 15,
  },
];

const inheritedReadiness = {
  status: "PASS",
  source: "useCaseDefault",
  useCase: "agent",
  modelId: "default-agent-model",
  inheritedModelId: "default-agent-model",
};

describe("AgentOverviewPage model selection", () => {
  const mutationMock = vi.fn();
  let agentFixture: unknown;
  let readinessFixture: unknown;

  const renderAgent = (
    agentOverrides: Record<string, unknown>,
    modelReadiness: Record<string, unknown> = inheritedReadiness,
  ) => {
    agentFixture = { ...agent, ...agentOverrides };
    readinessFixture = { ...readiness, modelReadiness };
    render(<AgentOverviewPage />);
  };

  const getModelSelect = () => screen.getByLabelText("sections.engine.model.label") as HTMLSelectElement;

  const saveAndReadAgentUpdate = async () => {
    fireEvent.click(screen.getByRole("button", { name: "sections.identity.saveButton" }));
    await waitFor(() => {
      expect(mutationMock).toHaveBeenCalled();
    });
    // One mock stands in for every mutation on this page, so the agent update is
    // the call carrying the form's own fields.
    const call = mutationMock.mock.calls
      .map(([payload]) => payload as Record<string, unknown>)
      .find((payload) => payload && "name" in payload);
    return call!;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockImplementation((queryFn, args?) => {
      void args;
      const functionName = getFunctionName(queryFn);
      if (functionName === "agents:get") return agentFixture as ReturnType<typeof useQuery>;
      if (functionName === "agents:getAgentReadiness") return readinessFixture as ReturnType<typeof useQuery>;
      if (functionName === "releases:getLatestReleaseForAgent") return null as ReturnType<typeof useQuery>;
      if (functionName === "aiModels:getActiveModels") return models as unknown as ReturnType<typeof useQuery>;
      return undefined as unknown as ReturnType<typeof useQuery>;
    });
    vi.mocked(useMutation).mockReturnValue(mutationMock as unknown as ReturnType<typeof useMutation>);
    mutationMock.mockResolvedValue(undefined);
  });

  /**
   * The fault this guards against.
   *
   * The runtime only applies an agent's own model when its mode is "override",
   * so an agent with no stored mode follows the platform default. This form read
   * that as "override" and filled the model box with whatever the platform
   * default happened to be — then posted both on every save. Opening an older
   * agent, changing its name and pressing Save pinned it to that model for good,
   * silently, and it stopped following the platform default from then on.
   */
  it("follows the platform default when an agent has no stored mode, and saving does not pin it", async () => {
    renderAgent({ modelSelectionMode: undefined });

    expect(getModelSelect().value).toBe("");

    const payload = await saveAndReadAgentUpdate();
    expect(payload.modelSelectionMode).toBe("inherit");
    expect(payload).not.toHaveProperty("modelId");
  });

  it("names the model that following the platform default would use", () => {
    renderAgent({ modelSelectionMode: undefined });

    // The old control greyed the model box out and said nothing about what would
    // run instead, so the choice was made blind.
    expect(
      screen.getByRole("option", { name: /followDefaultNamed Default Agent Model/ })
    ).toBeInTheDocument();
    // And the cost of each alternative is on the option itself.
    expect(screen.getByRole("option", { name: /Alternate Model · \$3\.00 in · \$15\.00 out/ })).toBeInTheDocument();
  });

  it("shows the model an overriding agent is pinned to, and still names the default behind it", () => {
    renderAgent(
      { modelSelectionMode: "override", modelId: "alt-agent-model" },
      { ...inheritedReadiness, source: "override", modelId: "alt-agent-model" },
    );

    expect(getModelSelect().value).toBe("alt-agent-model");
    expect(
      screen.getByRole("option", { name: /followDefaultNamed Default Agent Model/ })
    ).toBeInTheDocument();
  });

  it("saves an override when a model is chosen, and inherit when the default is chosen again", async () => {
    renderAgent({ modelSelectionMode: undefined });

    fireEvent.change(getModelSelect(), { target: { value: "alt-agent-model" } });
    const overridePayload = await saveAndReadAgentUpdate();
    expect(overridePayload.modelSelectionMode).toBe("override");
    expect(overridePayload.modelId).toBe("alt-agent-model");

    mutationMock.mockClear();
    fireEvent.change(getModelSelect(), { target: { value: "" } });
    const inheritPayload = await saveAndReadAgentUpdate();
    expect(inheritPayload.modelSelectionMode).toBe("inherit");
    expect(inheritPayload).not.toHaveProperty("modelId");
  });

  it("says when the model an agent is pinned to cannot run", () => {
    renderAgent(
      { modelSelectionMode: "override", modelId: "alt-agent-model" },
      { ...inheritedReadiness, source: "override", status: "WARN", modelId: "alt-agent-model" },
    );

    // Readiness already knew this. It was computed and never shown beside the
    // choice it is about.
    expect(screen.getByText("sections.engine.model.unusable")).toBeInTheDocument();
  });
});

describe("AgentOverviewPage release visibility", () => {
  const mutationMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockImplementation((queryFn, args?) => {
      void args;
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
    expect(screen.getByText("Snapshot comparison")).toBeInTheDocument();
    expect(screen.getByText("3 release areas changed from the previous live snapshot.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Ship Checks" })).toHaveAttribute("href", "/admin/releases");
  });

  it("expands the full release snapshot field diff", () => {
    render(<AgentOverviewPage />);

    expect(screen.getAllByText("Prompt and schemas").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Tools").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Before: internet blocked/)).not.toBeInTheDocument();
    expect(screen.getByText("Stable fields")).toBeInTheDocument();
    expect(screen.getByText("Model config")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show all 3 fields" }));

    expect(screen.getByText(/Before: internet blocked/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show fewer fields" })).toBeInTheDocument();
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
