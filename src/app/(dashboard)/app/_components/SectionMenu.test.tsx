import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SectionMenu } from "./SectionMenu";

/**
 * A section's side menu: a page lit as the one being read, or — as filters,
 * the Agents screen's (agents-and-clarity-plan.md, AG1) — one choice lit in
 * each group, and on a phone a drop-down a group.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const PAGES = [
  { id: "figures", label: "Figures", items: [{ id: "overview", label: "Overview", href: "/a" }, { id: "pages", label: "Pages", href: "/a/pages", count: "39" }] },
  { id: "settings", label: "Settings", items: [{ id: "connection", label: "Connection", href: "/a/connection" }] },
];
const FILTERS = [
  { id: "what", label: "What it does", items: [{ id: "what:all", label: "All agents", href: "/x", count: "37" }, { id: "what:collect", label: "Collecting data", href: "/x?what=collect", count: "4" }] },
  { id: "status", label: "Status", items: [{ id: "status:all", label: "Any status", href: "/x" }, { id: "status:draft", label: "Draft", href: "/x?status=draft", count: "0" }] },
];

describe("SectionMenu", () => {
  it("lights the page being read, and only it", () => {
    render(<SectionMenu label="Clarity" groups={PAGES} currentId="pages" openAtFirst={["figures", "settings"]} />);
    const menu = screen.getByRole("navigation", { name: "Clarity" });
    expect(within(menu).getByRole("link", { name: /Pages/ })).toHaveAttribute("aria-current", "page");
    expect(within(menu).getByRole("link", { name: /Overview/ })).not.toHaveAttribute("aria-current");
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
  });

  it("as filters, lights the choice in each group, and gives a phone a drop-down a group", () => {
    render(<SectionMenu label="Choose which agents" groups={FILTERS} currentId="" currentIds={["what:collect", "status:all"]} openAtFirst={["what", "status"]} />);
    const menu = screen.getByRole("navigation", { name: "Choose which agents" });
    expect(within(menu).getByRole("link", { name: /Collecting data/ })).toHaveAttribute("aria-current", "true");
    expect(within(menu).getByRole("link", { name: /Any status/ })).toHaveAttribute("aria-current", "true");
    expect(within(menu).getByRole("link", { name: /All agents/ })).not.toHaveAttribute("aria-current");
    const phone = screen.getAllByRole("combobox");
    expect(phone.map((select) => select.getAttribute("aria-label"))).toEqual(["What it does", "Status"]);
    expect((phone[0] as HTMLSelectElement).value).toBe("what:collect");
  });
});
