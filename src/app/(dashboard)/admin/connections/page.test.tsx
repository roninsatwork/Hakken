import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { beforeEach, describe, vi } from "vitest";
import { useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { itBehavesLikeAStandardTableScreen } from "@/src/test/standardTableScreen";
import ConnectionsPage from "./page";

/**
 * A two-table screen: what is connected, and what has run recently. The rows
 * here describe the first, so the floor is told the count and the index.
 */

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/navigation", async () => (await import("@/src/test/screenMocks")).nextNavigation());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());

const connections = [
  {
    id: "connection_gmail",
    name: "Gmail",
    kind: "MAILBOX",
    detail: "anthony@ronins.co.uk",
    working: true,
    lastHeardAt: Date.UTC(2026, 7, 15, 9, 0),
    checkedAt: Date.UTC(2026, 7, 15, 9, 5),
  },
  {
    id: "connection_telephony",
    name: "Telephone",
    kind: "TELEPHONY",
    detail: "+44 1483 000000",
    working: false,
    lastHeardAt: undefined,
    checkedAt: Date.UTC(2026, 7, 15, 9, 5),
  },
];

describe("ConnectionsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("as a standard table screen", () => {
    itBehavesLikeAStandardTableScreen({
      renderScreen: () => render(<ConnectionsPage />),
      withRows: (rows) => {
        vi.mocked(useQuery).mockImplementation((...args) => {
          const name = getFunctionName(args[0]);
          if (name === "connectionProbes:listConnections") return rows;
          if (name === "jobLedger:listJobRuns") return [];
          return undefined;
        });
      },
      sampleRows: connections,
      sampleRowText: "anthony@ronins.co.uk",
      emptyText: "connections.noConnections",
      tableCount: 2,
      tableIndex: 0,
      hasFooter: false,
    });
  });
});
