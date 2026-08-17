import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePaginatedQuery, useQuery } from "convex/react";
import { itBehavesLikeAStandardTableScreen } from "@/src/test/standardTableScreen";
import { pagedResult } from "@/src/test/screenMocks";
import CompanyTeamPage from "./page";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/navigation", async () => (await import("@/src/test/screenMocks")).nextNavigation());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());

const team = [
  {
    _id: "user_anthony",
    name: "Anthony Basker",
    email: "anthony@ronins.co.uk",
    role: "ADMIN",
    createdAt: Date.UTC(2026, 3, 2),
  },
  {
    _id: "user_sam",
    name: "Sam Reed",
    email: "sam@ronins.co.uk",
    role: "USER",
    createdAt: Date.UTC(2026, 5, 19),
  },
];

describe("CompanyTeamPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockReturnValue([]);
  });

  describe("as a standard table screen", () => {
    itBehavesLikeAStandardTableScreen({
      renderScreen: () => render(<CompanyTeamPage />),
      withRows: (rows) => {
        vi.mocked(usePaginatedQuery).mockReturnValue(pagedResult(rows) as unknown as ReturnType<typeof usePaginatedQuery>);
      },
      sampleRows: team,
      sampleRowText: "Anthony Basker",
      emptyText: "No one found",
    });
  });

  // This screen shipped with two sentences of Italian on it — the empty panel
  // said "Nessun Risultato" to everyone, in every language.
  it("speaks English when a search finds nobody", () => {
    vi.mocked(usePaginatedQuery).mockReturnValue(pagedResult([]) as unknown as ReturnType<typeof usePaginatedQuery>);

    render(<CompanyTeamPage />);

    expect(document.body.textContent).not.toContain("Nessun");
    expect(document.body.textContent).not.toContain("La query di ricerca");
  });
});
