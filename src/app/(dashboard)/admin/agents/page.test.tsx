import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import AgentsPage from "./page";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
  usePaginatedQuery: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next/image", () => ({
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (key === "table.followsPlatformDefault") return `Platform default · ${values?.model}`;
    if (key === "table.platformDefaultNotSet") return "Platform default · none set";
    return key;
  },
}));

const activeModels = [
  {
    _id: "model_default",
    modelId: "platform-agent-model",
    friendlyName: "Platform Agent Model",
    displayName: "Platform Agent Model",
    providerKey: "google",
    isEnabled: true,
  },
  {
    _id: "model_pinned",
    modelId: "pinned-agent-model",
    friendlyName: "Pinned Agent Model",
    displayName: "Pinned Agent Model",
    providerKey: "google",
    isEnabled: true,
  },
];

const agents = [
  {
    // The state that made this column lie: a stored model left over from before
    // the agent was set to follow the platform default.
    _id: "agent_inheriting",
    name: "Inheriting Agent",
    description: "Follows the platform default.",
    modelId: "retired-agent-model",
    modelSelectionMode: "inherit",
    isActive: true,
  },
  {
    // Older still — no mode stored at all, which the runtime treats as inherit.
    _id: "agent_unset",
    name: "Older Agent",
    description: "No mode stored.",
    modelId: "retired-agent-model",
    isActive: true,
  },
  {
    _id: "agent_override",
    name: "Pinned Agent",
    description: "Has a model of its own.",
    modelId: "pinned-agent-model",
    modelSelectionMode: "override",
    isActive: true,
  },
];

const inheritedModels = {
  agent: {
    modelId: "platform-agent-model",
    providerKey: "google",
    displayName: "Platform Agent Model",
  },
  workflow: null,
};

describe("AgentsPage model column", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockImplementation((...args: Parameters<typeof useQuery>) => {
      const path = getFunctionName(args[0]);
      if (path === "aiModels:getActiveModels") return activeModels as unknown as ReturnType<typeof useQuery>;
      if (path === "agents:getInheritedAgentModels") return inheritedModels as unknown as ReturnType<typeof useQuery>;
      return [] as unknown as ReturnType<typeof useQuery>;
    });
    vi.mocked(usePaginatedQuery).mockReturnValue({
      results: agents,
      status: "Exhausted",
      loadMore: vi.fn(),
      isLoading: false,
    } as unknown as ReturnType<typeof usePaginatedQuery>);
    vi.mocked(useMutation).mockReturnValue(vi.fn() as unknown as ReturnType<typeof useMutation>);
  });

  /**
   * The fault this guards against.
   *
   * The column printed `agent.modelId` whatever the agent's mode was. The runtime
   * only applies an agent's own model when the mode is "override", so every
   * inheriting agent was listed against a leftover value — naming a model it
   * never runs. On live data that showed the same retired model against every
   * agent in the list.
   */
  it("never shows a stored model for an agent that follows the platform default", () => {
    render(<AgentsPage />);

    expect(screen.queryByText(/retired-agent-model/)).not.toBeInTheDocument();
    expect(screen.getAllByText("Platform default · Platform Agent Model")).toHaveLength(2);
  });

  it("shows its own model for an agent that has one", () => {
    render(<AgentsPage />);

    expect(screen.getByText("Pinned Agent Model")).toBeInTheDocument();
  });

  it("loads the unchanged delete confirmation from the row action", async () => {
    render(<AgentsPage />);

    fireEvent.click(screen.getAllByRole("button", { name: "buttons.delete" })[0]);

    expect(await screen.findByText("modal.deleteConfirm", {}, { timeout: 5_000 })).toBeInTheDocument();
    expect(screen.getByText("modal.undone")).toBeInTheDocument();
  });

});
