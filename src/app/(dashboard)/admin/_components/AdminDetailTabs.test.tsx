import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Activity, Settings } from "lucide-react";
import { AdminDetailTabs } from "./AdminDetailTabs";
import { usePathname } from "next/navigation";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

describe("AdminDetailTabs", () => {
  const tabs = [
    { label: "Dashboard", href: "/admin/agents/agent-1", icon: Activity },
    { label: "Settings", href: "/admin/agents/agent-1/settings", icon: Settings },
  ];

  it("marks only the root tab active on the exact root route", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/agents/agent-1");

    render(<AdminDetailTabs tabs={tabs} rootHref="/admin/agents/agent-1" />);

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveClass("border-brand");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveClass("border-transparent");
  });

  it("marks nested tabs active by prefix", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/agents/agent-1/settings");

    render(<AdminDetailTabs tabs={tabs} rootHref="/admin/agents/agent-1" />);

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveClass("border-transparent");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveClass("border-brand");
  });
});
