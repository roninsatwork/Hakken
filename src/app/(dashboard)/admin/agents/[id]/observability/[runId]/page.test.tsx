import React from "react";
import { NextIntlClientProvider } from "next-intl";
import { ToastProvider } from "@/src/context/ToastContext";
import { fireEvent, render as renderBase, screen, within } from "@testing-library/react";
import messages from "../../../../../../../../messages/en.json";

// The screen resolves its copy through the catalogue, so it renders inside
// the same intl provider the root layout supplies.
function render(ui: React.ReactElement) {
  return renderBase(ui, {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <NextIntlClientProvider locale="en" messages={messages}>
        <ToastProvider>{children}</ToastProvider>
      </NextIntlClientProvider>
    ),
  });
}
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import AgentJobDetailPage from "./page";

vi.mock("convex/react", () => ({ useQuery: vi.fn(), useMutation: () => vi.fn() }));

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "agent_1", runId: "run_1" }),
  useRouter: () => ({ push: pushMock }),
}));

const START = Date.now() - 60_000;

function step(id: string, kind: string, offsetMs: number, status = "SUCCESS", input?: string) {
  return {
    _id: id,
    kind,
    status,
    input,
    startedAt: START + offsetMs,
    completedAt: START + offsetMs,
  };
}

function detail(overrides: Record<string, unknown> = {}) {
  return {
    run: {
      _id: "run_1",
      objective: "Find new three-bed listings in Bristol under £400k",
      status: "FAILED",
      triggerType: "SCHEDULE",
      startedAt: START,
      completedAt: START + 31_400,
      costGBP: 0.021,
      error: "The property search timed out",
    },
    steps: [
      step("s1", "OBSERVE", 900),
      step("s2", "PLAN", 2_500),
      step("s3", "TOOL_CALL", 5_900, "SUCCESS", "property search"),
      step("s4", "TOOL_CALL", 31_400, "FAILED", "property search"),
    ],
    // The tool behind each tool step, which is the only place the chart can
    // learn a tool's name from: the call step stores its arguments and the
    // result step stores the runtime's name for the tool.
    toolCalls: [
      { _id: "tc1", stepId: "s3", normalizedToolName: "property_search", toolName: "property search" },
      { _id: "tc2", stepId: "s4", normalizedToolName: "property_search", toolName: "property search" },
    ],
    // All of these are always present on the real query, so the fixture carries
    // them too — a fixture thinner than the contract hides real render failures.
    evalFixtureContext: { canCreateFromRun: true, activeCount: 0, archivedCount: 0, fixtures: [] },
    replayContext: { sourceRun: null, replayRuns: [], comparison: null, timelineDiff: [] },
    ...overrides,
  };
}

const logs = [
  {
    _id: "log_1",
    interactionType: "LLM SYNTHESIS",
    promptContent: "Find new three-bed listings in Bristol",
    responseContent: "I will search Bristol.",
    outcome: "SUCCESS",
    durationMs: 900,
  },
  {
    _id: "log_2",
    interactionType: "TOOL DISPATCH: property_search",
    promptContent: "Find new three-bed listings in Bristol",
    responseContent: "The property search timed out after 24000ms",
    outcome: "FAILED",
    durationMs: 23_900,
  },
];

