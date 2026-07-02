import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import AIModelCataloguePage from "./page";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/admin/ai/models/catalogue"),
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
});
