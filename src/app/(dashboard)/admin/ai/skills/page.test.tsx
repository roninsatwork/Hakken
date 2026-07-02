import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GlobalAiSkillsPage from "./page";

vi.mock("../_components/AiWorkspaceNav", () => ({
  AiWorkspaceNav: () => <nav aria-label="AI workspace">AI workspace nav</nav>,
}));

vi.mock("../../agents/skills/page", () => ({
  AgentSkillsCatalog: ({ basePath }: { basePath: string }) => (
    <main data-base-path={basePath}>Skill Center catalogue</main>
  ),
}));

describe("GlobalAiSkillsPage", () => {
  it("renders inside the Global AI tabbed workspace", () => {
    render(<GlobalAiSkillsPage />);

    expect(screen.getByLabelText("AI workspace")).toBeInTheDocument();
    expect(screen.getByText("Skill Center catalogue")).toHaveAttribute("data-base-path", "/admin/ai/skills");
  });
});
