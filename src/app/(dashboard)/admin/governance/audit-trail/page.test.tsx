import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { beforeEach, describe, vi } from "vitest";
import { usePaginatedQuery } from "convex/react";
import { itBehavesLikeAStandardTableScreen } from "@/src/test/standardTableScreen";
import { pagedResult } from "@/src/test/screenMocks";
import AuditTrailPage from "./page";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/navigation", async () => (await import("@/src/test/screenMocks")).nextNavigation());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());

const entries = [
  {
    _id: "audit_invite",
    actionType: "INVITE_SENT",
    actorName: "Anthony Basker",
    targetName: "sam@ronins.co.uk",
    entityId: "invite_1",
    companyName: "Comax",
    change: undefined,
    timestamp: Date.UTC(2026, 7, 15, 10, 0),
  },
  {
    _id: "audit_purge",
    actionType: "PURGE_RUN",
    actorName: "System",
    targetName: "Chat logs",
    entityId: "purge_1",
    companyName: undefined,
    change: undefined,
    timestamp: Date.UTC(2026, 7, 14, 2, 0),
  },
];

describe("AuditTrailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("as a standard table screen", () => {
    itBehavesLikeAStandardTableScreen({
      renderScreen: () => render(<AuditTrailPage />),
      withRows: (rows) => {
        vi.mocked(usePaginatedQuery).mockReturnValue(pagedResult(rows) as unknown as ReturnType<typeof usePaginatedQuery>);
      },
      sampleRows: entries,
      sampleRowText: "Anthony Basker",
      emptyText: "admin.governance.auditTrail.empty",
      searchPlaceholder: "admin.governance.auditTrail.searchPlaceholder",
    });
  });
});
