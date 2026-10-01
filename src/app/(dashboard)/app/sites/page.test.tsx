import { fireEvent, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import SitesPage from "./page";

const nav = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
// The shared mock, with the values a wording is given written after its key.
vi.mock("next-intl", async () => {
  const base = (await import("@/src/test/screenMocks")).nextIntl();
  return {
    ...base,
    useTranslations: (namespace: string) => {
      const t = (key: string, values?: Record<string, unknown>) => [`${namespace}.${key}`, ...Object.values(values ?? {})].join(" ");
      return Object.assign(t, { rich: t, has: () => false });
    },
  };
});
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/sites",
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ replace: vi.fn(), push: nav.push, back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({}),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => null }));

const row = (siteId: string, host: string, of: { siteId: string; host: string } | null = null) => ({
  siteId,
  host,
  relationship: of ? "TRACKED" : "OWNED",
  ofHost: of?.host ?? null,
  ofSiteId: of?.siteId ?? null,
  checked: true,
  aiNamed: 1,
  aiAsked: 4,
  top3: 10,
  pageOne: 20,
  keywords: 100,
  estimatedTraffic: 500,
  rankedUp: 3,
  rankedDown: 2,
  movesAmongHeld: null,
  toDo: 0,
  toDoCapped: false,
  lastCheckedAt: null,
  lastCheckedDay: "2026-09-29",
  nextRunAt: null,
  cadence: "weekly",
  placeLabel: "United Kingdom",
  addedAt: Date.UTC(2026, 8, 21),
});

const KORDA = { siteId: "korda", host: "kordatackle.com" };
const SECOND = { siteId: "second", host: "kordacarp.example" };

const show = (rows: unknown[]) => {
  vi.mocked(useQuery).mockImplementation(answerQueries({ "sites:listMySites": rows }));
  render(<SitesPage />);
};
const cell = (text: string) => screen.queryByText(text);

describe("Your sites (docs/plans/active/sites-website-switcher-plan.md, W1)", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
    nav.push.mockReset();
  });

  it("lists each website the company owns, with its place and cadence, and its competitors folded until asked for", () => {
    show([
      row(KORDA.siteId, KORDA.host),
      row(SECOND.siteId, SECOND.host),
      row("nash", "nashtackle.co.uk", KORDA),
      row("fox", "foxint.com", KORDA),
      row("carpology", "carpology.net", SECOND),
    ]);

    expect(cell("kordatackle.com")).toBeInTheDocument();
    expect(cell("kordacarp.example")).toBeInTheDocument();
    expect(screen.getAllByText(/^sites\.list\.aboutChecked United Kingdom sites\.list\.cadence\.weekly /)).toHaveLength(2);
    expect(cell("nashtackle.co.uk")).not.toBeInTheDocument();

    expect(screen.getByText("sites.list.competitorCount 2")).toBeInTheDocument();
    const kordaRivals = screen.getByRole("button", { name: "sites.list.showCompetitors kordatackle.com" });
    expect(kordaRivals).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(kordaRivals);

    expect(cell("nashtackle.co.uk")).toBeInTheDocument();
    expect(cell("foxint.com")).toBeInTheDocument();
    expect(cell("carpology.net")).not.toBeInTheDocument();
    // Folding the competitors out does not open the website.
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("shows a company with one website all its competitors without asking, and folds them away again", () => {
    show([
      row(KORDA.siteId, KORDA.host),
      ...["a-rival.com", "b-rival.com", "c-rival.com", "d-rival.com", "e-rival.com", "f-rival.com"].map((host) => row(host, host, KORDA)),
    ]);

    expect(cell("a-rival.com")).toBeInTheDocument();
    expect(cell("f-rival.com")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "sites.list.hideCompetitors kordatackle.com" }));
    expect(cell("a-rival.com")).not.toBeInTheDocument();
  });

  it("lists a competitor watched against none of the websites on its own, and opens any site from its row", () => {
    show([row(KORDA.siteId, KORDA.host), row("loose", "anglingdirect.co.uk")].map((entry, index) =>
      index === 1 ? { ...entry, relationship: "TRACKED" } : entry));

    expect(cell("sites.list.alone")).toBeInTheDocument();
    fireEvent.click(screen.getByText("anglingdirect.co.uk"));
    expect(nav.push).toHaveBeenCalledWith("/app/sites/loose");
  });
});
