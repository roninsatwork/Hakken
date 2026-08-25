import React from "react";
import { NextIntlClientProvider } from "next-intl";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders as renderBase } from "@/src/test/renderWithProviders";
import messages from "../../../../../../messages/en.json";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import SystemPromptPage from "./page";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("@/src/app/(dashboard)/admin/_components/AiRuleSafetyWarning", () => ({
  AiRuleSafetyWarningPanel: () => null,
}));

vi.mock("../_components/AiWorkspaceNav", () => ({
  AiWorkspaceNav: () => null,
}));

const updatePrompt = vi.fn();

function render(ui: React.ReactElement) {
  return renderBase(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SystemPromptPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockReturnValue("Use verified sources." as ReturnType<typeof useQuery>);
    updatePrompt.mockResolvedValue(undefined);
    vi.mocked(useMutation).mockReturnValue(updatePrompt as unknown as ReturnType<typeof useMutation>);
  });

  it("loads the unchanged success feedback after saving", async () => {
    render(<SystemPromptPage />);

    fireEvent.change(screen.getByPlaceholderText("Enter instructions..."), {
      target: { value: "Use verified primary sources." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Instructions" }));

    await waitFor(() => expect(updatePrompt).toHaveBeenCalledWith({
      prompt: "Use verified primary sources.",
    }));
    expect(await screen.findByText("Instructions Saved")).toBeInTheDocument();
  });
});
