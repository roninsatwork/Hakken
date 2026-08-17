import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Activity, Settings } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { DetailLayout } from "./DetailLayout";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
  useSearchParams: vi.fn(),
}));

describe("DetailLayout", () => {
  const tabs = [
    { label: "Dashboard", href: "/admin/companies/company-1", icon: Activity },
    { label: "Settings", href: "/admin/companies/company-1/settings", icon: Settings },
  ];

  it("renders a shared detail header, actions, tabs, and content", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/companies/company-1/settings");
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as never);

    render(
      <DetailLayout
        title="Acme Workspace"
        description="Manage workspace settings."
        leading={<div aria-label="Workspace icon" />}
        actions={<button type="button">Back</button>}
        tabs={tabs}
        rootHref="/admin/companies/company-1"
      >
        <section>Detail body</section>
      </DetailLayout>
    );

    expect(screen.getByRole("heading", { name: "Acme Workspace" })).toBeInTheDocument();
    expect(screen.getByText("Manage workspace settings.")).toBeInTheDocument();
    expect(screen.getByLabelText("Workspace icon")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toHaveClass("border-brand");
    expect(screen.getByText("Detail body")).toBeInTheDocument();
  });
});
