import { cleanup, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { useScreenDay } from "@/src/test/realTime";
import { useAction, useMutation, useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import { expectApprovedLook } from "@/src/test/lookOutline";
import { PAGE_ROW, ROW, STATUS, TRACKING, list } from "@/src/test/searchConsoleFixtures";
import SearchConsoleTrackedKeywordsPage from "./[siteId]/tracked/keywords/page";
import SearchConsoleTrackedPagesPage from "./[siteId]/tracked/pages/page";

/**
 * Search Console's screens hold to the looks Anthony approved (design-drift-plan D4): each screen, rendered with sample
 * rows in English, reads as the outline saved beside its board. Tracked keywords and Tracked pages were approved on the
 * "Search Console — keywords and pages" canvas, then again as Way 1 on 18 November 2026; their outlines are in
 * docs/plans/assets/search-console-tracked-way-1/look/.
 */

const nav = vi.hoisted(() => ({ pathname: "/app/search-console/site_1", search: "" }));

// What Hakken sees names the platform in its title (search-console-volatility-plan.md §8).
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));
vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ siteId: "site_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());

/** Tracked keywords and Tracked pages, as Anthony chose them on 18 November 2026 (search-console-tracked-way-1-plan-2026-11-18.md). */
const TRACKED_PLAN = "search-console-tracked-way-1";

function answer(queries: Record<string, unknown>) {
  vi.mocked(useQuery).mockImplementation(answerQueries(queries));
  vi.mocked(useMutation).mockImplementation((() => vi.fn()) as never);
  vi.mocked(useAction).mockImplementation((() => vi.fn(() => new Promise(() => undefined))) as never);
}

function at(path: string, search = "") {
  nav.pathname = path;
  nav.search = search;
}

beforeEach(() => {
  // A fixed day, the one after the fixtures' newest: the screens' calendar periods count from today (AGENTS.md, "A test whose rows carry fixed days runs on a fixed day").
  useScreenDay("2026-09-27");
  vi.mocked(useQuery).mockReset();
  vi.mocked(useMutation).mockReset();
  vi.mocked(useAction).mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Search Console's approved looks", () => {
  it("Tracked keywords, Way 1", async () => {
    at("/app/search-console/site_1/tracked/keywords");
    answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleLists:searchConsoleListPage": list([ROW]),
      "searchConsoleTracking:searchConsoleTracking": TRACKING,
    });
    const { container } = render(<SearchConsoleTrackedKeywordsPage />);
    await screen.findByText("ai agency");
    await expectApprovedLook(container, TRACKED_PLAN, "TrackedKeywords", "Search Console → Tracked keywords");
  });

  it("Tracked pages, Way 1", async () => {
    at("/app/search-console/site_1/tracked/pages");
    answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleLists:searchConsoleListPage": list([PAGE_ROW]),
      "searchConsoleTracking:searchConsoleTracking": TRACKING,
    });
    const { container } = render(<SearchConsoleTrackedPagesPage />);
    await screen.findAllByText(/ai-agency/);
    await expectApprovedLook(container, TRACKED_PLAN, "TrackedPages", "Search Console → Tracked pages");
  });
});
