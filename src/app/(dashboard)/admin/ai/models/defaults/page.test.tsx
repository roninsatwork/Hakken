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
    // Rates are stored per million tokens, which is how the provider publishes
    // them and how `calculateModelCostGBP` applies them. This fixture used to
    // hold per-token figures, which is the misreading that made the screen show
    // a rate a million times too big.
    standardInputCostBelow200k: 0.5,
    outputResponseCost: 1.5,
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
      default: { modelId: "chat-model" },
    },
    {
      useCase: "router",
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
  const setDefaultModel = vi.fn();

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
      if (path.includes("setDefaultModel")) return setDefaultModel as unknown as ReturnType<typeof useMutation>;
      return setGlobalModelDefault as unknown as ReturnType<typeof useMutation>;
    });
    setGlobalModelDefault.mockResolvedValue(undefined);
    clearGlobalModelDefault.mockResolvedValue(undefined);
    setDefaultModel.mockResolvedValue(undefined);
  });


  it("says what each job is, prices the choice, and flags only the unset rows", () => {
    render(<AIModelDefaultsPage />);

    // The internal key used to be printed under every label, saying the same
    // word twice — once for a person and once for a machine.
    expect(screen.queryByText("chat", { exact: true })).not.toBeInTheDocument();

    // A reader has no way to know what "Router" is unless the screen says so.
    expect(screen.getByText(/Deciding which model or skill should handle a request/)).toBeInTheDocument();
    expect(screen.getByText("Ordinary conversations with people.")).toBeInTheDocument();

    // Cost is the trade-off being made here, shown where it is made.
    expect(screen.getByText("$0.50 in · $1.50 out per million")).toBeInTheDocument();

    // "Configured" on every row carried no information. Only the exception does.
    expect(screen.queryByText("Configured")).not.toBeInTheDocument();
    expect(screen.getAllByText("Not set")).toHaveLength(1);
  });

  it("renders platform defaults without provider cards or catalogue filters", async () => {
    render(<AIModelDefaultsPage />);

    expect(screen.getByText("Model Defaults")).toBeInTheDocument();
    expect(screen.getByText("Chat")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Search model names or IDs...")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sync" })).not.toBeInTheDocument();

    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "chat-model" } });

    await waitFor(() => {
      expect(setGlobalModelDefault).toHaveBeenCalledWith({ useCase: "chat", modelId: "chat-model" });
    });
  });

  /**
   * Reassigning every job is a real decision, so it asks.
   *
   * This action arrived here from a hover-revealed *Make Default* button on a
   * Model Catalogue row, where it read as marking a favourite and fired
   * immediately. It rewrites every row on this screen, so it belongs where those
   * rows are visible and it must not act on a single click.
   */
  it("asks before pointing every job at one model", async () => {
    render(<AIModelDefaultsPage />);

    const everyJobSelect = screen.getAllByRole("combobox").at(-1)!;
    fireEvent.change(everyJobSelect, { target: { value: "model_1" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply to every job" }));

    // Nothing has been written yet — the click opened a confirmation.
    expect(setDefaultModel).not.toHaveBeenCalled();
    expect(screen.getByText(/replacing the choices currently set/i)).toBeInTheDocument();
    // And it names the rows it is about to overwrite.
    expect(screen.getByText(/Chat, Router\./)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Apply to every job" }).at(-1)!);

    await waitFor(() => {
      expect(setDefaultModel).toHaveBeenCalledWith({ modelId: "model_1" });
    });
  });
});
