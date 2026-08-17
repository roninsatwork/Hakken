import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { beforeEach, describe, vi } from "vitest";
import { usePaginatedQuery } from "convex/react";
import { itBehavesLikeAStandardTableScreen } from "@/src/test/standardTableScreen";
import { pagedResult } from "@/src/test/screenMocks";
import { PurgeHistorySection } from "./PurgeHistorySection";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());

const history = [
  {
    _id: "purge_chatlogs",
    pipelineKey: "chatLogs",
    triggerType: "SCHEDULED",
    actorName: null,
    status: "SUCCESS",
    recordsPurged: 1240,
    startedAt: Date.UTC(2026, 7, 14, 2, 0),
  },
  {
    _id: "purge_audit",
    pipelineKey: "auditLogs",
    triggerType: "MANUAL",
    actorName: "Anthony Basker",
    status: "RUNNING",
    recordsPurged: 0,
    startedAt: Date.UTC(2026, 7, 15, 9, 15),
  },
];

describe("PurgeHistorySection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("as a standard table screen", () => {
    itBehavesLikeAStandardTableScreen({
      renderScreen: () => render(<PurgeHistorySection />),
      withRows: (rows) => {
        vi.mocked(usePaginatedQuery).mockReturnValue(pagedResult(rows) as unknown as ReturnType<typeof usePaginatedQuery>);
      },
      sampleRows: history,
      sampleRowText: "admin.settings.purges.categories.chatLogs.title",
      emptyText: "admin.settings.purges.history.table.empty",
      searchPlaceholder: "admin.settings.purges.history.searchPlaceholder",
    });
  });
});
