import React from "react";
import { NextIntlClientProvider } from "next-intl";
import { fireEvent, render as renderBase, screen, waitFor, within } from "@testing-library/react";
import messages from "../../../../../../../messages/en.json";

// The screen resolves its copy through the catalogue, so it renders inside
// the same intl provider the root layout supplies.
function render(ui: React.ReactElement) {
  return renderBase(ui, {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <NextIntlClientProvider locale="en" messages={messages}>
        {children}
      </NextIntlClientProvider>
    ),
  });
}
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import AgentLogsDashboard from "./page";

vi.mock("convex/react", () => ({ useQuery: vi.fn() }));
vi.mock("next/dynamic", async () => {
  const { AgentLogsResults } = await import("./AgentLogsResults");
  return { default: () => AgentLogsResults };
});

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "agent_1" }),
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/src/hooks/useDebounce", () => ({ default: (value: unknown) => value }));

const START = Date.now() - 600_000;

type EntryFixture = {
  _id: string;
  interactionType: string;
  promptContent: string;
  responseContent: string;
  outcome?: string;
  durationMs?: number;
  failureKey?: string;
  createdAt: number;
};

function entry(overrides: Partial<EntryFixture> & { _id: string }): EntryFixture {
  return {
    interactionType: "LLM SYNTHESIS",
    promptContent: "Find three-bed listings in Bristol",
    responseContent: "I will search Bristol.",
    outcome: "SUCCESS",
    createdAt: START,
    ...overrides,
  };
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    groups: [
      {
        runId: "run_1",
        startedAt: START,
        lastAt: START + 31_400,
        job: {
          objective: "Find new three-bed listings in Bristol under £400k",
          status: "FAILED",
          startedAt: START,
          completedAt: START + 31_400,
          costGBP: 0.021,
          triggerType: "SCHEDULE",
        },
        entries: [
          entry({ _id: "e1" }),
          entry({
            _id: "e2",
            interactionType: "TOOL DISPATCH: property_search",
            responseContent: "The property search timed out after 24000ms",
            outcome: "FAILED",
            durationMs: 23_900,
            failureKey: "the property search timed out",
            createdAt: START + 31_400,
          }),
        ],
      },
    ],
    totalGroups: 1,
    totalPages: 1,
    failureCounts: { "the property search timed out": 42 },
    windowTruncated: false,
    ...overrides,
  };
}

