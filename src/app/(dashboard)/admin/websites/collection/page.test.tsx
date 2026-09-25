import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePaginatedQuery, useQuery } from "convex/react";

import { renderWithProviders } from "@/src/test/renderWithProviders";
import { answerQueries } from "@/src/test/siteViewFixtures";
import SeoCollectionPage from "./page";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/navigation", async () => (await import("@/src/test/screenMocks")).nextNavigation({}));

const pull = (overrides: Record<string, unknown>) => ({
  _id: `pull_${Math.random()}`,
  host: "kordatackle.com",
  companyName: "Korda",
  operationId: "site_crawl",
  targetCount: 1,
  status: "READY",
  costUsd: 0.15,
  sandbox: false,
  error: null,
  attempts: 0,
  at: Date.now(),
  cycleId: "cycle_1",
  sentAt: Date.now(),
  lastFetch: null,
  notFiled: false,
  tooLarge: false,
  rowsLeftOff: 0,
  ...overrides,
});

/**
 * The collection queue says what a request's state alone does not
 * (reliability plan V1, V2, 2.4): an answer not filed is not "collected", a
 * request out for hours says so with the last word on its answer, and an
 * answer cut or too large to keep says that too.
 */
describe("The collection queue", () => {
  it("says which answers were not filed, cut or too large, and which are out long unanswered", async () => {
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "seoCollectionReports:readSeoQueueCounts": { pending: 0, claimed: 0, submitted: 1, capped: false },
    }));
    vi.mocked(usePaginatedQuery).mockReturnValue({
      results: [
        pull({ notFiled: true, error: "Parse failed: Too many bytes read" }),
        pull({
          status: "SUBMITTED", operationId: "serp_google_organic", host: "carp bait", sentAt: Date.now() - 3 * 60 * 60 * 1000,
          lastFetch: { at: Date.now(), said: "DataForSEO is still working on it (Task In Queue.)." },
        }),
        pull({ tooLarge: true }),
        pull({ operationId: "backlinks_all", rowsLeftOff: 60 }),
      ],
      status: "Exhausted",
      isLoading: false,
      loadMore: vi.fn(),
    } as never);

    renderWithProviders(<SeoCollectionPage />);

    expect(await screen.findByText("admin.seoCollection.notFiled")).toBeInTheDocument();
    expect(screen.getByText("Parse failed: Too many bytes read")).toBeInTheDocument();
    expect(screen.getByText("admin.seoCollection.outLong")).toBeInTheDocument();
    expect(screen.getByText("admin.seoCollection.lastTry")).toBeInTheDocument();
    expect(screen.getByText("admin.seoCollection.tooLarge")).toBeInTheDocument();
    expect(screen.getByText("admin.seoCollection.rowsLeftOff")).toBeInTheDocument();
  });
});
