import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";

import { renderWithProviders } from "@/src/test/renderWithProviders";
import { answerQueries } from "@/src/test/siteViewFixtures";
import CollectionRunPage from "./page";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("next/navigation", async () =>
  (await import("@/src/test/screenMocks")).nextNavigation({ id: "company_1", cycleId: "cycle_2" }));

const report = {
  _id: "report_1",
  _creationTime: 1,
  cycleId: "cycle_2",
  companyId: "company_1",
  builtAt: Date.parse("2026-09-24T18:40:00Z"),
  final: true,
  requests: 5,
  costUsd: 2.4,
  waiting: 0,
  answering: 0,
  filed: 5,
  failed: 0,
  aiJudgements: 100,
  aiCostUsd: 0.1,
  firstSentAt: Date.parse("2026-09-24T17:42:00Z"),
  lastSentAt: Date.parse("2026-09-24T17:47:00Z"),
  byOperation: [
    { operationId: "site_crawl", requests: 2, costUsd: 0.3, answering: 0 },
    { operationId: "domain_ranked_keywords_list", requests: 3, costUsd: 2.1, answering: 0 },
  ],
  bySite: [
    { websiteId: "website_1", host: "kordatackle.com", requests: 4, costUsd: 2.25, keywordListCostUsd: 2.1, keywords: 3_000 },
    { host: "", requests: 1, costUsd: 0.15, keywordListCostUsd: 0, keywords: 0 },
  ],
  byCollectorRun: [
    { runId: "run_1", startedAt: Date.parse("2026-09-24T17:42:00Z"), requests: 3, costUsd: 1.2, stopped: "SPEND_LIMIT" },
    { runId: "run_2", startedAt: Date.parse("2026-09-24T17:46:00Z"), requests: 2, costUsd: 1.2, stopped: "QUEUE_EMPTY" },
  ],
  ai: [{ decisionKey: "seo.keyword-intent", judgements: 100, costUsd: 0.1 }],
};

const run = (overrides: Record<string, unknown> = {}) => ({
  cycleId: "cycle_2",
  companyId: "company_1",
  companyName: "Korda",
  startedAt: Date.parse("2026-09-24T17:41:00Z"),
  reused: 33,
  report,
  previous: {
    startedAt: Date.parse("2026-09-17T09:00:00Z"),
    totalUsd: 1,
    byOperation: [{ operationId: "site_crawl", costUsd: 0.2 }],
    bySite: [{ websiteId: "website_1", costUsd: 2.25 }],
  },
  operations: [
    { operationId: "site_crawl", category: "SITE_AUDIT", everyDays: 30 },
    { operationId: "domain_ranked_keywords_list", category: "KEYWORD_LISTS", everyDays: 7 },
  ],
  sites: [{ websiteId: "website_1", relationship: "OWNED", keywordsPerSite: 10_000, backlinksPerSite: 1_000 }],
  decisions: [{ decisionKey: "seo.keyword-intent", copyKey: "seoKeywordIntent" }],
  cadence: "weekly",
  estimate: { perMonthUsd: 12.34, lines: [{ every: "WEEK", costUsd: 2.1, perMonthUsd: 9.13 }] },
  open: false,
  closedByHand: null,
  waitingLong: { rows: [], total: 0 },
  ...overrides,
});

/**
 * One run in full: every line against the run before, each website's price
 * per thousand keywords, the AI, a month from now, and how it was sent.
 */
