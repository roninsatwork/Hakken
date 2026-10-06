import { fireEvent, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import SiteKeywordPage from "./page";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
// The shared mock, with the values a wording is given written after its key.
vi.mock("next-intl", async () => {
  const base = (await import("@/src/test/screenMocks")).nextIntl();
  return {
    ...base,
    useTranslations: (namespace: string) => {
      const t = (key: string, values?: Record<string, unknown>) => [`${namespace}.${key}`, ...Object.values(values ?? {})].join(" ");
      return Object.assign(t, { rich: t, has: () => true });
    },
  };
});
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/sites/site_1/keywords/keyword",
  useSearchParams: () => new URLSearchParams("keyword=ai consultants for smes in london uk"),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ siteId: "site_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

/** ronins.co.uk's search as dev held it on 2026-09-29: checked once, as a fan-out query. */
const RECORD = {
  keyword: "ai consultants for smes in london uk",
  rank: null, search: null, tracked: null,
  checkedOnce: { position: 8, day: "2026-09-29" },
  serp: null, rivals: [], features: [],
};

const FROM_AI = {
  questions: ["who are good ai consultants for my SME in London, UK"],
  engines: ["chatgpt", "claude"],
  timesSeen: 4,
  lastSeenDay: "2026-09-29",
  otherWordings: ["AI consultants SME London UK"],
  intent: "BUYING",
  page: null,
  names: ["Ronins"],
  answers: [{
    answerId: "answer_1",
    engine: "claude",
    day: "2026-09-28",
    text: "Here are a few: **Lightflows** is based in Surrey.",
    stance: "NOT_NAMED" as const,
    rivals: [{ host: "lightflows.co.uk", stance: "RECOMMENDED" as const }],
    rivalNames: ["Lightflows"],
  }],
};

function open(fromAi: Record<string, unknown> | null, record: Record<string, unknown> = RECORD, positions: unknown[] = []) {
  vi.mocked(useQuery).mockImplementation(answerQueries({
    "sites:getMySite": { host: "ronins.co.uk", relationship: "OWNED", counts: {} },
    "siteRecords:keywordRecord": record,
    "siteGoogle:searchPositions": positions,
    "siteAngles:keywordAngle": fromAi,
  }));
  render(<SiteKeywordPage />);
}

/**
 * What the Fan-out queries table left to the page each row opens (Anthony,
 * 2026-09-29): the question it answered, who searched it, how often, its
 * other wordings, what the searcher wants and the site's page for it.
 */
describe("a search's own page, as a fan-out query", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
  });

  it("says in the header, under the title, why it was checked once — no box repeating it", () => {
    open(null);
    const heading = screen.getByRole("heading", { name: "ai consultants for smes in london uk" });
    const sentence = screen.getByText("sites.keywordRecord.checkedOnceNotice 29 Sept 2026");

    expect(heading.closest(".border-b")).toContainElement(sentence);
    expect(heading.parentElement).toContainElement(screen.getByText("sites.keywordRecord.checkedOncePill"));
    expect(screen.getAllByText(/checkedOnceNotice/)).toHaveLength(1);
  });

  it("says where the search came from in the AI's answers", () => {
    open(FROM_AI);
    expect(screen.getByText("sites.keywordRecord.fromAi.title")).toBeInTheDocument();
    expect(screen.getByText("“who are good ai consultants for my SME in London, UK”")).toBeInTheDocument();
    expect(screen.getByText("sites.keywordRecord.fromAi.timesSeenValue 4 29 Sept 2026")).toBeInTheDocument();
    expect(screen.getByText("“AI consultants SME London UK”")).toBeInTheDocument();
    expect(screen.getByText("sites.keywordRecord.fromAi.page")).toBeInTheDocument();
  });

  it("shows each answer that ran the search as a closed row, opening to who it named and then the answer", () => {
    open(FROM_AI);
    expect(screen.getByText("sites.keywordRecord.fromAi.mentionedNo 1")).toBeInTheDocument();
    const row = screen.getByRole("button", { name: /fromAi\.answerTitle/ });
    expect(row).toHaveAttribute("aria-expanded", "false");
    // Who it named is said inside the open answer, not on the closed row (Anthony, 2026-09-29).
    expect(screen.queryByText("sites.keywordRecord.fromAi.you.NOT_NAMED ronins.co.uk")).not.toBeInTheDocument();

    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(row).not.toHaveTextContent("ronins.co.uk");
    expect(screen.getByText("sites.keywordRecord.fromAi.you.NOT_NAMED ronins.co.uk")).toBeInTheDocument();
    expect(screen.getByText("sites.keywordRecord.fromAi.rival.RECOMMENDED lightflows.co.uk")).toBeInTheDocument();
    const competitor = screen.getByText("Lightflows");
    // A competitor is picked out in its own colour, apart from the site's own names.
    expect(competitor.closest("mark")?.className).toContain("bg-warning");
  });

  it("an answer older than the 90 days its wording is kept opens to who it named, and says the wording is kept 90 days (B2)", () => {
    open({ ...FROM_AI, answers: [{ ...FROM_AI.answers[0], day: "2026-06-01", text: null }] });
    const row = screen.getByRole("button", { name: /fromAi\.answerTitle/ });
    expect(row).toHaveTextContent("sites.aiAnswers.wordingNotKept");

    fireEvent.click(row);
    expect(screen.getByText("sites.keywordRecord.fromAi.rival.RECOMMENDED lightflows.co.uk")).toBeInTheDocument();
    expect(screen.getAllByText("sites.aiAnswers.wordingNotKept")).toHaveLength(1);
    expect(screen.queryByText("Lightflows")).not.toBeInTheDocument();
  });

  it("a search last checked before the 90 days Google's full page is kept shows the website's position then, and says so (B3)", () => {
    open(null, {
      ...RECORD,
      checkedOnce: null,
      tracked: { isActive: false, lastPosition: 3, bestPosition: 3, firstCheckedDay: "2026-06-01", lastCheckedDay: "2026-06-01" },
      serpNotKept: { day: "2026-06-01", position: 3 },
    });
    expect(screen.getByText("sites.keywordRecord.serp.title")).toBeInTheDocument();
    expect(screen.getByText(/^sites\.keywordRecord\.serp\.checked /)).toBeInTheDocument();
    expect(screen.getByText("sites.keywordRecord.serp.pageNotKept")).toBeInTheDocument();
    expect(screen.queryByText("sites.keywordRecord.serp.thisWebsite")).not.toBeInTheDocument();
  });

  it("a day by day chart reaching back past the 90 days says where it turns to a check a week (B1)", () => {
    open(null, RECORD, [{
      keyword: "carp rods",
      points: [{ day: "2026-09-27", lastDay: "2026-09-27", position: 16 }, { day: "2026-10-01", lastDay: "2026-10-01", position: 20 }],
      weeklyBefore: "2026-10-01",
    }]);
    expect(screen.getByText(/sites\.range\.weeklyBefore 1 Oct 2026/)).toBeInTheDocument();
  });

  it("shows Google Ads' figures for a search the keyword list does not measure", () => {
    open(null, { ...RECORD, bought: { volume: 30, cpc: 12.5, competition: "HIGH", trend: [10, 40, 20], day: "2026-09-29" } });
    expect(screen.getByText("sites.keywordRecord.about.competitionLevels.HIGH")).toBeInTheDocument();
    expect(screen.getByText("sites.keywordRecord.about.trendRange 10 40")).toBeInTheDocument();
    expect(screen.getByText("sites.keywordRecord.about.googleAds 29 Sept 2026")).toBeInTheDocument();
    expect(screen.queryByText("sites.keywordRecord.about.notInList")).not.toBeInTheDocument();
  });

  it("has no such box for a search the AIs never ran", () => {
    open(null);
    expect(screen.queryByText("sites.keywordRecord.fromAi.title")).not.toBeInTheDocument();
  });
});
