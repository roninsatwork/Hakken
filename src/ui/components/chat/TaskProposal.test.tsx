import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { TaskProposal as Proposal } from "@/convex/utils/hakkenTaskProposals";
import { renderWithProviders } from "@/src/test/renderWithProviders";
import { TaskProposal } from "./TaskProposal";

const answer = vi.fn();

vi.mock("convex/react", () => ({ useMutation: () => answer }));
vi.mock("@/convex/_generated/api", () => ({ api: { hakkenTasks: { answerProposal: "answerProposal" } } }));
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());

const messageId = "m1" as Id<"messages">;

const alert: Proposal = {
  action: "CREATE",
  status: "PENDING",
  title: "Tell me if /web-design-london/ gets fewer than 10 visitors a day",
  measure: "visitors",
  target: { companyWebsiteId: "s1" as Id<"companyWebsites">, website: "ronins.co.uk", page: "https://ronins.co.uk/web-design-london/" },
  condition: { op: "below", value: 10, days: 1 },
  timeOfDay: "09:00",
  channels: { bell: true, email: true, telegram: false },
  trial: { tells: 2, of: 28 },
};

beforeEach(() => {
  answer.mockReset();
  answer.mockResolvedValue({ status: "DONE" });
});

/**
 * The proposal under a reply (hakken-tasks-plan.md, item 1.2), as drawn and
 * signed off: the task line by line, then "Yes, start watching" and "Not now".
 */
describe("a task proposed in a reply", () => {
  it("writes the alert out as drawn, and yes answers with the reader's own time zone", async () => {
    renderWithProviders(<TaskProposal messageId={messageId} proposal={alert} />);

    for (const words of ["I’ll watch", "Visitors from Google", "On this page", "/web-design-london/", "If it gets fewer than 10 in a day", "At 9am", "Here in Hakken and by email", "Free"]) {
      expect(screen.getByText(words)).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "Yes, start watching" }));
    await waitFor(() => expect(answer).toHaveBeenCalledWith({ messageId, yes: true, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }));
  });

  it("not now answers no, and an answered proposal shows what happened instead of buttons", async () => {
    const { rerender } = renderWithProviders(<TaskProposal messageId={messageId} proposal={alert} />);
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    await waitFor(() => expect(answer).toHaveBeenCalledWith({ messageId, yes: false }));

    rerender(<TaskProposal messageId={messageId} proposal={{ ...alert, status: "DONE", answeredAt: Date.UTC(2026, 9, 7, 9, 13) }} />);
    expect(screen.queryByRole("button", { name: "Yes, start watching" })).toBeNull();
    expect(screen.getByText(/You’re all set: watching since/)).toBeInTheDocument();
  });

  it("asks before deleting one of their own, with the delete button's words", () => {
    renderWithProviders(<TaskProposal messageId={messageId} proposal={{ action: "DELETE", status: "PENDING", title: "Tell me if ronins.co.uk gets more than 1,000 visitors a day" }} />);
    expect(screen.getByText("Delete “Tell me if ronins.co.uk gets more than 1,000 visitors a day”? Hakken will stop keeping an eye on it.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete task" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep it" })).toBeInTheDocument();
  });

  it("shows nothing to tap when the conversation is only being read back", () => {
    renderWithProviders(<TaskProposal messageId={messageId} proposal={alert} isReadOnly />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("writes out a weekly report: what it sends, from where, on which day, and asks for a yes", () => {
    const report: Proposal = {
      action: "CREATE", status: "PENDING", title: "Every Monday, send me the five pages that lost the most visitors", measure: "visitors",
      target: { companyWebsiteId: "s1" as Id<"companyWebsites">, website: "example.co.uk" },
      report: { look: "pagesChange", direction: "lost", count: 5, every: "week", weekday: 1 },
      timeOfDay: "09:00", channels: { bell: true, email: true, telegram: false },
    };
    renderWithProviders(<TaskProposal messageId={messageId} proposal={report} />);
    expect(screen.getByText("The 5 pages that lost the most visitors from Google")).toBeInTheDocument();
    expect(screen.getByText("Every Monday at 9am")).toBeInTheDocument();
    expect(screen.getByText("example.co.uk")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yes, send it" })).toBeInTheDocument();
  });

  it("offers to find out why, saying with what, where and that it uses credits, for a yes", () => {
    const offer: Proposal = {
      action: "RESEARCH", status: "PENDING", title: "Why did /web-design-london/ lose visitors?",
      research: { question: "Why did /web-design-london/ lose visitors?", website: "example.co.uk" },
    };
    renderWithProviders(<TaskProposal messageId={messageId} proposal={offer} />);
    expect(screen.getByText("Why did /web-design-london/ lose visitors?")).toBeInTheDocument();
    expect(screen.getByText("Here in this conversation, and in the bell")).toBeInTheDocument();
    expect(screen.getByText("From your monthly credits")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yes, find out" })).toBeInTheDocument();
  });
});

