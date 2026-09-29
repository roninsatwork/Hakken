import { act, fireEvent, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import SiteSearchedPage from "./page";

const nav = vi.hoisted(() => ({ search: "", replace: vi.fn(), push: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
// The shared mock, with the values a wording is given written after its key.
vi.mock("next-intl", async () => {
  const base = (await import("@/src/test/screenMocks")).nextIntl();
  return {
    ...base,
    useTranslations: (namespace: string) => {
      const t = (key: string, values?: Record<string, unknown>) => [`${namespace}.${key}`, ...Object.values(values ?? {})].join(" ");
      return Object.assign(t, { rich: t });
    },
  };
});
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/sites/site_1/ai/searched",
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: nav.replace, push: nav.push, back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ siteId: "site_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

/** A topic as the server sends it: ronins.co.uk's, as dev held them on 2026-09-29. */
function angle(query: string, tracked: boolean, otherWordings: string[] = []) {
  return {
    key: `who can help::${query}`, angle: query, prompt: "who are good ai consultants for my SME in London, UK",
    query, queryText: query, otherWordings, intent: "BUYING", engines: ["chatgpt"], timesSeen: 4, lastSeenDay: "2026-09-29",
    position: { value: 8, from: "CHECKED", day: "2026-09-29" }, page: null, tracked,
  };
}

function open(tracking: { count: number; limit: number }) {
  const track = vi.fn(async () => null);
  vi.mocked(useMutation).mockReturnValue(track as never);
  vi.mocked(useQuery).mockImplementation(answerQueries({
    "sites:getMySite": { host: "ronins.co.uk", counts: { pages: 66 } },
    "siteAngles:listAngles": {
      rows: [
        angle("AI consultants for SMEs in London UK", false, ["AI consultants SME London UK"]),
        angle("logo design services London UK", true),
      ],
      cut: null, own: true, wordings: 3, built: true, audit: null, tracking,
    },
  }));
  render(<SiteSearchedPage />);
  return track;
}

/**
 * The Track tick (Anthony, 2026-09-29): the company's own people choose which
 * fan-out queries are checked on Google every run, on the page that lists them.
 */
describe("the Fan-out queries page's Track tick", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
    nav.push.mockClear();
  });

  it("tracks a topic by its wordings, and stops tracking one, without opening the search", async () => {
    const track = open({ count: 1, limit: 200 });
    expect(screen.getByText(/sites\.aiSearched\.trackedCount 1 200/)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByLabelText(/sites\.aiSearched\.trackLabel AI consultants for SMEs in London UK/));
    });
    expect(track).toHaveBeenCalledWith({
      siteId: "site_1",
      prompt: "who are good ai consultants for my SME in London, UK",
      queries: ["AI consultants for SMEs in London UK", "AI consultants SME London UK"],
      track: true,
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText(/sites\.aiSearched\.untrackLabel logo design services London UK/));
    });
    expect(track).toHaveBeenLastCalledWith(expect.objectContaining({ queries: ["logo design services London UK"], track: false }));
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("at the limit, a search not tracked cannot be ticked, and says why; one tracked can still be unticked", () => {
    open({ count: 200, limit: 200 });
    expect(screen.getByLabelText(/trackLabel AI consultants/)).toBeDisabled();
    expect(screen.getByLabelText(/untrackLabel logo design/)).not.toBeDisabled();
  });
});
