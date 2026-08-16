import { fireEvent, render, screen } from "@testing-library/react";
import { usePathname, useSearchParams } from "next/navigation";
import { describe, expect, it, vi } from "vitest";
import { AiWorkspaceNav } from "./AiWorkspaceNav";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
  useSearchParams: vi.fn(),
}));

describe("AiWorkspaceNav", () => {
  it("renders grouped governance navigation with direct AI workspace links", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/ai/usage/costs");
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as never);

    render(<AiWorkspaceNav />);

    expect(screen.getByRole("link", { name: "Running Costs" })).toHaveAttribute("href", "/admin/ai/usage/costs");
    expect(screen.getByRole("link", { name: "Chat Logs" })).toHaveAttribute("href", "/admin/ai/usage/chat-logs");
    expect(screen.getByRole("link", { name: "Skill Center" })).toHaveAttribute("href", "/admin/ai/skills");
    // A company's wiki is never visible from the global menu (Anthony's
    // ruling, 2026-08-16): the only Wiki here is the platform's own, and it
    // lives in the Instructions dropdown, not the tab row.
    expect(screen.queryByRole("link", { name: "Wiki" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Instructions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Widget" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Models" })).toBeInTheDocument();

    expect(screen.queryByRole("link", { name: "Rules" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "System Prompt" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Global Knowledge" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Wiki" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Appearance" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Integration" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Providers" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Model Catalogue" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Defaults" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Instructions" }));

    expect(screen.getByRole("menuitem", { name: "Rules" })).toHaveAttribute("href", "/admin/ai/rules");
    expect(screen.getByRole("menuitem", { name: "System Prompt" })).toHaveAttribute("href", "/admin/ai/system-prompt");
    expect(screen.getByRole("menuitem", { name: "Wiki" })).toHaveAttribute("href", "/admin/ai/knowledge");

    fireEvent.click(screen.getByRole("button", { name: "Widget" }));

    expect(screen.queryByRole("menuitem", { name: "Rules" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Appearance" })).toHaveAttribute("href", "/admin/ai/widget");
    expect(screen.getByRole("menuitem", { name: "Welcome Screen" })).toHaveAttribute("href", "/admin/ai/widget?section=welcome-screen");
    expect(screen.getByRole("menuitem", { name: "Conversation Starters" })).toHaveAttribute("href", "/admin/ai/widget?section=conversation-starters");
    expect(screen.getByRole("menuitem", { name: "Greeting" })).toHaveAttribute("href", "/admin/ai/widget?section=greeting");
    expect(screen.getByRole("menuitem", { name: "Integration" })).toHaveAttribute("href", "/admin/ai/widget?section=integration");

    fireEvent.click(screen.getByRole("button", { name: "Models" }));

    expect(screen.queryByRole("menuitem", { name: "Integration" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Providers" })).toHaveAttribute("href", "/admin/ai/models/providers");
    expect(screen.getByRole("menuitem", { name: "Model Catalogue" })).toHaveAttribute("href", "/admin/ai/models/catalogue");
    expect(screen.getByRole("menuitem", { name: "Defaults" })).toHaveAttribute("href", "/admin/ai/models/defaults");

    expect(screen.queryByRole("link", { name: "Overview" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Usage" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Instructions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Knowledge" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Tools" })).not.toBeInTheDocument();
  });

  it("marks the Global AI skill center as active", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/ai/skills/skill_1");
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as never);

    render(<AiWorkspaceNav />);

    expect(screen.getByRole("link", { name: "Skill Center" })).toHaveClass("border-brand");
  });

  it("marks legacy and canonical governance routes as active", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/ai/system-prompt");
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as never);

    render(<AiWorkspaceNav />);

    const trigger = screen.getByRole("button", { name: "Instructions" });
    expect(trigger).toHaveClass("border-brand");

    fireEvent.click(trigger);

    expect(screen.getByRole("menuitem", { name: "System Prompt" })).toHaveClass("bg-brand");
  });

  it("marks model child and detail routes as active", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/ai/models/model_1");
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as never);

    render(<AiWorkspaceNav />);

    const trigger = screen.getByRole("button", { name: "Models" });
    expect(trigger).toHaveClass("border-brand");

    fireEvent.click(trigger);

    expect(screen.getByRole("menuitem", { name: "Model Catalogue" })).toHaveClass("bg-brand");
  });

  it("does not mark model section routes as catalogue detail routes", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/ai/models/defaults");
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as never);

    render(<AiWorkspaceNav />);

    fireEvent.click(screen.getByRole("button", { name: "Models" }));

    expect(screen.getByRole("menuitem", { name: "Defaults" })).toHaveClass("bg-brand");
    expect(screen.getByRole("menuitem", { name: "Model Catalogue" })).not.toHaveClass("bg-brand");
    expect(screen.getByRole("menuitem", { name: "Providers" })).not.toHaveClass("bg-brand");
  });

  it("marks widget query-string sections as active", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/ai/widget");
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams("section=integration") as never);

    render(<AiWorkspaceNav />);

    const trigger = screen.getByRole("button", { name: "Widget" });
    expect(trigger).toHaveClass("border-brand");

    fireEvent.click(trigger);

    expect(screen.getByRole("menuitem", { name: "Integration" })).toHaveClass("bg-brand");
    expect(screen.getByRole("menuitem", { name: "Appearance" })).not.toHaveClass("bg-brand");
  });
});
