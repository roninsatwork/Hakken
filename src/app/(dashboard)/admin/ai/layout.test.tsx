import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePathname } from "next/navigation";
import GlobalAiLayout from "./layout";

vi.mock("next/navigation", () => ({ usePathname: vi.fn() }));

vi.mock("./_components/AiFrame", () => ({
  AiFrame: ({ show = true, children }: { show?: boolean; children: ReactNode }) => (
    <div data-testid="frame" data-show={String(show)}>{children}</div>
  ),
}));

/**
 * Every AI screen sits inside the AI frame, with the menu down the left
 * (wiki-sonae-catch-up-plan-2026-11-21.md, S0). A page about one record, which
 * a list's row opens, stands on its own with its back link and no menu.
 */
describe("the Artificial Intelligence layout", () => {
  it.each([
    ["Running costs", "/admin/ai/usage/costs", "true"],
    ["the wiki's pages", "/admin/ai/knowledge", "true"],
    ["the wiki's map", "/admin/ai/knowledge/map", "true"],
    ["Add to the wiki", "/admin/ai/knowledge/add", "true"],
    ["Waiting on you", "/admin/ai/knowledge/waiting", "true"],
    ["Ask the wiki", "/admin/ai/knowledge/ask", "true"],
    ["the wiki's check-up", "/admin/ai/knowledge/checkup", "true"],
    ["Tools", "/admin/ai/tools", "true"],
    ["Tool servers", "/admin/ai/tool-servers", "true"],
    ["the website chat", "/admin/ai/widget", "true"],
    ["one rule", "/admin/ai/rules/rule123", "false"],
    ["one wiki page", "/admin/ai/knowledge/page123", "false"],
    ["a new goal", "/admin/ai/knowledge/new-goal", "false"],
    ["one model", "/admin/ai/models/model123", "false"],
    ["one connector", "/admin/ai/tools/connectors/gmail", "false"],
  ])("frames %s: %s", (_page, pathname, shown) => {
    vi.mocked(usePathname).mockReturnValue(pathname);
    render(<GlobalAiLayout><div>page</div></GlobalAiLayout>);

    expect(screen.getByTestId("frame")).toHaveAttribute("data-show", shown);
    expect(screen.getByText("page")).toBeInTheDocument();
  });
});
