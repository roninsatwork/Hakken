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

/**
 * Recent, not a fixed date.
 *
 * The screen opens on its "last 7 days" filter, so a fixture stamped with a
 * calendar date is a time bomb: these two were written on 2026-08-17 with
 * timestamps of 2026-08-15, passed for five days, and began failing on the
 * 22nd when they aged out of the window — with the failure reading as "the
 * table renders no rows", which points at the table rather than the clock.
 * Anchoring to now keeps them inside every window the screen offers.
 */
const anHourAgo = Date.now() - 60 * 60 * 1000;

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
    timestamp: anHourAgo,
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
    timestamp: anHourAgo + 30 * 60 * 1000,
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
