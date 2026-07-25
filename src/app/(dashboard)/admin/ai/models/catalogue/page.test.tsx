import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import AIModelCataloguePage from "./page";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/admin/ai/models/catalogue"),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
  })),
}));

vi.mock("next-intl", () => ({
  useTranslations: vi.fn(() => (key: string) => {
    const translations: Record<string, string> = {
      title: "AI Models",
      subtitle: "Manage model availability.",
      "empty.title": "No models found",
    };
    return translations[key] || key;
  }),
}));

vi.mock("@/src/hooks/useDebounce", () => ({
  default: (value: string) => value,
}));

describe("AIModelCataloguePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockReturnValue({
      data: [],
      totalCount: 0,
      totalPages: 1,
      page: 1,
    });
    vi.mocked(useMutation).mockReturnValue(vi.fn().mockResolvedValue({}) as unknown as ReturnType<typeof useMutation>);
  });

  function latestModelQueryArgs() {
    return vi.mocked(useQuery).mock.calls
      .map((call) => call[1])
      .findLast((args) => args && typeof args === "object" && "page" in args);
  }

  it("defaults to the active Convex query filter", () => {
    render(<AIModelCataloguePage />);

    expect(latestModelQueryArgs()).toMatchObject({
      searchTerm: "",
      statusFilter: "active",
      providerFilter: "all",
      capabilityFilter: "all",
      useCaseFilter: "all",
      page: 1,
    });
  });

  it("sends active and inactive status filters exactly when selected", () => {
    render(<AIModelCataloguePage />);

    fireEvent.click(screen.getByRole("button", { name: "Active" }));
    expect(latestModelQueryArgs()).toMatchObject({
      statusFilter: "active",
      page: 1,
    });

    fireEvent.click(screen.getByRole("button", { name: "Inactive" }));
    expect(latestModelQueryArgs()).toMatchObject({
      statusFilter: "inactive",
      page: 1,
    });
    expect(screen.queryByRole("button", { name: "All" })).not.toBeInTheDocument();
  });

  it("sends capability and use-case filters when selected", () => {
    render(<AIModelCataloguePage />);

    fireEvent.change(screen.getByLabelText("Capability filter"), {
      target: { value: "tool-calling" },
    });
    expect(latestModelQueryArgs()).toMatchObject({
      capabilityFilter: "tool-calling",
      page: 1,
    });

    fireEvent.change(screen.getByLabelText("Use case filter"), {
      target: { value: "agent" },
    });
    expect(latestModelQueryArgs()).toMatchObject({
      capabilityFilter: "tool-calling",
      useCaseFilter: "agent",
      page: 1,
    });
  });

  it("does not render provider management or platform defaults on the catalogue screen", () => {
    render(<AIModelCataloguePage />);

    expect(screen.getByPlaceholderText("Search model names or IDs...")).toBeInTheDocument();
    expect(screen.queryByText("Platform Defaults")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sync" })).not.toBeInTheDocument();
  });

  it("flags an enabled model that has no pricing configured", () => {
    // Without per-token rates the runtime cannot measure spend, so the cost cap
    // never fires and agents on that model are held to a smaller budget. That is
    // invisible unless the catalogue says so.
    const models = [
      { _id: "m1", modelId: "priced", providerModelId: "priced", displayName: "Priced Model",
        providerKey: "google", isEnabled: true, isDefault: false, standardInputCostBelow200k: 1 },
      { _id: "m2", modelId: "free", providerModelId: "free", displayName: "Unpriced Model",
        providerKey: "google", isEnabled: true, isDefault: false },
      { _id: "m3", modelId: "off", providerModelId: "off", displayName: "Disabled Model",
        providerKey: "google", isEnabled: false, isDefault: false },
    ];
    vi.mocked(useQuery).mockImplementation(((_query: unknown, args: unknown) =>
      args && typeof args === "object" && "page" in args
        ? { data: models, totalCount: models.length, totalPages: 1, page: 1 }
        : []) as unknown as typeof useQuery);

    render(<AIModelCataloguePage />);

    const warnings = screen.getAllByText("No pricing");
    expect(warnings).toHaveLength(1);
    // The warning belongs to the unpriced, enabled model — not the priced one
    // and not one that is switched off and cannot be costing anything.
    expect(warnings[0].closest("tr")?.textContent).toContain("Unpriced Model");
  });
});