describe("AgentLogsDashboard", () => {
  let dataFixture: unknown;

  const renderPage = () => render(<AgentLogsDashboard />);

  beforeEach(() => {
    vi.clearAllMocks();
    dataFixture = payload();

    vi.mocked(useQuery).mockImplementation((queryFn, args?) => {
      void args;
      const name = getFunctionName(queryFn);
      if (name === "agentLogs:getJobGroups") return dataFixture as ReturnType<typeof useQuery>;
      return undefined as unknown as ReturnType<typeof useQuery>;
    });
  });

  /**
   * The old screen was a flat list of entries in time order, interleaved across
   * jobs — a chain of work shown as unrelated rows.
   */
  it("gathers entries under the job they belonged to", async () => {
    renderPage();

    expect(await screen.findByText("Find new three-bed listings in Bristol under £400k")).toBeInTheDocument();
    expect(screen.getByText(/2 entries/)).toBeInTheDocument();
  });

  it("puts the job's real outcome, duration and cost on its header", async () => {
    renderPage();

    // The header line carries all three, so asserting it together also proves
    // they belong to the job rather than to one of its entries.
    const header = await screen.findByText(/Scheduled ·/);
    expect(header).toHaveTextContent("31.4s");
    expect(header).toHaveTextContent("$0.021");

    // The job's own status pill. Its entries carry their outcomes separately.
    expect(screen.getAllByText("Failed")).toHaveLength(1);
  });

  it("reports each entry's recorded outcome rather than reading its name", async () => {
    renderPage();

    // "TOOL DISPATCH" contains neither "error" nor "fail": under the old screen
    // this entry showed a green tick. Now the row says what was recorded, and
    // is chipped as a problem alongside it.
    expect(await screen.findByText(/Used property search/)).toBeInTheDocument();
    expect(screen.getAllByText("worked")).toHaveLength(1);
    expect(screen.getAllByText("failed")).toHaveLength(1);
    expect(screen.getAllByText("Problem")).toHaveLength(1);
  });

  it("says what each entry was about, not only what kind of entry it was", async () => {
    renderPage();

    // Without this every property search on the page reads identically and the
    // only way to find the one that matters is to open all of them.
    expect(
      (await screen.findAllByText(/— Find three-bed listings in Bristol/)).length
    ).toBeGreaterThan(0);
  });

  it("translates entries out of the runtime's vocabulary", async () => {
    renderPage();

    expect(await screen.findByText("Worked out what to say")).toBeInTheDocument();
    expect(screen.queryByText("LLM SYNTHESIS")).not.toBeInTheDocument();
    expect(screen.queryByText(/TOOL DISPATCH/)).not.toBeInTheDocument();
  });

  it("opens what was sent and what came back in place, side by side", async () => {
    renderPage();

    expect(screen.queryByText("What we sent")).not.toBeInTheDocument();

    fireEvent.click(await screen.findByText("Worked out what to say"));

    expect(screen.getByText("What we sent")).toBeInTheDocument();
    expect(screen.getByText("What came back")).toBeInTheDocument();
    expect(screen.getByText("I will search Bristol.")).toBeInTheDocument();
  });

  it("says how often a repeated failure has happened", async () => {
    renderPage();

    fireEvent.click(await screen.findByText("Used property search"));

    expect(screen.getByText("This has happened 42 times recently.")).toBeInTheDocument();
  });

  it("does not claim a one-off failure is a pattern", async () => {
    dataFixture = payload({ failureCounts: { "the property search timed out": 1 } });
    renderPage();

    fireEvent.click(await screen.findByText("Used property search"));

    expect(screen.queryByText(/This has happened/)).not.toBeInTheDocument();
  });

  it("links a job's entries back to the job itself", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /Open this job/ }));
    expect(pushMock).toHaveBeenCalledWith("/admin/agents/agent_1/observability/run_1");
  });

  it("offers the four filters a reader actually wants", () => {
    renderPage();

    for (const label of ["Everything", "Thinking", "Tools", "Problems"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("says nothing has gone wrong rather than looking broken when Problems is empty", async () => {
    dataFixture = payload({ groups: [], totalGroups: 0 });
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Problems" }));

    expect(await screen.findByText("Nothing has gone wrong")).toBeInTheDocument();
  });

  it("distinguishes an empty search from an agent that has never spoken", async () => {
    dataFixture = payload({ groups: [], totalGroups: 0 });
    renderPage();

    expect(await screen.findByText("This agent has not said anything yet")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Search everything/), {
      target: { value: "needle" },
    });

    // The house search box reports the term once typing stops rather than on
    // every keystroke, so the same search happens a moment later. The box itself
    // is immediate; it is the query that waits.
    await waitFor(() =>
      expect(screen.getByText("Nothing matched that search")).toBeInTheDocument()
    );
  });

  it("says outright when the history is longer than the screen can hold", async () => {
    dataFixture = payload({ windowTruncated: true });
    renderPage();

    expect(await screen.findByText(/covers its most recent activity/)).toBeInTheDocument();
  });

  it("labels work that never belonged to a job rather than inventing one", async () => {
    dataFixture = payload({
      groups: [
        {
          runId: undefined,
          startedAt: START,
          lastAt: START,
          job: null,
          entries: [entry({ _id: "loose", interactionType: "WORKFLOW_EXECUTION" })],
        },
      ],
    });
    renderPage();

    expect(await screen.findByText("Work done outside a job")).toBeInTheDocument();
    expect(screen.getByText("No job")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Open this job/ })).not.toBeInTheDocument();
  });

  it("waits rather than flashing an empty state before the entries arrive", () => {
    dataFixture = undefined;
    renderPage();

    expect(screen.queryByText("This agent has not said anything yet")).not.toBeInTheDocument();
  });

  it("keeps the entry rows readable as a list", async () => {
    renderPage();

    const jobCard = (await screen.findByText("Find new three-bed listings in Bristol under £400k")).closest("div")!
      .parentElement!.parentElement!;
    expect(within(jobCard).getAllByRole("button").length).toBeGreaterThanOrEqual(2);
  });
});
