import React from "react";
import { NextIntlClientProvider } from "next-intl";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders as renderBase } from "@/src/test/renderWithProviders";
import messages from "../../../../../../../../messages/en.json";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import CompanySystemPromptPage from "./page";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "company_1" }),
}));

vi.mock("@/src/app/(dashboard)/admin/_components/AiRuleSafetyWarning", () => ({
  AiRuleSafetyWarningPanel: () => null,
}));

const updatePrompt = vi.fn();

function render(ui: React.ReactElement) {
  return renderBase(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("CompanySystemPromptPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockReturnValue({
      _id: "company_1",
      name: "Acme",
      systemPrompt: "Use verified sources.",
    } as unknown as ReturnType<typeof useQuery>);
    updatePrompt.mockResolvedValue(undefined);
    vi.mocked(useMutation).mockReturnValue(updatePrompt as unknown as ReturnType<typeof useMutation>);
  });

  it("loads the unchanged success feedback after saving", async () => {
    render(<CompanySystemPromptPage />);

    const editor = screen.getByPlaceholderText(
      "Initialize the company-specific operating boundaries here... E.g., The primary focus of this workspace is...",
    );
    await waitFor(() => expect(editor).toHaveValue("Use verified sources."));
    fireEvent.change(editor, { target: { value: "Use verified primary sources." } });
    fireEvent.click(screen.getByRole("button", { name: "Save Prompt" }));

    await waitFor(() => expect(updatePrompt).toHaveBeenCalledWith({
      id: "company_1",
      systemPrompt: "Use verified primary sources.",
    }));
    expect(await screen.findByText("Prompt Saved")).toBeInTheDocument();
  });
});
