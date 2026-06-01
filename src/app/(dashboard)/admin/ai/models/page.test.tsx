import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";
import AIModelsPage from "./page";

vi.mock("next/navigation", () => ({
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

  it("omits statusFilter from the Convex query when All is selected", () => {
    render(<AIModelsPage />);

    const queryArgs = vi.mocked(useQuery).mock.calls.at(-1)?.[1];

    expect(queryArgs).toMatchObject({
      searchTerm: "",
      page: 1,
    });
    expect(queryArgs).not.toHaveProperty("statusFilter");
  });

  it("sends active and inactive status filters exactly when selected", () => {
    render(<AIModelsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Active" }));
    expect(vi.mocked(useQuery).mock.calls.at(-1)?.[1]).toMatchObject({
      statusFilter: "active",
      page: 1,
    });

    fireEvent.click(screen.getByRole("button", { name: "Inactive" }));
    expect(vi.mocked(useQuery).mock.calls.at(-1)?.[1]).toMatchObject({
      statusFilter: "inactive",
      page: 1,
    });

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(vi.mocked(useQuery).mock.calls.at(-1)?.[1]).not.toHaveProperty("statusFilter");
  });
});
