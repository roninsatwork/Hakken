import { render, screen } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { describe, expect, it, vi } from "vitest";
import { AdminRouteSubmenu } from "./AdminRouteSubmenu";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

describe("AdminRouteSubmenu", () => {
  const items = [
    { label: "Knowledge", href: "/admin/companies/company-1/ai/knowledge" },
    { label: "AI Rules", href: "/admin/companies/company-1/ai/rules" },
  ];

  it("marks the exact route active", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/companies/company-1/ai/knowledge");

    render(<AdminRouteSubmenu label="AI sections" items={items} />);

    expect(screen.getByRole("link", { name: "Knowledge" })).toHaveClass("bg-brand");
    expect(screen.getByRole("link", { name: "AI Rules" })).not.toHaveClass("bg-brand");
  });

  it("keeps the parent item active for nested routes", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/companies/company-1/ai/rules/rule-1");

    render(<AdminRouteSubmenu label="AI sections" items={items} />);

    expect(screen.getByRole("link", { name: "AI Rules" })).toHaveClass("bg-brand");
    expect(screen.getByRole("link", { name: "Knowledge" })).not.toHaveClass("bg-brand");
  });
});
