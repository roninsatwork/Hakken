import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import AIModelProvidersPage from "./page";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/admin/ai/models/providers"),
  useSearchParams: vi.fn(() => new URLSearchParams()),
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
    // What a real test writes back, rather than a word that collides with the
    // status column.
    settings: JSON.stringify({ lastHealthMessage: "Connection ok. 122 models visible." }),
  },
];

// From the rollup: how many models this provider gives you and how many are on.
const modelCounts = {
  totalModels: 15,
  enabledModels: 4,
  byProvider: [{ providerKey: "openai", total: 15, enabled: 4 }],
  computedAt: 1_788_000_000_000,
  isPartial: false,
};

// What the provider being switched off is currently handling. The screen has to
// say this before it acts, because disabling now genuinely stops that work.
const providerUsage = {
  globalUseCases: ["chat", "title"],
  companyCount: 2,
  isPartial: false,
};

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
    vi.mocked(useQuery).mockImplementation((...args: Parameters<typeof useQuery>) => {
      const path = getConvexPath(args[0]);
      if (path.includes("getProviderDefaultUsage")) {
        return providerUsage as unknown as ReturnType<typeof useQuery>;
      }
      if (path.includes("getModelCounts")) {
        return modelCounts as unknown as ReturnType<typeof useQuery>;
      }
      return providers as unknown as ReturnType<typeof useQuery>;
    });
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
    // Plain words rather than the stored status. "Healthy" meant two different
    // things depending on the provider until the test was made real.
    expect(screen.getByText("Connected")).toBeInTheDocument();
    // The last sync message is not printed under the provider name. It is on
    // the row as hover text, and a failed test still reports in the banner.
    expect(screen.queryByText("Connection ok. 122 models visible.")).not.toBeInTheDocument();
    // The number the screen exists to answer, which was not on it before.
    expect(screen.getByText(/15/)).toBeInTheDocument();
    expect(screen.getByText(/4 on/)).toBeInTheDocument();
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

    // Disabling has its own test below: it now asks first, so it no longer
    // writes on one click.
  });

  /**
   * Disabling a provider now stops its models serving, so it can take a
   * company's agents offline. It asks first, and names what it is about to
   * stop — while enabling, which is harmless, still happens on one click.
   */
  it("asks before switching a provider off, and says what that stops", async () => {
    render(<AIModelProvidersPage />);

    fireEvent.click(screen.getByRole("switch", { name: "Disable OpenAI" }));

    // Nothing written yet — the click opened a confirmation.
    expect(setProviderEnabled).not.toHaveBeenCalled();
    expect(screen.getByText(/stops that work/i)).toBeInTheDocument();
    expect(screen.getByText(/Platform jobs: Chat, Title\./)).toBeInTheDocument();
    expect(screen.getByText(/Also chosen by 2 companies\./)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Switch it off" }));
    await waitFor(() => {
      expect(setProviderEnabled).toHaveBeenCalledWith({ providerKey: "openai", isEnabled: false });
    });
  });
});
