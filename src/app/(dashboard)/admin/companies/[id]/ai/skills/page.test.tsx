import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { beforeEach, describe, vi } from "vitest";
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
});
