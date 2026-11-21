import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GlobalAiSkillsPage from "./page";

vi.mock("../../agents/skills/page", () => ({
  // The catalogue no longer takes a base path: with the detail page gone there
  // is nowhere for it to link to, and the Skill Center lives at one route.
  AgentSkillsCatalog: () => (
    <main>
      <h1>Skill Center</h1>
      Skill Center catalogue
    </main>
  ),
}));

describe("GlobalAiSkillsPage", () => {
  /**
   * The AI section's frame draws the menu down the left (wiki-sonae-catch-up-
   * plan-2026-11-21.md, S0), so the page draws the catalogue and no tab row.
   */
  it("renders the catalogue with no tab row of its own", () => {
    render(<GlobalAiSkillsPage />);

    expect(screen.getByRole("heading", { name: "Skill Center" })).toBeInTheDocument();
    expect(screen.getByText("Skill Center catalogue")).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});
