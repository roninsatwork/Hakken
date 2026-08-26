import React from "react";
import { render as renderBare, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import AgentOverviewPage from "./page";

import { ToastProvider } from "@/src/context/ToastContext";

// The screen reports failures through the house action runner, which reads
// the toast context the root layout always supplies.
const render = (ui: Parameters<typeof renderBare>[0]) => renderBare(ui, { wrapper: ToastProvider });

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

describe("AgentOverviewPage approval and run budget", () => {
  const mutationMock = vi.fn();
  let agentFixture: unknown;

  const renderAgent = (agentOverrides: Record<string, unknown> = {}) => {
    agentFixture = { ...agent, ...agentOverrides };
    render(<AgentOverviewPage />);
  };

  const save = async () => {
    fireEvent.click(screen.getByRole("button", { name: "sections.identity.saveButton" }));
    await waitFor(() => {
      expect(mutationMock).toHaveBeenCalled();
    });
    return mutationMock.mock.calls
      .map(([payload]) => payload as Record<string, unknown>)
      .find((payload) => payload && "name" in payload)!;
  };

  const limitInput = (field: string) =>
    screen.getByLabelText(`sections.engine.budget.fields.${field}`) as HTMLInputElement;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockImplementation((queryFn, args?) => {
      void args;
      const functionName = getFunctionName(queryFn);
      if (functionName === "agents:get") return agentFixture as ReturnType<typeof useQuery>;
      if (functionName === "agents:getAgentReadiness") {
        return { ...readiness, modelReadiness: inheritedReadiness } as ReturnType<typeof useQuery>;
      }
      if (functionName === "aiModels:getActiveModels") return models as unknown as ReturnType<typeof useQuery>;
      return undefined as unknown as ReturnType<typeof useQuery>;
    });
    vi.mocked(useMutation).mockReturnValue(mutationMock as unknown as ReturnType<typeof useMutation>);
    mutationMock.mockResolvedValue(undefined);
  });

  /**
   * The polarity guard, on screen.
   *
   * `humanApprovalRequired` is written false on every agent at creation, so if
   * autonomy were ever read from a field that defaults to false, every agent on
   * the platform would render as autonomous and save as autonomous. Absent has to
   * read as approval required.
   */
  it("shows approval as required for an agent with no autonomy setting, and saves it that way", async () => {
    renderAgent({ autonomousToolExecution: undefined });

    expect(screen.getByText("sections.engine.approval.hintRequired")).toBeInTheDocument();

    const payload = await save();
    expect(payload.autonomousToolExecution).toBe(false);
  });

  it("saves autonomy when the agent is switched to run autonomously", async () => {
    renderAgent();

    fireEvent.click(screen.getByRole("switch", { name: "sections.engine.approval.label" }));
    // The consequence is spelled out where the choice is made, not left implied.
    expect(screen.getByText("sections.engine.approval.hintAutonomous")).toBeInTheDocument();

    const payload = await save();
    expect(payload.autonomousToolExecution).toBe(true);
  });

  it("keeps an already-autonomous agent autonomous when an unrelated field is saved", async () => {
    renderAgent({ autonomousToolExecution: true });

    expect(screen.getByText("sections.engine.approval.hintAutonomous")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("sections.engine.model.label"), {
      target: { value: "alt-agent-model" },
    });
    const payload = await save();
    expect(payload.autonomousToolExecution).toBe(true);
  });

  it("leaves the budget boxes empty when an agent has no overrides, and sends zero to mean inherit", async () => {
    renderAgent();

    expect(limitInput("maxSteps").value).toBe("");
    expect(limitInput("maxCostGBP").value).toBe("");
    // The placeholder names what a blank box will actually do.
    expect(limitInput("maxSteps").placeholder).toBe("25");
    expect(limitInput("maxCostGBP").placeholder).toBe("10");

    const payload = await save();
    // Zero rather than omitted: an omitted argument means "leave the stored value
    // alone", so a cleared box could never restore the platform default.
    expect(payload.maxSteps).toBe(0);
    expect(payload.maxToolCalls).toBe(0);
    expect(payload.maxRuntimeMs).toBe(0);
    expect(payload.maxCostGBP).toBe(0);
  });

  it("shows stored overrides, runtime in minutes, and saves runtime back in milliseconds", async () => {
    renderAgent({ maxSteps: 20, maxToolCalls: 15, maxRuntimeMs: 6 * 60 * 1000, maxCostGBP: 2.5 });

    expect(limitInput("maxSteps").value).toBe("20");
    expect(limitInput("maxToolCalls").value).toBe("15");
    // Minutes on screen. Asking an operator to type 360000 would be hostile.
    expect(limitInput("maxRuntimeMinutes").value).toBe("6");
    expect(limitInput("maxCostGBP").value).toBe("2.5");

    const payload = await save();
    expect(payload.maxSteps).toBe(20);
    expect(payload.maxRuntimeMs).toBe(6 * 60 * 1000);
    // A sub-pound budget survives as a decimal rather than being floored to zero.
    expect(payload.maxCostGBP).toBe(2.5);
  });

  it("sends a cleared box as zero so the platform default comes back", async () => {
    renderAgent({ maxSteps: 20, maxCostGBP: 2.5 });

    fireEvent.change(limitInput("maxSteps"), { target: { value: "" } });
    fireEvent.change(limitInput("maxCostGBP"), { target: { value: "0.5" } });

    const payload = await save();
    expect(payload.maxSteps).toBe(0);
    expect(payload.maxCostGBP).toBe(0.5);
  });


});

