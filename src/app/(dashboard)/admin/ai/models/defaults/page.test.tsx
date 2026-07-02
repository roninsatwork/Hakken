import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import AIModelDefaultsPage from "./page";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/admin/ai/models/defaults"),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

const models = [
  {
    _id: "model_1",
    modelId: "chat-model",
    providerKey: "openai",
    displayName: "Chat Model",
    friendlyName: "Chat",
    isEnabled: true,
    supportedUseCases: ["chat"],
  },
];

const providers = [
  {
    _id: "provider_1",
    providerKey: "openai",
    displayName: "OpenAI",
  },
];

const defaults = {
  defaults: [
    {
      useCase: "chat",
      default: null,
    },
  ],
};

function getConvexPath(functionReference: unknown) {
  try {
    return getFunctionName(functionReference as never);
  } catch {
    const maybeReference = functionReference as { _path?: unknown; name?: unknown };
    return typeof maybeReference._path === "string" ? maybeReference._path : typeof maybeReference.name === "string" ? maybeReference.name : "";
  }
}

describe("AIModelDefaultsPage", () => {
  const setGlobalModelDefault = vi.fn();
  const clearGlobalModelDefault = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockImplementation((...args: Parameters<typeof useQuery>) => {
      const queryFn = args[0];
      const path = getConvexPath(queryFn);
      if (path.includes("getModels")) return models as unknown as ReturnType<typeof useQuery>;
      if (path.includes("getProviders")) return providers as unknown as ReturnType<typeof useQuery>;
      return defaults as unknown as ReturnType<typeof useQuery>;
    });
    vi.mocked(useMutation).mockImplementation((mutationFn: Parameters<typeof useMutation>[0]) => {
      const path = getConvexPath(mutationFn);
      if (path.includes("clearGlobalModelDefault")) return clearGlobalModelDefault as unknown as ReturnType<typeof useMutation>;
      return setGlobalModelDefault as unknown as ReturnType<typeof useMutation>;
    });
    setGlobalModelDefault.mockResolvedValue(undefined);
    clearGlobalModelDefault.mockResolvedValue(undefined);
  });

  it("renders platform defaults without provider cards or catalogue filters", async () => {
    render(<AIModelDefaultsPage />);

    expect(screen.getByText("Model Defaults")).toBeInTheDocument();
    expect(screen.getByText("Chat")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Search model names or IDs...")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sync" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "chat-model" } });

    await waitFor(() => {
      expect(setGlobalModelDefault).toHaveBeenCalledWith({ useCase: "chat", modelId: "chat-model" });
    });
  });
});
