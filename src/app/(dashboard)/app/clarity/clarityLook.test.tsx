import { cleanup, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import { expectApprovedLook } from "@/src/test/lookOutline";
import ClarityOverviewPage from "./[siteId]/page";
import ClarityPagesPage from "./[siteId]/pages/page";
import ClarityConnectionPage from "./[siteId]/connection/page";

/**
 * Microsoft Clarity's screens hold to the looks drawn and approved on
 * 2026-10-11 (docs/plans/active/insights-analyst-plan.md §11, phase 15; the
 * Clarity boards in docs/plans/assets/insights-analyst/): each rendered with
 * sample figures in English, read as the outline saved beside its board.
 */

const nav = vi.hoisted(() => ({ pathname: "/app/clarity/site_1", search: "" }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ siteId: "site_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

const PLAN = "insights-analyst";
const CONNECTED = { host: "ronins.co.uk", owned: true, ownSites: [{ siteId: "site_1", host: "ronins.co.uk" }], connection: { status: "CONNECTED", projectName: "Ronins", problem: null, newestDay: "2026-10-10", oldestDay: "2026-09-10", lastCollectedAt: Date.parse("2026-10-11T04:50:00Z") } };
const row = (key: string, sessions: number, scroll: number, dead: number) => ({ key, sessions, scroll, activeSeconds: 62, dead, rage: 1, quickBack: 7, excessiveScroll: null });
const PAGES = { from: "2026-09-11", to: "2026-10-10", rows: [row("/", 214, 41, 11), row("/chatbot-agency/", 31, 39, 13)], byDay: [{ day: "2026-10-09", sessions: 30, dead: 9, rage: 1, scroll: 48 }, { day: "2026-10-10", sessions: 28, dead: 10, rage: 2, scroll: 47 }] };

function answer(queries: Record<string, unknown>) {
  vi.mocked(useQuery).mockImplementation(answerQueries(queries));
  vi.mocked(useMutation).mockImplementation((() => vi.fn()) as never);
  vi.mocked(useAction).mockImplementation((() => vi.fn()) as never);
}

beforeEach(() => {
  vi.mocked(useQuery).mockReset();
  vi.mocked(useMutation).mockReset();
  vi.mocked(useAction).mockReset();
});
afterEach(cleanup);

describe("Microsoft Clarity's approved looks", () => {
  it("Overview", async () => {
    nav.pathname = "/app/clarity/site_1";
    answer({ "clarity:clarityStatus": CONNECTED, "clarity:clarityFigures": PAGES });
    const { container } = render(<ClarityOverviewPage />);
    await screen.findByText("Average scroll depth");
    await expectApprovedLook(container, PLAN, "ClarityOverview", "Microsoft Clarity → Overview");
  });

  it("Pages", async () => {
    nav.pathname = "/app/clarity/site_1/pages";
    answer({ "clarity:clarityStatus": CONNECTED, "clarity:clarityFigures": PAGES });
    const { container } = render(<ClarityPagesPage />);
    await screen.findByText("/chatbot-agency/");
    await expectApprovedLook(container, PLAN, "ClarityPages", "Microsoft Clarity → Pages");
  });

  it("Connection", async () => {
    nav.pathname = "/app/clarity/site_1/connection";
    answer({ "clarity:clarityStatus": { ...CONNECTED, connection: null } });
    const { container } = render(<ClarityConnectionPage />);
    await screen.findByText("Connect Clarity");
    await expectApprovedLook(container, PLAN, "ClarityConnection", "Microsoft Clarity → Connection");
  });
});