/**
 * The screen this replaces was a checklist of eight boxes at the foot of the
 * page, drawn whether or not anything was wrong. Six of the eight could never
 * stop an activation, so most of what it reported was not a problem — the same
 * fault the company AI screen was rebuilt to remove. What is left is one
 * sentence, at the one moment it applies.
 */
describe("AgentOverviewPage activation", () => {
  const mutationMock = vi.fn();
  let readinessFixture: unknown;

  const renderDraft = (activationWarnings: string[]) => {
    readinessFixture = { ...readiness, modelReadiness: inheritedReadiness, activationWarnings };
    render(<AgentOverviewPage />);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockImplementation((queryFn, args?) => {
      void args;
      const functionName = getFunctionName(queryFn);
      if (functionName === "agents:get") return { ...agent, isActive: false } as unknown as ReturnType<typeof useQuery>;
      if (functionName === "agents:getAgentReadiness") return readinessFixture as ReturnType<typeof useQuery>;
      if (functionName === "aiModels:getActiveModels") return models as unknown as ReturnType<typeof useQuery>;
      return undefined as unknown as ReturnType<typeof useQuery>;
    });
    vi.mocked(useMutation).mockReturnValue(mutationMock as unknown as ReturnType<typeof useMutation>);
    mutationMock.mockResolvedValue(undefined);
  });

  it("says nothing about readiness while the agent is left as a draft", () => {
    renderDraft(["smokeEval"]);

    expect(screen.queryByText(/unprovenReason/)).not.toBeInTheDocument();
  });

  it("names what has not been proven when a draft is switched on, and links to where it is settled", () => {
    renderDraft(["smokeEval"]);

    fireEvent.click(screen.getByRole("switch", { name: "Draft" }));

    expect(screen.getByText("sections.engine.status.unprovenReason.smokeEval")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /unprovenLink/ })).toHaveAttribute(
      "href",
      "/admin/agents/agent_1/evals",
    );
  });

  /**
   * The warning is a warning.
   *
   * It used to refuse the save outright. Anthony, 2026-08-01: *"i dotn want eval
   * checks on agent to be blocker before goign live."* So the sentence is still
   * shown, and the agent still goes live.
   */
  it("saves the agent as active even while the warning stands", async () => {
    renderDraft(["smokeEval"]);

    fireEvent.click(screen.getByRole("switch", { name: "Draft" }));
    expect(screen.getByText("sections.engine.status.unprovenReason.smokeEval")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "sections.identity.saveButton" }));

    await waitFor(() => expect(mutationMock).toHaveBeenCalled());
    const call = mutationMock.mock.calls
      .map(([args]) => args as Record<string, unknown>)
      .find((args) => "isActive" in args);
    expect(call).toMatchObject({ isActive: true });
  });

  it("does not warn about tools or knowledge that are simply absent", () => {
    // The server no longer counts absence as a fault, so an agent that
    // deliberately has neither has nothing standing in its way.
    renderDraft([]);

    fireEvent.click(screen.getByRole("switch", { name: "Draft" }));

    expect(screen.queryByText(/unprovenReason/)).not.toBeInTheDocument();
  });
});
