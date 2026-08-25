import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { renderWithProviders } from "@/src/test/renderWithProviders";
import ChatMemoryCandidateContent from "./ChatMemoryCandidateContent";
import NewChatMemoryCandidatePage from "./page";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

const COMPANY_ID = "company_1234567890" as Id<"companies">;
const THREAD_ID = "thread_1234567890" as Id<"threads">;
const MESSAGE_ID = "message_1234567890" as Id<"messages">;
const RETURN_TO = `/admin/companies/${COMPANY_ID}/ai/chat-logs`;

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: COMPANY_ID, threadId: THREAD_ID }),
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams({
    messageId: MESSAGE_ID,
    returnTo: RETURN_TO,
  }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("NewChatMemoryCandidatePage", () => {
  const createMemoryCandidateMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    createMemoryCandidateMock.mockResolvedValue(null);
    vi.mocked(useMutation).mockReturnValue(createMemoryCandidateMock as unknown as ReturnType<typeof useMutation>);
    vi.mocked(useQuery).mockReturnValue(undefined);
  });

  const showContent = () => renderWithProviders(
    <ChatMemoryCandidateContent
      companyId={COMPANY_ID}
      threadId={THREAD_ID}
      threadTitle="Delivery question"
      isWidgetThread={false}
      selectedMessage={{
        _id: MESSAGE_ID,
        content: "Please do not promise a delivery date in chat.",
        role: "assistant",
      }}
      returnTo={RETURN_TO}
    />,
  );

  it("keeps both queries and the exact loading state immediate", () => {
    const { container } = renderWithProviders(<NewChatMemoryCandidatePage />);

    expect(useQuery).toHaveBeenCalledTimes(2);
    expect(useQuery).toHaveBeenNthCalledWith(1, expect.anything(), {
      companyId: COMPANY_ID,
      threadId: THREAD_ID,
    });
    expect(useQuery).toHaveBeenNthCalledWith(2, expect.anything(), { threadId: THREAD_ID });
    expect(container.querySelector("svg.animate-spin")).not.toBeNull();
  });

  it("opens with the selected conversation content in the form on its first paint", () => {
    showContent();

    expect(screen.getByRole("heading", { name: "Suggest a memory" })).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Delivery question memory");
    expect(screen.getByPlaceholderText(
      "We do not give delivery dates over chat. Ask the customer to email orders@ instead.",
    )).toHaveValue(
      "Please do not promise a delivery date in chat.",
    );
    expect(screen.getByPlaceholderText("Why should this become durable memory?")).toHaveValue(
      `Suggested from chat thread ${THREAD_ID}.`,
    );
    expect(screen.getByText("company chat")).toBeInTheDocument();
  });

  it("submits the same scoped payload and returns to the requested company page", async () => {
    showContent();

    fireEvent.change(screen.getByPlaceholderText(
      "We do not give delivery dates over chat. Ask the customer to email orders@ instead.",
    ), {
      target: { value: "Never promise delivery dates in chat." },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Always/ }));
    fireEvent.click(screen.getByRole("button", { name: "Suggest memory" }));

    await waitFor(() => expect(createMemoryCandidateMock).toHaveBeenCalledWith({
      companyId: COMPANY_ID,
      threadId: THREAD_ID,
      messageId: MESSAGE_ID,
      title: "Delivery question memory",
      content: "Never promise delivery dates in chat.",
      applyMode: "ALWAYS",
      reason: `Suggested from chat thread ${THREAD_ID}.`,
    }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith(RETURN_TO));
  });
});
