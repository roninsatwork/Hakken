import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { beforeEach, describe, vi } from "vitest";
import { useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { itBehavesLikeAStandardTableScreen } from "@/src/test/standardTableScreen";
import AgentRunsPage from "./page";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/navigation", async () => (await import("@/src/test/screenMocks")).nextNavigation({ id: "agent123" }));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());

const runs = [
  {
    runId: "run_nightly",
    status: "SUCCEEDED",
    gradingMode: "AUTO",
    objective: "Draft this week's exam questions",
    label: "Nightly draft",
    modelId: "fast-chat",
    agentVersionId: "version_4",
    startedAt: Date.UTC(2026, 7, 15, 2, 0),
    completedAt: Date.UTC(2026, 7, 15, 2, 4),
    finalOutput: "Twelve questions drafted.",
    error: undefined,
    fixture: undefined,
    missingToolMappings: [],
    expectedBlockedActionSummaries: [],
    markers: { feedback: null, reflected: false, usedAsCheck: false, memoryCandidateIds: [], suggestionIds: [] },
  },
  {
    runId: "run_manual",
    status: "FAILED",
    gradingMode: "AUTO",
    objective: "Rebuild the report",
    label: "Manual run",
    modelId: "fast-chat",
    agentVersionId: "version_4",
    startedAt: Date.UTC(2026, 7, 14, 11, 0),
    completedAt: Date.UTC(2026, 7, 14, 11, 1),
    finalOutput: undefined,
    error: "The source sheet was empty.",
    fixture: undefined,
    missingToolMappings: [],
    expectedBlockedActionSummaries: [],
    markers: { feedback: null, reflected: false, usedAsCheck: false, memoryCandidateIds: [], suggestionIds: [] },
  },
];

describe("AgentRunsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("as a standard table screen", () => {
    itBehavesLikeAStandardTableScreen({
      renderScreen: () => render(<AgentRunsPage />),
      withRows: (rows) => {
        vi.mocked(useQuery).mockImplementation((...args) => {
          if (getFunctionName(args[0]) !== "agentRuns:getPageForAgent") return undefined;
          return rows === undefined ? undefined : { page: rows, isDone: true, continueCursor: null };
        });
      },
      sampleRows: runs,
      sampleRowText: "Draft this week's exam questions",
      emptyText: "This agent has not run any jobs yet",
      hasFooter: false,
    });
  });
});