describe("AgentJobDetailPage", () => {
  let detailFixture: unknown;
  let logsFixture: unknown;

  const renderPage = async () => {
    render(<AgentJobDetailPage />);
    if (detailFixture === null) await screen.findByText("This job could not be found");
    else await screen.findByRole("region", { name: "Where the time went" });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    detailFixture = detail();
    logsFixture = logs;

    vi.mocked(useQuery).mockImplementation((queryFn, args?) => {
      void args;
      const name = getFunctionName(queryFn);
      if (name === "agentRuns:getRunDetail") return detailFixture as ReturnType<typeof useQuery>;
      if (name === "agentLogs:getForRun") return logsFixture as ReturnType<typeof useQuery>;
      return undefined as unknown as ReturnType<typeof useQuery>;
    });
  });

  const waterfall = () => screen.getByRole("region", { name: "Where the time went" });
  const exchange = () => screen.getByRole("region", { name: "What was actually said" });

  it("leads with what the job was asked to do and how it ended", async () => {
    await renderPage();

    expect(screen.getByText("Find new three-bed listings in Bristol under £400k")).toBeInTheDocument();
    expect(screen.getByText("Why it stopped")).toBeInTheDocument();
    expect(screen.getByText("The property search timed out")).toBeInTheDocument();
    // "Failed" also labels the failed log entry below, so this asserts the one
    // that reports the job itself.
    expect(screen.getAllByText("Failed").length).toBeGreaterThan(0);
  });

  it("summarises generated Rightmove collection objectives without exposing tool instructions as the title", async () => {
    detailFixture = detail({
      run: {
        ...detail().run,
        objective: [
          "Collect property listings from this Rightmove search and file them for the team.",
          "Rightmove search URL: https://www.rightmove.co.uk/property-for-sale/find.html?locationIdentifier=REGION%5E873",
          "Gather up to 100 properties.",
          "Use 100 as the maxProperties value for this request, even if an example in your instructions shows a different number.",
          "Start the collection, report that it has started, and stop. Do not wait for every listing or guess final counts.",
        ].join("\n"),
        status: "SUCCESS",
        error: undefined,
        finalOutput: "The property collection job has successfully started.",
      },
    });
    await renderPage();

    expect(screen.getByRole("heading", { name: "Gather Rightmove properties" })).toBeInTheDocument();
    expect(screen.getByText("Rightmove search · up to 100 properties")).toBeInTheDocument();
    expect(
      screen.getByText("https://www.rightmove.co.uk/property-for-sale/find.html?locationIdentifier=REGION%5E873")
    ).toBeInTheDocument();
    expect(screen.queryByText(/Use 100 as the maxProperties value/)).not.toBeInTheDocument();
  });

  it("names each step in ordinary words rather than the runtime's own", async () => {
    await renderPage();

    const chart = within(waterfall());
    expect(chart.getByText("Read the request")).toBeInTheDocument();
    expect(chart.getByText("Decided what to do")).toBeInTheDocument();
    // Two tool calls in this job, both to the same tool.
    expect(chart.getAllByText("Used property search")).toHaveLength(2);
    expect(screen.queryByText("TOOL_CALL")).not.toBeInTheDocument();
    expect(screen.queryByText("OBSERVE")).not.toBeInTheDocument();
  });

  /**
   * The chart used to label the call step with the raw JSON arguments it was
   * given, and the result step with the runtime's own `property_search`. Read
   * together they told the reader neither which tool ran nor when.
   */
  it("names the tool on both tool steps, never the arguments it was called with", async () => {
    detailFixture = detail({
      steps: [
        step("s3", "TOOL_CALL", 5_900, "SUCCESS", '{"job":"jKpgGfgRfzrGgEM","settings":"{}"}'),
        // The result step records only the runtime's name for the tool, so this
        // is matched on that rather than on the step it belongs to.
        step("s5", "TOOL_RESULT", 6_100, "SUCCESS", "property_search"),
      ],
    });
    await renderPage();

    const chart = within(waterfall());
    expect(chart.getByText("Used property search")).toBeInTheDocument();
    expect(chart.getByText("Read what property search sent back")).toBeInTheDocument();
    expect(chart.queryByText(/jKpgGfgRfzrGgEM/)).not.toBeInTheDocument();
    expect(chart.queryByText("property_search")).not.toBeInTheDocument();
  });

  /**
   * The whole point of the waterfall: one step ate the job, and the reader
   * should not have to work that out by comparing six numbers.
   */
  it("says outright where the time went when one step dominated", async () => {
    await renderPage();

    expect(
      screen.getByText(/of this job was spent on a step that then failed/)
    ).toBeInTheDocument();
  });

  it("shows each step's real elapsed time, not the zero the runtime records", async () => {
    await renderPage();

    const chart = within(waterfall());
    expect(chart.getByText("900ms")).toBeInTheDocument();
    expect(chart.getByText("1.6s")).toBeInTheDocument();
    expect(chart.getByText("25.5s")).toBeInTheDocument();
  });

  it("translates raw log entries out of the runtime's vocabulary", async () => {
    await renderPage();

    const raw = within(exchange());
    expect(raw.getByText("Worked out what to say")).toBeInTheDocument();
    expect(raw.getByText("Used property search")).toBeInTheDocument();
    expect(screen.queryByText("LLM SYNTHESIS")).not.toBeInTheDocument();
    expect(screen.queryByText(/TOOL DISPATCH/)).not.toBeInTheDocument();
  });

  it("opens what was sent and what came back, side by side, in place", async () => {
    await renderPage();

    expect(screen.queryByText("What we sent")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Worked out what to say"));

    expect(screen.getByText("What we sent")).toBeInTheDocument();
    expect(screen.getByText("What came back")).toBeInTheDocument();
    expect(screen.getByText("I will search Bristol.")).toBeInTheDocument();
  });

  it("says a job with no steps recorded nothing, rather than drawing an empty chart", async () => {
    detailFixture = detail({ steps: [] });
    await renderPage();

    expect(screen.getByText("No steps were recorded")).toBeInTheDocument();
  });

  it("explains an empty exchange rather than leaving a blank panel", async () => {
    // Jobs that ran before log entries recorded their run have nothing to show.
    logsFixture = [];
    await renderPage();

    expect(screen.getByText("Nothing was recorded for this job")).toBeInTheDocument();
  });

  it("offers a way back when the job cannot be found", async () => {
    detailFixture = null;
    await renderPage();

    expect(screen.getByText("This job could not be found")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to the overview" }));
    expect(pushMock).toHaveBeenCalledWith("/admin/agents/agent_1/observability");
  });

  it("waits rather than rendering a half-built screen", async () => {
    detailFixture = undefined;
    const { container } = render(<AgentJobDetailPage />);

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
    expect(screen.queryByText("Where the time went")).not.toBeInTheDocument();
    expect(screen.queryByText("This job could not be found")).not.toBeInTheDocument();
  });
});
