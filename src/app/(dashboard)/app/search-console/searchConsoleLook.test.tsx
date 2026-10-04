import { cleanup, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import { expectApprovedLook } from "@/src/test/lookOutline";
import { PAGE_ROW, ROW, STATUS, TRACKING, list } from "@/src/test/searchConsoleFixtures";
import SearchConsoleTrackedKeywordsPage from "./[siteId]/tracked/keywords/page";
import SearchConsoleTrackedPagesPage from "./[siteId]/tracked/pages/page";

/**
 * Search Console's screens hold to the looks Anthony approved on the
 * "Search Console — keywords and pages" canvas (design-drift-plan D4): each
 * screen, rendered with sample rows in English, reads as the outline saved
 * beside its board in docs/plans/assets/search-console-redesign/look/.
 */

const nav = vi.hoisted(() => ({ pathname: "/app/search-console/site_1", search: "" }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ siteId: "site_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());

const PLAN = "search-console-redesign";

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
  vi.mocked(useQuery).mockReset();
  vi.mocked(useMutation).mockReset();
  vi.mocked(useAction).mockReset();
});
afterEach(cleanup);

describe("Search Console's approved looks", () => {
  it("19 · Tracked keywords", async () => {
    at("/app/search-console/site_1/tracked/keywords");
    answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleLists:searchConsoleListPage": list([ROW]),
      "searchConsoleTracking:searchConsoleTracking": TRACKING,
    });
    const { container } = render(<SearchConsoleTrackedKeywordsPage />);
    await screen.findByText("ai agency");
    await expectApprovedLook(container, PLAN, "TrackedKeywords", "Search Console → Tracked keywords");
  });

  it("20 · Tracked pages", async () => {
    at("/app/search-console/site_1/tracked/pages");
    answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleLists:searchConsoleListPage": list([PAGE_ROW]),
      "searchConsoleTracking:searchConsoleTracking": TRACKING,
    });
    const { container } = render(<SearchConsoleTrackedPagesPage />);
    await screen.findAllByText(/ai-agency/);
    await expectApprovedLook(container, PLAN, "TrackedPages", "Search Console → Tracked pages");
  });
});