describe("A collection run", () => {
  it("puts every line against the run before", async () => {
    vi.mocked(useQuery).mockImplementation(answerQueries({ "seoRunReports:getRunReport": run() }));
    renderWithProviders(<CollectionRunPage />);

    expect(await screen.findByText("admin.collectionRuns.detail.bought.title")).toBeInTheDocument();
    // The crawl cost $0.10 more than last time; the keyword list and the shared comparisons are new.
    expect(screen.getByText("+$0.10")).toBeInTheDocument();
    expect(screen.getAllByText("admin.collectionRuns.detail.change.new")).toHaveLength(2);
    // $2.10 for 3,000 keywords is $0.70 a thousand.
    expect(screen.getByText("$0.70")).toBeInTheDocument();
    // Dearer than the last run by far more than a quarter.
    expect(screen.getByText("admin.collectionRuns.status.costUp")).toBeInTheDocument();
    expect(screen.getByText("$12.34")).toBeInTheDocument();
    expect(screen.getByText("decisions.catalogue.seoKeywordIntent.name")).toBeInTheDocument();
    expect(screen.getByText("admin.collectionRuns.detail.sent.stopped.QUEUE_EMPTY")).toBeInTheDocument();
    expect(screen.getByText("admin.collectionRuns.detail.back").closest("a"))
      .toHaveAttribute("href", "/admin/companies/company_1/websites/runs");
  });

  it("says so while the run's report is still being worked out", async () => {
    vi.mocked(useQuery).mockImplementation(answerQueries({ "seoRunReports:getRunReport": run({ report: null, previous: null }) }));
    renderWithProviders(<CollectionRunPage />);

    expect(await screen.findByText("admin.collectionRuns.detail.notReady")).toBeInTheDocument();
  });

  it("a run served wholly from data already held says so, rather than 'nothing sent yet'", async () => {
    const empty = {
      ...report, requests: 0, costUsd: 0, filed: 0, aiJudgements: 0, aiCostUsd: 0,
      byOperation: [], bySite: [], byCollectorRun: [], ai: [],
    };
    vi.mocked(useQuery).mockImplementation(answerQueries({ "seoRunReports:getRunReport": run({ report: empty }) }));
    renderWithProviders(<CollectionRunPage />);

    expect(await screen.findByText("admin.collectionRuns.detail.descriptionReused")).toBeInTheDocument();
    expect(screen.queryByText("admin.collectionRuns.detail.descriptionUnsent")).not.toBeInTheDocument();
  });

  it("lists what needs a look — out for hours, not filed — and nothing when all went well", async () => {
    // A request that could not be filed read as filed, and one out for hours
    // as merely waiting (reliability plan V1, V2).
    vi.mocked(useQuery).mockImplementation(answerQueries({ "seoRunReports:getRunReport": run({
      report: {
        ...report,
        attention: [{ pullId: "pull_9", operationId: "site_crawl", about: "kordatackle.com", kind: "NOT_FILED", detail: "Too many bytes read", at: Date.now() }],
        attentionTotal: 1,
      },
      waitingLong: {
        rows: [{
          pullId: "pull_8", operationId: "serp_google_organic", about: "carp bait", since: Date.now() - 3 * 60 * 60 * 1000,
          lastFetch: { at: Date.now(), said: "DataForSEO is still working on it (Task In Queue.)." },
        }],
        total: 1,
      },
    }) }));
    renderWithProviders(<CollectionRunPage />);

    expect(await screen.findByText("admin.collectionRuns.detail.attention.title")).toBeInTheDocument();
    expect(screen.getByText("admin.collectionRuns.detail.attention.kinds.NOT_FILED")).toBeInTheDocument();
    expect(screen.getByText("Too many bytes read")).toBeInTheDocument();
    expect(screen.getByText("admin.collectionRuns.detail.attention.kinds.OUT_LONG")).toBeInTheDocument();
    expect(screen.getByText("admin.collectionRuns.detail.attention.lastTry")).toBeInTheDocument();
    expect(screen.getByText("carp bait")).toBeInTheDocument();
  });

  it("shows no such list for a run where everything went as it should", async () => {
    vi.mocked(useQuery).mockImplementation(answerQueries({ "seoRunReports:getRunReport": run() }));
    renderWithProviders(<CollectionRunPage />);

    expect(await screen.findByText("admin.collectionRuns.detail.bought.title")).toBeInTheDocument();
    expect(screen.queryByText("admin.collectionRuns.detail.attention.title")).not.toBeInTheDocument();
  });

  it("says when collection is off rather than inventing a month", async () => {
    vi.mocked(useQuery).mockImplementation(answerQueries({ "seoRunReports:getRunReport": run({ estimate: null, cadence: null }) }));
    renderWithProviders(<CollectionRunPage />);

    expect(await screen.findByText("admin.collectionRuns.detail.estimate.off")).toBeInTheDocument();
  });
});

/**
 * Closing a run by hand (Anthony, 2026-09-25): offered only while the run is
 * still open, and only after saying what it does; a run closed by hand says so.
 */
describe("Closing a run by hand", () => {
  it("is offered on an open run, says what it does, and closes that run", async () => {
    const closeRun = vi.fn().mockResolvedValue(null);
    vi.mocked(useMutation).mockReturnValue(closeRun as never);
    vi.mocked(useQuery).mockImplementation(answerQueries({ "seoRunReports:getRunReport": run({ open: true }) }));
    renderWithProviders(<CollectionRunPage />);

    fireEvent.click(await screen.findByRole("button", { name: "admin.collectionRuns.detail.close.button" }));
    expect(screen.getByText("admin.collectionRuns.detail.close.body")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "admin.collectionRuns.detail.close.confirm" }));

    await waitFor(() => expect(closeRun).toHaveBeenCalledWith({ cycleId: "cycle_2" }));
  });

  it("is not offered once a run is finished, and a run closed by hand says so", async () => {
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "seoRunReports:getRunReport": run({ closedByHand: { name: "Anthony Basker", at: Date.parse("2026-09-25T10:42:00Z"), unsent: 12 } }),
    }));
    renderWithProviders(<CollectionRunPage />);

    expect(await screen.findByText("admin.collectionRuns.detail.close.closedBy")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "admin.collectionRuns.detail.close.button" })).not.toBeInTheDocument();
  });
});
