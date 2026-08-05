import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import NewAgentPage from "./page";

/**
 * The screen had no test at all, which is how three dead controls survived on it.
 *
 * What is asserted here is that every control reaches the mutation, and that the
 * screen asks for what the settings screen asks for and nothing else — the two
 * faults Anthony found by reading them side by side.
 */

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string, values?: Record<string, string | number>) => {
    const full = `${namespace}.${key}`;
    if (values?.model !== undefined) return `${full} ${values.model}`;
    if (values?.hours !== undefined) return `${full} ${values.hours}`;
    if (values?.value !== undefined) return `${full} ${values.value}`;
    return full;
  },
}));

const models = [
  {
    _id: "model_default",
    modelId: "default-agent-model",
    displayName: "Default Agent Model",
    friendlyName: "Default Agent Model",
    providerKey: "google",
    isEnabled: true,
    isDefault: true,
    supportedUseCases: ["agent"],
    standardInputCostBelow200k: 1.5,
    outputResponseCost: 7.5,
  },
  {
    _id: "model_alt",
    modelId: "alt-agent-model",
    displayName: "Alternate Model",
    friendlyName: "Alternate Model",
    providerKey: "anthropic",
    isEnabled: true,
    isDefault: false,
    supportedUseCases: ["agent"],
    standardInputCostBelow200k: 3,
    outputResponseCost: 15,
  },
];

const SETTINGS = "admin.agents.details.settings.sections";

describe("NewAgentPage", () => {
  const createAgentMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    createAgentMock.mockResolvedValue("agent_new");

    vi.mocked(useQuery).mockImplementation((queryFn, args?) => {
      void args;
      const functionName = getFunctionName(queryFn);
      if (functionName === "aiModels:getActiveModels") {
        return models as unknown as ReturnType<typeof useQuery>;
      }
      if (functionName === "users:getAccountablePeople") {
        return [
          { _id: "user_1", name: "Danette Cole", email: "danette@example.com" },
        ] as unknown as ReturnType<typeof useQuery>;
      }
      if (functionName === "agentRuns:getApprovalExpiryConfig") {
        return { expiryHours: 24, maxHours: 720 } as unknown as ReturnType<typeof useQuery>;
      }
      return undefined as unknown as ReturnType<typeof useQuery>;
    });
    vi.mocked(useMutation).mockReturnValue(createAgentMock as unknown as ReturnType<typeof useMutation>);
  });

  /**
   * A name alone is no longer enough to create an assistant: the register asks
   * what it is for and who answers for it, and the form asks the same.
   */
  const nameIt = () => {
    fireEvent.change(screen.getByLabelText(`${SETTINGS}.identity.name`), {
      target: { value: "Comax - Internet Customer Research Agent" },
    });
    fireEvent.change(screen.getByLabelText(`${SETTINGS}.identity.description`), {
      target: { value: "Fills in missing customer details from public web sources." },
    });
    fireEvent.change(screen.getByLabelText("admin.agents.owner.label"), {
      target: { value: "user_1" },
    });
  };

  const submit = () => fireEvent.click(screen.getByRole("button", { name: "admin.agents.buttons.createDraft" }));

  const readCreateCall = async () => {
    await waitFor(() => expect(createAgentMock).toHaveBeenCalled());
    return createAgentMock.mock.calls[0][0];
  };

  it("sends every behaviour setting the screen offers", async () => {
    render(<NewAgentPage />);

    nameIt();
    fireEvent.click(screen.getByRole("radio", { name: `${SETTINGS}.engine.reasoning.levels.HIGH` }));
    fireEvent.click(screen.getByRole("switch", { name: `${SETTINGS}.engine.internet.label` }));
    submit();

    expect(await readCreateCall()).toMatchObject({
      name: "Comax - Internet Customer Research Agent",
      reasoningEffort: "HIGH",
      allowInternetAccess: true,
      modelSelectionMode: "inherit",
    });
  });

  /**
   * The switch reads as the safe state being on, so leaving it alone must send
   * `autonomousToolExecution: false`. Getting this polarity backwards would ship
   * every new agent able to write without asking.
   */
  it("creates a gated agent when the approval switch is left alone", async () => {
    render(<NewAgentPage />);

    nameIt();
    submit();

    expect(await readCreateCall()).toMatchObject({ autonomousToolExecution: false });
  });

  it("creates an autonomous agent only when the approval switch is turned off", async () => {
    render(<NewAgentPage />);

    nameIt();
    fireEvent.click(screen.getByRole("switch", { name: `${SETTINGS}.engine.approval.label` }));
    submit();

    expect(await readCreateCall()).toMatchObject({ autonomousToolExecution: true });
  });

  it("pins the model only when one is chosen over the platform default", async () => {
    render(<NewAgentPage />);

    nameIt();
    fireEvent.change(screen.getByLabelText(`${SETTINGS}.engine.model.label`), {
      target: { value: "alt-agent-model" },
    });
    submit();

    expect(await readCreateCall()).toMatchObject({
      modelSelectionMode: "override",
      modelId: "alt-agent-model",
    });
  });

  it("sends a cleared budget box as zero, which the server reads as the platform default", async () => {
    render(<NewAgentPage />);

    nameIt();
    fireEvent.change(screen.getByLabelText(`${SETTINGS}.engine.budget.fields.maxSteps`), {
      target: { value: "12" },
    });
    submit();

    expect(await readCreateCall()).toMatchObject({
      maxSteps: 12,
      maxToolCalls: 0,
      maxRuntimeMs: 0,
      maxCostGBP: 0,
    });
  });

  it("asks for what the settings screen asks for, and nothing else", () => {
    render(<NewAgentPage />);

    // The three cards, in the settings screen's order.
    expect(screen.getByText(`${SETTINGS}.identity.title`)).toBeInTheDocument();
    expect(screen.getByText(`${SETTINGS}.engine.groups.behaviour`)).toBeInTheDocument();
    expect(screen.getByText(`${SETTINGS}.engine.groups.limits`)).toBeInTheDocument();

    // Gone: the starting points, and the fields no agent record ever carried.
    expect(screen.queryByText("admin.agents.modal.template")).not.toBeInTheDocument();
    expect(screen.queryByText("admin.agents.builder.objective")).not.toBeInTheDocument();
    expect(screen.queryByText("admin.agents.builder.audience")).not.toBeInTheDocument();
    expect(screen.queryByText("admin.agents.builder.readinessAck")).not.toBeInTheDocument();
  });

  it("will not create an agent without a name", () => {
    render(<NewAgentPage />);

    expect(screen.getByRole("button", { name: "admin.agents.buttons.createDraft" })).toBeDisabled();
    nameIt();
    expect(screen.getByRole("button", { name: "admin.agents.buttons.createDraft" })).toBeEnabled();
  });
});
