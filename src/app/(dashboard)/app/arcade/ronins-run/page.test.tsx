import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { beforeEach, describe, vi } from "vitest";
import { usePaginatedQuery } from "convex/react";
import { itBehavesLikeAStandardTableScreen } from "@/src/test/standardTableScreen";
import { pagedResult } from "@/src/test/screenMocks";
import RoninArcadePage from "./page";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/navigation", async () => (await import("@/src/test/screenMocks")).nextNavigation());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());

/*
  This page draws the app header itself rather than getting it from a layout,
  and the header pulls in sign-out, theme and the whole system-settings tree.
  None of that is the list under test, so the header is stubbed rather than
  wiring four more providers into every screen test that never needed them.
*/
vi.mock("@/src/ui/components/layout/Header", () => ({
  default: () => <header />,
}));

// The arcade loads a display font through next/font, which needs the Next build
// pipeline and is not available under vitest.
vi.mock("next/font/google", () => ({
  Press_Start_2P: () => ({ className: "font-arcade", style: { fontFamily: "monospace" } }),
}));

const scores = [
  {
    _id: "score_top",
    userName: "Anthony Basker",
    userAvatar: undefined,
    score: 41200,
    playedAt: Date.UTC(2026, 7, 15, 18, 30),
  },
  {
    _id: "score_second",
    userName: "Sam Reed",
    userAvatar: undefined,
    score: 30150,
    playedAt: Date.UTC(2026, 7, 14, 20, 10),
  },
];

describe("RoninArcadePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("as a standard table screen", () => {
    itBehavesLikeAStandardTableScreen({
      renderScreen: () => render(<RoninArcadePage />),
      withRows: (rows) => {
        vi.mocked(usePaginatedQuery).mockReturnValue(pagedResult(rows) as unknown as ReturnType<typeof usePaginatedQuery>);
      },
      sampleRows: scores,
      sampleRowText: "Anthony Basker",
      emptyText: "arcade.emptyScores",
      searchPlaceholder: "arcade.searchPlaceholder",
    });
  });
});
