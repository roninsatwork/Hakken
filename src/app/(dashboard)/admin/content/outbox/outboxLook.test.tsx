import { fireEvent, renderWithProviders as render, screen, within } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePaginatedQuery, useQuery } from "convex/react";
import { expectApprovedLook } from "@/src/test/lookOutline";
import { answerQueries } from "@/src/test/siteViewFixtures";
import OutboxAdminPage from "./page";
import OutboxMessagePage from "./[id]/page";

/**
 * Admin → Content → Outbox holds to the look Anthony approved on the
 * "Hakken tasks — the wider assistant" canvas, 2026-10-07
 * (docs/plans/active/outbox-and-preferences-plan.md, C1; design-drift-plan
 * D4): boards OutboxList and OutboxEmail.
 */

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", async () => (await import("@/src/test/screenMocks")).nextNavigation({ id: "outboxMessages_1" }));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => null }));
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

const NEXT_RUN = Date.UTC(2026, 9, 7, 14, 0);
const ROWS = [
  { _id: "outboxMessages_1", messageType: "TASK_ALERT", communication: "HAKKEN_TASKS", email: "jo.hughes@example.co.uk", language: "en", status: "WAITING", attempts: 0, createdAt: Date.UTC(2026, 9, 7, 13, 2), sentAt: null, error: null },
  { _id: "outboxMessages_2", messageType: "SYSTEM_HEALTH", communication: "SYSTEM_HEALTH", email: "ops@example.co.uk", language: "en", status: "SENT", attempts: 1, createdAt: Date.UTC(2026, 9, 7, 9, 0), sentAt: Date.UTC(2026, 9, 7, 10, 0), error: null },
  { _id: "outboxMessages_3", messageType: "WEEKLY_NEWS_DIGEST", communication: "WEEKLY_NEWS_DIGEST", email: "mark.evans@example.co.uk", language: "en", status: "SKIPPED", attempts: 0, createdAt: Date.UTC(2026, 9, 6, 7, 0), sentAt: null, error: "Turned off on their profile." },
];

const MESSAGE = {
  ...ROWS[0],
  dueAt: ROWS[0].createdAt,
  resendId: null,
  queuedBy: { runId: "agentRuns_1", agentId: "agents_1" },
  sentBy: null,
  nextRunAt: NEXT_RUN,
  sentFrom: "Hakken <noreply@example.co.uk>",
  preview: { subject: "7 visitors on Monday: your web design London page", html: "<p>7</p>", text: "7" },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useQuery).mockImplementation(answerQueries({
    "outboxAdmin:getOutboxSummaryForAdmin": { nextRunAt: NEXT_RUN, waiting: 1, moreWaiting: false, sentFrom: "Hakken <noreply@example.co.uk>" },
    "outboxAdmin:getOutboxMessageForAdmin": MESSAGE,
  }));
  vi.mocked(usePaginatedQuery).mockReturnValue({ results: ROWS, status: "Exhausted", isLoading: false, loadMore: vi.fn() } as never);
});

describe("the Outbox's approved look", () => {
  it("every email, its type of communication, search, filters and pages, as drawn", async () => {
    const { container } = render(<OutboxAdminPage />);
    await screen.findByText("jo.hughes@example.co.uk");
    await expectApprovedLook(container, "outbox-and-preferences", "OutboxList", "Outbox");
  });

  it("names each type, says when a waiting email goes and why a skipped one did not", async () => {
    render(<OutboxAdminPage />);
    const rows = (await screen.findAllByRole("row")).slice(1);
    expect(within(rows[0]).getByText("Hakken tasks")).toBeInTheDocument();
    expect(within(rows[0]).getByText(/^At the next run, /)).toBeInTheDocument();
    expect(within(rows[1]).getByText("System health")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Turned off on their profile.")).toBeInTheDocument();
    expect(screen.getByText(/Sent from Hakken <noreply@example\.co\.uk> \(OUTBOX_FROM_EMAIL\)/)).toBeInTheDocument();
  });

  it("asks the server for the type and status chosen, and the address typed", async () => {
    render(<OutboxAdminPage />);
    await screen.findByText("jo.hughes@example.co.uk");
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "HAKKEN_TASKS" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "WAITING" } });
    const asked = vi.mocked(usePaginatedQuery).mock.calls.map((call) => call[1]);
    expect(asked).toContainEqual({ communication: "HAKKEN_TASKS", status: "WAITING" });
  });

  it("one email: its type, when it goes and the address it goes from, as drawn", async () => {
    const { container } = render(<OutboxMessagePage />);
    await screen.findByText("7 visitors on Monday: your web design London page");
    expect(screen.getByText(/^Hakken tasks for jo\.hughes@example\.co\.uk/)).toBeInTheDocument();
    expect(screen.getByText("Hakken <noreply@example.co.uk>")).toBeInTheDocument();
    await expectApprovedLook(container, "outbox-and-preferences", "OutboxEmail", "Outbox: one email");
  });
});
