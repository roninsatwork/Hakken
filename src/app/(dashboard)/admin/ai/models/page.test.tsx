import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";
import AIModelsPage from "./page";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/admin/ai/models"),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
  })),
}));

vi.mock("next-intl", () => ({
  useTranslations: vi.fn(() => (key: string) => {
    const translations: Record<string, string> = {
      title: "AI Models",
      subtitle: "Manage model availability.",
      "syncButton.idle": "Sync Models",
      "syncButton.syncing": "Syncing...",
      "empty.title": "No models found",
      "empty.button.idle": "Sync Models",
      "empty.button.syncing": "Syncing...",
    };
    return translations[key] || key;
  }),
}));

vi.mock("@/src/hooks/useDebounce", () => ({
  default: (value: string) => value,
}));

describe("AIModelsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockReturnValue({
      data: [],
      totalCount: 0,
      totalPages: 1,
      page: 1,
    });
    vi.mocked(useMutation).mockReturnValue(vi.fn().mockResolvedValue({}) as unknown as ReturnType<typeof useMutation>);
    vi.mocked(useAction).mockReturnValue(vi.fn().mockResolvedValue({}) as unknown as ReturnType<typeof useAction>);
  });

  function latestModelQueryArgs() {
    return vi.mocked(useQuery).mock.calls
      .map((call) => call[1])
      .findLast((args) => args && typeof args === "object" && "page" in args);
  }

  it("defaults to the active Convex query filter", () => {
    render(<AIModelsPage />);

    const queryArgs = latestModelQueryArgs();

    expect(queryArgs).toMatchObject({
      searchTerm: "",
      statusFilter: "active",
      providerFilter: "all",
      capabilityFilter: "all",
      useCaseFilter: "all",
      page: 1,
    });
  });

  it("sends active and inactive status filters exactly when selected", () => {
    render(<AIModelsPage />);

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
    render(<AIModelsPage />);

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

  it("switches between model catalogue and platform defaults tabs", () => {
    render(<AIModelsPage />);

    expect(screen.getByPlaceholderText("Search model names or IDs...")).toBeInTheDocument();
    expect(screen.queryByText("No default rows loaded yet.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Platform Defaults" }));

    expect(screen.getByText("No default rows loaded yet.")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Search model names or IDs...")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Model Catalogue" }));

    expect(screen.getByPlaceholderText("Search model names or IDs...")).toBeInTheDocument();
  });
});
