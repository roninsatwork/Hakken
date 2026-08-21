import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import AIModelCataloguePage from "./page";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/admin/ai/models/catalogue"),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
  })),
}));

vi.mock("@/src/hooks/useDebounce", () => ({
  default: (value: string) => value,
}));

// The catalogue pages in the database now, so the screen drives
// `usePaginatedQuery` rather than passing a page number to a query.
function mockPaginatedModels(results: unknown[] = []) {
  vi.mocked(usePaginatedQuery).mockReturnValue({
    results,
    status: "Exhausted",
    isLoading: false,
    loadMore: vi.fn(),
  } as unknown as ReturnType<typeof usePaginatedQuery>);
}

describe("AIModelCataloguePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPaginatedModels();
    vi.mocked(useQuery).mockReturnValue(undefined);
    vi.mocked(useMutation).mockReturnValue(vi.fn().mockResolvedValue({}) as unknown as ReturnType<typeof useMutation>);
  });

  function latestModelQueryArgs() {
    return vi.mocked(usePaginatedQuery).mock.calls.map((call) => call[1]).at(-1) as
      | Record<string, unknown>
      | undefined;
  }

  it("defaults to the active Convex query filter", () => {
    render(<AIModelCataloguePage />);

    expect(latestModelQueryArgs()).toMatchObject({
      searchTerm: "",
      statusFilter: "active",
      providerFilter: "all",
    });
  });

  it("sends active and inactive status filters exactly when selected", () => {
    render(<AIModelCataloguePage />);

    fireEvent.click(screen.getByRole("button", { name: "Active" }));
    expect(latestModelQueryArgs()).toMatchObject({ statusFilter: "active" });

    fireEvent.click(screen.getByRole("button", { name: "Inactive" }));
    expect(latestModelQueryArgs()).toMatchObject({ statusFilter: "inactive" });
    expect(screen.queryByRole("button", { name: "All" })).not.toBeInTheDocument();
  });

  it("no longer filters by capability or use case", () => {
    // Both dropdowns went with the two columns they narrowed. They were
    // provider-synced metadata nobody could act on from this screen, and they
    // cost five to eight chips a row.
    render(<AIModelCataloguePage />);

    expect(screen.queryByLabelText("Capability filter")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Use case filter")).not.toBeInTheDocument();
    expect(latestModelQueryArgs()).not.toHaveProperty("capabilityFilter");
    expect(latestModelQueryArgs()).not.toHaveProperty("useCaseFilter");
  });

  it("does not render provider management or platform defaults on the catalogue screen", () => {
    render(<AIModelCataloguePage />);

    expect(screen.getByPlaceholderText("Search models by name")).toBeInTheDocument();
    expect(screen.queryByText("Platform Defaults")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sync" })).not.toBeInTheDocument();
  });

  it("says in one word whether a model has a price", () => {
    // A column of its own, rather than a warning badge on the name and a banner
    // above the table. Both of those were additions nobody asked for, and they
    // are what made the table feel full again.
    const models = [
      { _id: "m1", modelId: "priced", providerModelId: "priced", displayName: "Priced Model",
        providerKey: "google", isEnabled: true, isDefault: false, standardInputCostBelow200k: 1 },
      { _id: "m2", modelId: "free", providerModelId: "free", displayName: "Unpriced Model",
        providerKey: "google", isEnabled: true, isDefault: false },
    ];
    mockPaginatedModels(models);
    vi.mocked(useQuery).mockReturnValue({ defaults: [] } as unknown as ReturnType<typeof useQuery>);

    render(<AIModelCataloguePage />);

    expect(screen.queryByText(/no price/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/smaller budget/i)).not.toBeInTheDocument();

    const headers = screen.getAllByRole("columnheader").map((cell) => cell.textContent);
    expect(headers).toEqual(["Model name", "Provider", "Pricing", "Default", "Active"]);

    expect(screen.getByText("Priced Model").closest("tr")?.textContent)
      .toBe("Priced ModelpricedGoogle Vertex AIAddedNoActive");
    expect(screen.getByText("Unpriced Model").closest("tr")?.textContent)
      .toBe("Unpriced ModelfreeGoogle Vertex AIMissingNoActive");
  });

  /**
   * "Default" must mean the model that actually runs.
   *
   * The catalogue used to star `isDefault`, which the runtime only consults
   * after an agent's own choice, the company's choice for the job, and the
   * platform's choice for the job have all failed. So the star could sit on a
   * model handling nothing while the model doing all the work carried no mark.
   * These fixtures deliberately disagree — the starred model is not a platform
   * default, and the platform default is not starred.
   */
  it("answers 'default' from the jobs a model actually handles, not the legacy flag", () => {
    const models = [
      { _id: "m1", modelId: "working-model", providerModelId: "working-model", displayName: "Working Model",
        providerKey: "google", isEnabled: true, isDefault: false, standardInputCostBelow200k: 1 },
      { _id: "m2", modelId: "starred-model", providerModelId: "starred-model", displayName: "Starred Model",
        providerKey: "google", isEnabled: true, isDefault: true, standardInputCostBelow200k: 1 },
    ];
    const globalDefaults = {
      useCases: ["chat", "title", "router"],
      defaults: [
        { useCase: "chat", default: { modelId: "working-model" } },
        { useCase: "title", default: { modelId: "working-model" } },
        { useCase: "router", default: null },
      ],
    };
    mockPaginatedModels(models);
    vi.mocked(useQuery).mockReturnValue(globalDefaults as unknown as ReturnType<typeof useQuery>);

    render(<AIModelCataloguePage />);

    const workingRow = screen.getByText("Working Model").closest("tr");
    const starredRow = screen.getByText("Starred Model").closest("tr");

    // The model handling real jobs says yes — and only yes. Naming the jobs in
    // the cell made one row three times taller than its neighbours, so they moved
    // to the hover text.
    expect(workingRow?.textContent).toContain("Yes");
    expect(workingRow?.textContent).not.toContain("Chat, Title");
    expect(screen.getByTitle("Handles Chat, Title")).toBeInTheDocument();

    // The one carrying the legacy flag but handling nothing says no.
    expect(starredRow?.textContent).toContain("No");
    expect(starredRow?.textContent).not.toContain("Yes");
  });

  it("does not offer a control that rewrites every platform default", () => {
    // "Make Default" read as marking a favourite and actually reassigned all ten
    // jobs at once, with no confirmation, from a hover-revealed row button. It
    // moved to the Defaults screen, where the rows it overwrites are visible.
    const models = [
      { _id: "m1", modelId: "some-model", providerModelId: "some-model", displayName: "Some Model",
        providerKey: "google", isEnabled: true, isDefault: false, standardInputCostBelow200k: 1 },
    ];
    mockPaginatedModels(models);
    vi.mocked(useQuery).mockReturnValue({ defaults: [] } as unknown as ReturnType<typeof useQuery>);

    render(<AIModelCataloguePage />);

    expect(screen.queryByRole("button", { name: /make default/i })).not.toBeInTheDocument();
  });
});
