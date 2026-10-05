import { renderWithProviders as render, screen, fireEvent } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

import { expectApprovedLook } from "@/src/test/lookOutline";
import { answerQueries } from "@/src/test/siteViewFixtures";
import SeoCollectionPage from "./page";

/**
 * Collection pipeline holds to the look Anthony approved on the "Hakken
 * Collection progress" canvas, 2026-10-05 (docs/plans/active/
 * collection-progress-plan.md; design-drift-plan D4): rendered with sample
 * rows in English, it reads as the outline saved beside its board in
 * docs/plans/assets/collection-progress/look/.
 */

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", async () => (await import("@/src/test/screenMocks")).nextNavigation({}));
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => null }));

type Progress = FunctionReturnType<typeof api.seoCollectionProgress.listCollectionsNow>;
type NowRow = Progress["rows"][number];

const MINUTE = 60_000;
const NOW = Date.now();
const base: Omit<NowRow, "key" | "companyName" | "state"> = {
  kind: "COLLECTION",
  host: null,
  how: "COLLECT_NOW",
  startedAt: NOW - 20 * MINUTE,
  finishedAt: null,
  startedBy: "Anthony Basker",
  needsYou: null,
  stopped: null,
  planned: 0,
  back: 0,
  out: 0,
  toSend: 0,
  countsCut: false,
  failed: 0,
  reused: 0,
  sending: null,
  outGroups: [],
  sendSecondsLeft: null,
  costUsd: 0,
  credits: null,
  creditsCounted: false,
  cycleId: null,
  days: null,
};

const PROGRESS: Progress = {
  headline: { kind: "SENDING", needsYou: null, sendingFor: "Period House Group", collections: 2, downloads: 1 },
  rows: [
    {
      ...base, key: "cycle_phg", companyName: "Period House Group", state: "SENDING", planned: 136, back: 77, out: 2, toSend: 57,
      sending: { host: "corston.com", operationId: "backlinks_summary" }, sendSecondsLeft: 70, costUsd: 14.45, credits: 728,
      cycleId: "cycle_phg" as Id<"seoCollectionCycles">,
      outGroups: [{ operationId: "site_crawl", count: 2, hosts: ["morehandles.co.uk"], since: NOW - 7 * MINUTE, givesUpAt: NOW + 12 * 60 * MINUTE, typicalMs: 38 * MINUTE }],
    },
    {
      ...base, key: "cycle_cto", companyName: "Conterra Ops", state: "ANSWERS", planned: 84, back: 81, out: 3, costUsd: 13, credits: 602,
      cycleId: "cycle_cto" as Id<"seoCollectionCycles">,
      outGroups: [{ operationId: "site_crawl", count: 3, hosts: ["talosintelligence.com", "seerist.com", "crisis24.com"], since: NOW - 16 * MINUTE, givesUpAt: NOW + 12 * 60 * MINUTE, typicalMs: 38 * MINUTE }],
    },
    {
      ...base, key: "run_gsc", kind: "SEARCH_CONSOLE", companyName: "Period House Group", host: "morehandles.co.uk", how: "FIRST_DAYS",
      startedBy: null, state: "DOWNLOADING", planned: 90, back: 35, costUsd: null,
      days: { done: 35, total: 90, rows: 640_000, latest: "31 Aug 2026 to 6 Sep 2026", known: true },
    },
  ],
};

beforeEach(() => {
  vi.mocked(useQuery).mockImplementation(answerQueries({
    "seoCollectionProgress:listCollectionsNow": PROGRESS,
    "seoCollectionReports:readSeoQueueCounts": { pending: 57, claimed: 1, submitted: 6, capped: false },
  }));
  vi.mocked(usePaginatedQuery).mockReturnValue({
    results: [{
      _id: "pull_1", host: "talosintelligence.com", companyName: "Conterra Ops", operationId: "site_crawl", targetCount: 1,
      status: "SUBMITTED", costUsd: 1.5, sandbox: false, error: null, attempts: 0, at: NOW - 16 * MINUTE, cycleId: "cycle_cto",
      sentAt: NOW - 16 * MINUTE, lastFetch: null, notFiled: false, tooLarge: false, rowsLeftOff: 0, mark: null,
    }],
    status: "Exhausted",
    isLoading: false,
    loadMore: vi.fn(),
  } as never);
});

describe("Collection pipeline's approved look", () => {
  it("Collecting now, above every pull", async () => {
    const { container } = render(<SeoCollectionPage />);
    await screen.findByText("Sending on its own");
    await expectApprovedLook(container, "collection-progress", "Main", "Admin → Websites → Collection pipeline");
  });

  it("says what each is doing, how far it has got and what is left, and opens a row to its steps", async () => {
    render(<SeoCollectionPage />);
    await screen.findByText("Sending on its own");

    expect(screen.getByText("77 of 136 back · 2 out · 57 to send")).toBeInTheDocument();
    expect(screen.getByText("corston.com — Who links to it")).toBeInTheDocument();
    expect(screen.getByText("About 1 min to send")).toBeInTheDocument();
    expect(screen.getByText("3 out for 16 min: A crawl of its pages — talosintelligence.com, seerist.com, crisis24.com")).toBeInTheDocument();
    expect(screen.getByText("Search Console — morehandles.co.uk")).toBeInTheDocument();
    expect(screen.getByText("35 of 90 days · 640,000 rows")).toBeInTheDocument();
    expect(screen.getAllByText("Counted at the end")).toHaveLength(2);

    fireEvent.click(screen.getByText("Period House Group", { selector: "span" }));
    expect(await screen.findByText("Sending: 79 of 136")).toBeInTheDocument();
    expect(screen.getByText("Open this collection, line by line →").closest("a")).toHaveAttribute("href", "/admin/websites/collection/cycle_phg");
  });
});
