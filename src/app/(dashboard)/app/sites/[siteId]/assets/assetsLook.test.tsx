import { cleanup, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import { expectApprovedLook } from "@/src/test/lookOutline";
import YourAssetsPage from "./page";

/**
 * Discovery's Your assets holds to the look Anthony approved on the canvas
 * "Discovery — local, reviews, AI apps and mentions" (docs/plans/active/
 * discovery-local-reputation-ai-plan.md, D18; design-drift-plan D4): rendered
 * with sample rows in English, it reads as the outline saved beside its board
 * in docs/plans/assets/discovery-local-reputation-ai/look/.
 */

const nav = vi.hoisted(() => ({ pathname: "/app/sites/site_1/assets", search: "" }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ siteId: "site_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

const PLAN = "discovery-local-reputation-ai";
const SITE = { host: "ronins.co.uk", placeLabel: "United Kingdom", counts: {} };

const ASSETS = {
  workedOutAt: Date.UTC(2026, 9, 9),
  rows: [
    { key: "website", kind: "WEBSITE", name: "ronins.co.uk", seen: { code: "pageOne", a: 412 }, chosen: { code: "visits", a: 2_140 }, stage: "SEEN_NOT_CHOSEN", fix: { code: "fewVisits", a: 2_140, b: 412 } },
    { key: "profile:1", kind: "PROFILE", name: "Ronins", sub: "Guildford", seen: { code: "mapBox", a: 4, b: 12 }, chosen: { code: "notRead" }, stage: "NOT_SEEN", fix: { code: "climbMap" } },
    { key: "ai:app", kind: "AI_APP", name: "ChatGPT", seen: { code: "pagesRead", a: 34 }, chosen: { code: "recommended", a: 3, b: 9 }, stage: "WORKING", fix: null },
    { key: "place:clutch.co", kind: "DIRECTORY", name: "clutch.co", seen: { code: "aiQuoted", a: 86 }, chosen: null, stage: "NOT_THERE", fix: { code: "getListed", a: 3 } },
    ...Array.from({ length: 26 }, (_, at) => ({ key: `page:/p${at}/`, kind: "PAGE", name: `/p${at}/`, seen: { code: "aiQuoted", a: at }, chosen: null, stage: "WORKING", fix: null })),
  ],
};

function answer(queries: Record<string, unknown>) {
  vi.mocked(useQuery).mockImplementation(answerQueries({ "sites:getMySite": SITE, ...queries }));
  vi.mocked(useMutation).mockImplementation((() => vi.fn(async () => null)) as never);
  vi.mocked(useAction).mockImplementation((() => vi.fn(() => new Promise(() => undefined))) as never);
}

beforeEach(() => {
  vi.mocked(useQuery).mockReset();
  vi.mocked(useMutation).mockReset();
  vi.mocked(useAction).mockReset();
});
afterEach(cleanup);

describe("Discovery → Site's approved looks", () => {
  it("Your assets", async () => {
    nav.pathname = "/app/sites/site_1/assets";
    answer({ "siteAssets:yourAssets": ASSETS });
    const { container } = render(<YourAssetsPage />);
    await screen.findByText("clutch.co");
    await expectApprovedLook(container, PLAN, "Assets", "Discovery → Site → Your assets");
  });
});
