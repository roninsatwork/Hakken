import React from "react";
import { NextIntlClientProvider } from "next-intl";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders as renderBase } from "@/src/test/renderWithProviders";
import messages from "../../../../../../../messages/en.json";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import AgentSystemPromptPage from "./page";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "agent_1" }),
}));

vi.mock("@/src/app/(dashboard)/admin/_components/AiRuleSafetyWarning", () => ({
  AiRuleSafetyWarningPanel: () => null,
}));

const updateAgent = vi.fn();

function render(ui: React.ReactElement) {
  return renderBase(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe("AgentSystemPromptPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockReturnValue({
      _id: "agent_1",
      name: "Research Agent",
      systemPrompt: "Use verified sources.",
      standingObjective: "Prepare the daily brief.",
    } as unknown as ReturnType<typeof useQuery>);
    updateAgent.mockResolvedValue(undefined);
    vi.mocked(useMutation).mockReturnValue(updateAgent as unknown as ReturnType<typeof useMutation>);
  });

  it("loads the unchanged success feedback after saving", async () => {
    render(<AgentSystemPromptPage />);

    fireEvent.change(screen.getByPlaceholderText(
      "How this agent should behave — its tone, what it must always do, and what it must never do."
    ), {
      target: { value: "Use verified primary sources." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateAgent).toHaveBeenCalledWith({
      id: "agent_1",
      systemPrompt: "Use verified primary sources.",
      standingObjective: "Prepare the daily brief.",
    }));
    expect(await screen.findByText("Instructions saved")).toBeInTheDocument();
  });
});
