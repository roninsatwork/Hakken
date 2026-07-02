import { render, screen } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { describe, expect, it, vi } from "vitest";
import { AiWorkspaceNav } from "./AiWorkspaceNav";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

describe("AiWorkspaceNav", () => {
  it("renders the original AI page headings as the secondary navigation", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/ai/usage/costs");

    render(<AiWorkspaceNav />);

    expect(screen.getByRole("link", { name: "Running Costs" })).toHaveAttribute("href", "/admin/ai/usage/costs");
    expect(screen.getByRole("link", { name: "Chat Logs" })).toHaveAttribute("href", "/admin/ai/usage/chat-logs");
    expect(screen.getByRole("link", { name: "Rules" })).toHaveAttribute("href", "/admin/ai/governance/rules");
    expect(screen.getByRole("link", { name: "System Prompt" })).toHaveAttribute("href", "/admin/ai/governance/system-prompt");
    expect(screen.getByRole("link", { name: "Global Knowledge" })).toHaveAttribute("href", "/admin/ai/knowledge");
    expect(screen.getByRole("link", { name: "Widget" })).toHaveAttribute("href", "/admin/ai/widget");
    expect(screen.getByRole("link", { name: "Models" })).toHaveAttribute("href", "/admin/ai/models");

    expect(screen.queryByRole("link", { name: "Overview" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Usage" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Governance" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Knowledge" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Tools" })).not.toBeInTheDocument();
  });

  it("marks legacy and canonical System Prompt routes as active", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/ai/system-prompt");

    render(<AiWorkspaceNav />);

    expect(screen.getByRole("link", { name: "System Prompt" })).toHaveClass("border-brand");
  });
});
