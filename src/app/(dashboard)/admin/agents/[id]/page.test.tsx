import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { beforeEach, describe, vi } from "vitest";
import { usePaginatedQuery, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { itBehavesLikeAStandardTableScreen } from "@/src/test/standardTableScreen";
import { pagedResult } from "@/src/test/screenMocks";
import AgentDashboard from "./page";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/navigation", async () => (await import("@/src/test/screenMocks")).nextNavigation({ id: "agent123" }));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());

const transactions = [
  {
    _id: "tx_draft",
    actionContext: "Drafted this week's exam questions",
    modelUsed: "fast-chat",
    status: "SUCCESS",
    inputTokens: 12400,
    outputTokens: 2100,
    costUsd: 0.04,
    createdAt: Date.UTC(2026, 7, 15, 2, 2),
  },
  {
    _id: "tx_repair",
    actionContext: "Repaired four wiki links",
    modelUsed: "fast-chat",
    status: "SUCCESS",
    inputTokens: 3100,
    outputTokens: 400,
    costUsd: 0.01,
    createdAt: Date.UTC(2026, 7, 14, 2, 2),
  },
];

describe("AgentDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockImplementation((...args) => {
      const name = getFunctionName(args[0]);
      if (name === "aiModels:getActiveModels") return [];
      if (name === "agentTransactions:getStatsForAgent") {
        return {
          totalGenerations: 2,
          totalTokensIngested: 18000,
          totalInputTokens: 15500,
          totalOutputTokens: 2500,
          totalOpexCost: 0.05,
        };
      }
      return undefined;
    });
  });

  describe("as a standard table screen", () => {
    itBehavesLikeAStandardTableScreen({
      renderScreen: () => render(<AgentDashboard />),
      withRows: (rows) => {
        vi.mocked(usePaginatedQuery).mockReturnValue(pagedResult(rows) as unknown as ReturnType<typeof usePaginatedQuery>);
      },
      sampleRows: transactions,
      sampleRowText: "Drafted this week's exam questions",
      emptyText: "admin.agents.details.dashboard.table.noTransactions",
      searchPlaceholder: "admin.agents.details.dashboard.table.searchPlaceholder",
    });
  });
});
