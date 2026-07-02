import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import AIModelProvidersPage from "./page";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/admin/ai/models/providers"),
}));

const providers = [
  {
    _id: "provider_1",
    providerKey: "openai",
    displayName: "OpenAI",
    authMode: "environment",
    isEnabled: true,
    status: "healthy",
    lastHealthCheckAt: 1_788_000_000_000,
    lastSyncedAt: 1_788_000_100_000,
    settings: JSON.stringify({ lastHealthMessage: "Connected" }),
  },
];

function getConvexPath(functionReference: unknown) {
  try {
    return getFunctionName(functionReference as never);
  } catch {
    const maybeReference = functionReference as { _path?: unknown; name?: unknown };
    return typeof maybeReference._path === "string" ? maybeReference._path : typeof maybeReference.name === "string" ? maybeReference.name : "";
  }
}

describe("AIModelProvidersPage", () => {
  const syncGoogleModels = vi.fn();
  const syncOpenAIModels = vi.fn();
  const syncAnthropicModels = vi.fn();
  const testProviderConnection = vi.fn();
  const setProviderEnabled = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockReturnValue(providers);
    vi.mocked(useAction).mockImplementation((actionFn: unknown) => {
      const path = getConvexPath(actionFn);
      if (path.includes("syncGoogleModels")) return syncGoogleModels as unknown as ReturnType<typeof useAction>;
      if (path.includes("syncOpenAIModels")) return syncOpenAIModels as unknown as ReturnType<typeof useAction>;
      if (path.includes("syncAnthropicModels")) return syncAnthropicModels as unknown as ReturnType<typeof useAction>;
      return testProviderConnection as unknown as ReturnType<typeof useAction>;
    });
    vi.mocked(useMutation).mockReturnValue(setProviderEnabled as unknown as ReturnType<typeof useMutation>);
    syncGoogleModels.mockResolvedValue(undefined);
    syncOpenAIModels.mockResolvedValue(undefined);
    syncAnthropicModels.mockResolvedValue(undefined);
    testProviderConnection.mockResolvedValue({ ok: true, message: "Connected" });
    setProviderEnabled.mockResolvedValue(undefined);
  });

  it("renders provider management without catalogue filters or defaults", async () => {
    render(<AIModelProvidersPage />);

    expect(screen.getByText("AI Providers")).toBeInTheDocument();
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Search model names or IDs...")).not.toBeInTheDocument();
    expect(screen.queryByText("Platform Defaults")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sync" }));
    await waitFor(() => {
      expect(syncOpenAIModels).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    await waitFor(() => {
      expect(testProviderConnection).toHaveBeenCalledWith({ providerKey: "openai" });
    });

    fireEvent.click(screen.getByRole("button", { name: "Disable" }));
    await waitFor(() => {
      expect(setProviderEnabled).toHaveBeenCalledWith({ providerKey: "openai", isEnabled: false });
    });
  });
});
