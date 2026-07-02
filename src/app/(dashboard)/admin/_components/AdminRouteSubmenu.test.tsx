import { fireEvent, render, screen } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminRouteSubmenu } from "./AdminRouteSubmenu";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

describe("AdminRouteSubmenu", () => {
  const items = [
    { label: "Overview", href: "/admin/companies/company-1/ai" },
    { label: "Knowledge", href: "/admin/companies/company-1/ai/knowledge" },
    { label: "AI Rules", href: "/admin/companies/company-1/ai/rules" },
  ];

  function mockWideLayout(matches: boolean) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  }

  beforeEach(() => {
    mockWideLayout(true);
  });

  it("marks the exact route active", async () => {
    vi.mocked(usePathname).mockReturnValue("/admin/companies/company-1/ai/knowledge");

    render(<AdminRouteSubmenu label="AI sections" items={items} />);

    expect(await screen.findByRole("link", { name: "Knowledge" })).toHaveClass("bg-brand");
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveClass("bg-brand");
    expect(screen.getByRole("link", { name: "AI Rules" })).not.toHaveClass("bg-brand");
  });

  it("keeps the parent item active for nested routes", async () => {
    vi.mocked(usePathname).mockReturnValue("/admin/companies/company-1/ai/rules/rule-1");

    render(<AdminRouteSubmenu label="AI sections" items={items} />);

    expect(await screen.findByRole("link", { name: "AI Rules" })).toHaveClass("bg-brand");
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveClass("bg-brand");
    expect(screen.getByRole("link", { name: "Knowledge" })).not.toHaveClass("bg-brand");
  });

  it("uses the deepest route match when a parent overview route is also present", async () => {
    vi.mocked(usePathname).mockReturnValue("/admin/companies/company-1/ai/knowledge/document-1");

    render(<AdminRouteSubmenu label="AI sections" items={items} />);

    expect(await screen.findByRole("link", { name: "Knowledge" })).toHaveClass("bg-brand");
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveClass("bg-brand");
  });

  it("uses a compact section switcher below wide desktop", () => {
    mockWideLayout(false);
    vi.mocked(usePathname).mockReturnValue("/admin/companies/company-1/ai/knowledge");

    render(<AdminRouteSubmenu compactLabel="AI section" label="AI sections" items={items} />);

    const trigger = screen.getByRole("button", { name: "AI section: Knowledge" });
    expect(trigger).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Overview" })).not.toBeInTheDocument();

    fireEvent.click(trigger);

    expect(screen.getByRole("link", { name: "Knowledge" })).toHaveClass("bg-brand");
    expect(screen.getByRole("link", { name: "AI Rules" })).toBeInTheDocument();
  });
});
