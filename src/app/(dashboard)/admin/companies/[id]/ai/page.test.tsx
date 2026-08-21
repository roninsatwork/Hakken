import React from "react";
import { screen, within } from "@testing-library/react";
import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";
import CompanyAiOverviewPage from "./page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "company_1" }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const inheritedAreas = [
  { key: "knowledge", label: "Knowledge", state: "NOT_CONFIGURED", summary: "No documents added.", href: "/ai/knowledge" },
  { key: "widget", label: "Widget", state: "NOT_CONFIGURED", summary: "No widget for this company.", href: "/widget" },
  { key: "instructions", label: "Instructions", state: "NOT_CONFIGURED", summary: "Uses the platform instructions.", href: "/ai/prompt" },
  { key: "modelRouting", label: "Model routing", state: "NOT_CONFIGURED", summary: "All 9 jobs use the platform's model.", href: "/ai/models" },
  { key: "memory", label: "Memory", state: "NOT_CONFIGURED", summary: "Nothing remembered yet.", href: "/ai/memory" },
  { key: "skills", label: "Skills", state: "NOT_CONFIGURED", summary: "None switched on.", href: "/ai/skills" },
  { key: "checks", label: "Checks", state: "NOT_CONFIGURED", summary: "No checks written for this company.", href: "/ai/evals" },
  { key: "drift", label: "Drift", state: "NOT_CONFIGURED", summary: "Nothing to track until there are checks.", href: "/ai/evals" },
];

function readinessFor(areas: typeof inheritedAreas) {
  const needsAttention = areas.filter((area) => area.state === "NEEDS_ATTENTION");
  return {
    companyName: "Test Co",
    state: needsAttention.length > 0 ? "NEEDS_ATTENTION" : "READY",
    needsAttentionCount: needsAttention.length,
    configuredCount: areas.filter((area) => area.state === "SET_HERE").length,
    areas,
  };
}

function mockReadiness(areas: typeof inheritedAreas) {
  vi.mocked(useQuery).mockReturnValue(readinessFor(areas) as unknown as ReturnType<typeof useQuery>);
}

describe("CompanyAiOverviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * The fault this guards against.
   *
   * A company does not have to configure any of this — it inherits the
   * platform's setup, and for most companies that is the right answer forever.
   * The screen this replaces counted every empty area as a gap, so a workspace
   * that was working perfectly read 60% and listed things to "fix" that were
   * never missing.
   */
  it("reads ready when a company inherits everything", () => {
    mockReadiness(inheritedAreas);
    render(<CompanyAiOverviewPage />);

    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("· nothing needs attention")).toBeInTheDocument();

    // Absence is never ranked as something to fix.
    expect(screen.queryByText("Fix these first")).not.toBeInTheDocument();
    // And it is never described as a warning.
    expect(screen.queryByText("Needs attention")).not.toBeInTheDocument();
    expect(screen.getAllByText("Not configured")).toHaveLength(8);
  });

  /**
   * The headline is taken from the list beneath it. The old screen computed its
   * percentage from five areas and its reasons from nine, so it could rank
   * something first that had no effect on the number beside it.
   */
  it("counts exactly the areas the table shows as needing attention", () => {
    mockReadiness([
      {
        key: "skills",
        label: "Skills",
        state: "NEEDS_ATTENTION",
        summary: "1 switched-on skill is missing the tools it needs.",
        action: "Finish setting them up",
        href: "/ai/skills",
      },
      ...inheritedAreas.filter((area) => area.key !== "skills"),
    ] as typeof inheritedAreas);
    render(<CompanyAiOverviewPage />);

    expect(screen.getByText("· 1 of 8 areas")).toBeInTheDocument();

    const table = screen.getByRole("table");
    expect(within(table).getAllByText("Needs attention")).toHaveLength(1);
    expect(screen.getByText("Fix these first")).toBeInTheDocument();
    // Once in the ranked list, once in the table of everything.
    expect(screen.getAllByText("1 switched-on skill is missing the tools it needs.")).toHaveLength(2);
    expect(screen.getByText("Finish setting them up")).toBeInTheDocument();
  });

  it("sends each area to the screen that fixes it", () => {
    mockReadiness(inheritedAreas);
    render(<CompanyAiOverviewPage />);

    expect(screen.getByRole("link", { name: "Model routing" })).toHaveAttribute(
      "href",
      "/admin/companies/company_1/ai/models"
    );
    expect(screen.getByRole("link", { name: "Widget" })).toHaveAttribute(
      "href",
      "/admin/companies/company_1/widget"
    );
  });

  it("shows a loading row rather than blanking the page", () => {
    vi.mocked(useQuery).mockReturnValue(undefined as unknown as ReturnType<typeof useQuery>);
    render(<CompanyAiOverviewPage />);

    // The old page rendered nothing at all until the slowest of thirteen
    // queries returned.
    expect(screen.getByText("Company AI")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});
