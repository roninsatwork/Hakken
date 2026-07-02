import { fireEvent, render, screen } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { describe, expect, it, vi } from "vitest";
import { AiWorkspaceNav } from "./AiWorkspaceNav";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

describe("AiWorkspaceNav", () => {
  it("renders grouped governance navigation with direct AI workspace links", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/ai/usage/costs");

    render(<AiWorkspaceNav />);

    expect(screen.getByRole("link", { name: "Running Costs" })).toHaveAttribute("href", "/admin/ai/usage/costs");
    expect(screen.getByRole("link", { name: "Chat Logs" })).toHaveAttribute("href", "/admin/ai/usage/chat-logs");
    expect(screen.getByRole("button", { name: "Governance" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Widget" })).toHaveAttribute("href", "/admin/ai/widget");
    expect(screen.getByRole("button", { name: "Models" })).toBeInTheDocument();

    expect(screen.queryByRole("link", { name: "Rules" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "System Prompt" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Global Knowledge" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Providers" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Model Catalogue" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Defaults" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Governance" }));

    expect(screen.getByRole("menuitem", { name: "Rules" })).toHaveAttribute("href", "/admin/ai/governance/rules");
    expect(screen.getByRole("menuitem", { name: "System Prompt" })).toHaveAttribute("href", "/admin/ai/governance/system-prompt");
    expect(screen.getByRole("menuitem", { name: "Global Knowledge" })).toHaveAttribute("href", "/admin/ai/knowledge");

    fireEvent.click(screen.getByRole("button", { name: "Models" }));

    expect(screen.queryByRole("menuitem", { name: "Rules" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Providers" })).toHaveAttribute("href", "/admin/ai/models/providers");
    expect(screen.getByRole("menuitem", { name: "Model Catalogue" })).toHaveAttribute("href", "/admin/ai/models/catalogue");
    expect(screen.getByRole("menuitem", { name: "Defaults" })).toHaveAttribute("href", "/admin/ai/models/defaults");

    expect(screen.queryByRole("link", { name: "Overview" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Usage" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Governance" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Knowledge" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Tools" })).not.toBeInTheDocument();
  });

  it("marks legacy and canonical governance routes as active", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/ai/system-prompt");

    render(<AiWorkspaceNav />);

    const trigger = screen.getByRole("button", { name: "Governance" });
    expect(trigger).toHaveClass("border-brand");

    fireEvent.click(trigger);

    expect(screen.getByRole("menuitem", { name: "System Prompt" })).toHaveClass("bg-brand");
  });

  it("marks model child and detail routes as active", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/ai/models/model_1");

    render(<AiWorkspaceNav />);

    const trigger = screen.getByRole("button", { name: "Models" });
    expect(trigger).toHaveClass("border-brand");

    fireEvent.click(trigger);

    expect(screen.getByRole("menuitem", { name: "Model Catalogue" })).toHaveClass("bg-brand");
  });

  it("does not mark model section routes as catalogue detail routes", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/ai/models/defaults");

    render(<AiWorkspaceNav />);

    fireEvent.click(screen.getByRole("button", { name: "Models" }));

    expect(screen.getByRole("menuitem", { name: "Defaults" })).toHaveClass("bg-brand");
    expect(screen.getByRole("menuitem", { name: "Model Catalogue" })).not.toHaveClass("bg-brand");
    expect(screen.getByRole("menuitem", { name: "Providers" })).not.toHaveClass("bg-brand");
  });
});
