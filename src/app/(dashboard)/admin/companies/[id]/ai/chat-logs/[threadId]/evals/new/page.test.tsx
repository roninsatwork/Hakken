import React from "react";
import { fireEvent, renderWithProviders as render, screen, waitFor } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { expectStandardFormScreen } from "@/src/test/standardFormScreen";
import NewChatEvalPage from "./page";

/**
 * The screen had no test at all, which is how three of its boxes came to sit
 * under labels that addressed nothing: the kit's wrapper was there, but the
 * plain `<input>` and `<textarea>` inside it were never tied to it. That is
 * invisible on screen and total to anyone using a screen reader.
 */

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "company123", threadId: "thread123" }),
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const thread = {
  _id: "thread123",
  title: "Pricing question",
  companyId: "company123",
  widgetId: undefined,
  createdAt: Date.UTC(2026, 7, 1),
};

const messages = [
  { _id: "message_user", role: "user", content: "How much is the enterprise plan?", createdAt: Date.UTC(2026, 7, 1) },
  { _id: "message_assistant", role: "assistant", content: "It is free.", createdAt: Date.UTC(2026, 7, 1) },
];

describe("NewChatEvalPage", () => {
  const createFromChat = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockImplementation((...args) => {
      const functionName = getFunctionName(args[0]);
      if (functionName === "chatAdmin:getCompanyThreadById") return thread;
      if (functionName === "chatAdmin:getAdminThreadMessages") return messages;
      return undefined;
    });
    vi.mocked(useMutation).mockImplementation((mutationFn) => {
      const functionName = getFunctionName(mutationFn);
      if (functionName === "companyLearningLoop:createEvalCaseFromChat") {
        return createFromChat as unknown as ReturnType<typeof useMutation>;
      }
      return vi.fn() as unknown as ReturnType<typeof useMutation>;
    });
  });

  it("gives every box a label that addresses it", async () => {
    render(<NewChatEvalPage />);

    await screen.findByLabelText("Name");
    expectStandardFormScreen({ minBoxes: 4 });
  });

  it("creates the eval from the answered questions and the typed phrase list", async () => {
    createFromChat.mockResolvedValue({ evalCaseId: "eval_1" });

    render(<NewChatEvalPage />);

    await screen.findByLabelText("Name");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Never says the plan is free" } });
    fireEvent.change(screen.getByLabelText("What would someone ask?"), {
      target: { value: "How much is the enterprise plan?" },
    });
    fireEvent.change(screen.getByLabelText("What does a good answer look like?"), {
      target: { value: "Says pricing is not published." },
    });

    const phraseBox = screen.getByLabelText("Words it must never say");
    fireEvent.change(phraseBox, { target: { value: "enterprise is free" } });
    fireEvent.keyDown(phraseBox, { key: "Enter" });

    fireEvent.click(screen.getByRole("button", { name: "Create eval" }));

    await waitFor(() => {
      expect(createFromChat).toHaveBeenCalledWith(expect.objectContaining({
        companyId: "company123",
        threadId: "thread123",
        name: "Never says the plan is free",
        prompt: "How much is the enterprise plan?",
        expectedBehavior: "Says pricing is not published.",
        forbiddenClaimsJson: JSON.stringify(["enterprise is free"]),
      }));
    });
    expect(push).toHaveBeenCalledWith("/admin/companies/company123/ai/chat-logs");
  });
});
