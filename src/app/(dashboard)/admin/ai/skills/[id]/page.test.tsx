import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GlobalAiSkillDetailPage from "./page";

vi.mock("../../_components/AiWorkspaceNav", () => ({
  AiWorkspaceNav: () => <nav aria-label="AI workspace">AI workspace nav</nav>,
}));

vi.mock("../../../agents/skills/[id]/page", () => ({
  AgentSkillDetail: ({ basePath }: { basePath: string }) => (
    <main data-base-path={basePath}>Skill Center detail</main>
  ),
}));

describe("GlobalAiSkillDetailPage", () => {
  it("renders inside the Global AI tabbed workspace", () => {
    render(<GlobalAiSkillDetailPage />);

    expect(screen.getByLabelText("AI workspace")).toBeInTheDocument();
    expect(screen.getByText("Skill Center detail")).toHaveAttribute("data-base-path", "/admin/ai/skills");
  });
});
