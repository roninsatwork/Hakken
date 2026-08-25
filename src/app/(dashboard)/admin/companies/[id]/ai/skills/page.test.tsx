import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePaginatedQuery } from "convex/react";
import { itBehavesLikeAStandardTableScreen } from "@/src/test/standardTableScreen";
import { pagedResult } from "@/src/test/screenMocks";
import CompanyAiSkillsPage from "./page";

/**
 * Worth knowing when this moves onto the shared list part: it writes its own
 * header row and header cells rather than using the kit's, same as the evals
 * screen.
 */

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", async () => (await import("@/src/test/screenMocks")).nextNavigation({ id: "company123" }));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());

const skills = [
  {
    _id: "skill_research",
    name: "Research Briefing",
    description: "Builds a sourced briefing on a company.",
    surfaces: ["COMPANY_CHAT"],
    updatedAt: Date.UTC(2026, 7, 14),
  },
  {
    _id: "skill_handover",
    name: "Approval Handoff",
    description: "Pauses anything risky for a person.",
    surfaces: ["WIDGET"],
    updatedAt: Date.UTC(2026, 7, 15),
  },
];

describe("CompanyAiSkillsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("as a standard table screen", () => {
    itBehavesLikeAStandardTableScreen({
      renderScreen: () => render(<CompanyAiSkillsPage />),
      withRows: (rows) => {
        vi.mocked(usePaginatedQuery).mockReturnValue(pagedResult(rows) as unknown as ReturnType<typeof usePaginatedQuery>);
      },
      sampleRows: skills,
      sampleRowText: "Research Briefing",
      emptyText: "No skills yet — add one from the Skill Center",
      searchPlaceholder: "Search skills by name",
    });
  });

  it("loads the import dialog only after the existing add action", async () => {
    vi.mocked(usePaginatedQuery).mockReturnValue(
      pagedResult(skills.slice(0, 1)) as unknown as ReturnType<typeof usePaginatedQuery>,
    );

    render(<CompanyAiSkillsPage />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add from Skill Center" }));

    expect(await screen.findByRole("dialog", { name: "Add skills" })).toBeInTheDocument();
  });

  it("loads the archive dialog only after the existing remove action", async () => {
    vi.mocked(usePaginatedQuery).mockReturnValue(
      pagedResult(skills) as unknown as ReturnType<typeof usePaginatedQuery>,
    );

    render(<CompanyAiSkillsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Remove Research Briefing" }));

    expect(await screen.findByRole("dialog", { name: "Remove skill" })).toBeInTheDocument();
  });
});
