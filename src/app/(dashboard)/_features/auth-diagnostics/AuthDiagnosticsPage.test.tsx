import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { beforeEach, describe, vi } from "vitest";
import { useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { itBehavesLikeAStandardTableScreen } from "@/src/test/standardTableScreen";
import { AuthDiagnosticsPage } from "./AuthDiagnosticsPage";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/navigation", async () => (await import("@/src/test/screenMocks")).nextNavigation());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());

const events = [
  {
    _id: "event_signin",
    eventType: "SIGN_IN_SUCCEEDED",
    email: "anthony@ronins.co.uk",
    provider: "google",
    reasonCode: undefined,
    companyId: "company123",
    companyName: "Comax",
    inviteId: undefined,
    target: undefined,
    timestamp: Date.UTC(2026, 7, 15, 9, 0),
  },
  {
    _id: "event_blocked",
    eventType: "SIGN_IN_BLOCKED",
    email: "stranger@example.com",
    provider: "google",
    reasonCode: "NO_INVITATION",
    companyId: undefined,
    companyName: undefined,
    inviteId: undefined,
    target: undefined,
    timestamp: Date.UTC(2026, 7, 15, 9, 30),
  },
];

describe("AuthDiagnosticsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("as a standard table screen", () => {
    itBehavesLikeAStandardTableScreen({
      renderScreen: () => render(<AuthDiagnosticsPage />),
      withRows: (rows) => {
        vi.mocked(useQuery).mockImplementation((...args) => {
          const name = getFunctionName(args[0]);
          if (name === "users:getMe") return { _id: "user_1", role: "SUPER_ADMIN" };
          if (name === "authEvents:getRecentAuthEvents") return rows;
          return undefined;
        });
      },
      sampleRows: events,
      sampleRowText: "anthony@ronins.co.uk",
      emptyText: "admin.authDiagnostics.table.empty",
    });
  });
});
