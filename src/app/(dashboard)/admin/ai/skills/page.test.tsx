import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GlobalAiSkillsPage from "./page";

vi.mock("../_components/AiWorkspaceNav", () => ({
  AiWorkspaceNav: () => <nav aria-label="AI workspace">AI workspace nav</nav>,
}));

vi.mock("../../agents/skills/page", () => ({
  // The catalogue no longer takes a base path: with the detail page gone there
  // is nowhere for it to link to, and the Skill Center lives at one route.
  // It now receives the nav and renders it below its own title.
  AgentSkillsCatalog: ({ nav }: { nav?: React.ReactNode }) => (
    <main>
      <h1>Skill Center</h1>
      {nav}
      Skill Center catalogue
    </main>
  ),
}));

describe("GlobalAiSkillsPage", () => {
  it("renders inside the Global AI tabbed workspace", () => {
    render(<GlobalAiSkillsPage />);

    expect(screen.getByLabelText("AI workspace")).toBeInTheDocument();
    expect(screen.getByText("Skill Center catalogue")).toBeInTheDocument();
  });

  /**
   * The tab bar belongs below the page title, as on every other screen in this
   * section. It used to be rendered by this route *before* the catalogue, which
   * put it above the title on this page alone.
   */
  it("puts the tab bar below the page title, not above it", () => {
    const { container } = render(<GlobalAiSkillsPage />);

    const heading = screen.getByRole("heading", { name: "Skill Center" });
    const nav = screen.getByLabelText("AI workspace");

    expect(heading.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container).toBeTruthy();
  });
});
