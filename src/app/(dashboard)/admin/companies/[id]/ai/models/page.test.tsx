import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import CompanyModelDefaultsPage from "./page";

vi.mock("next/navigation", () => ({
  useParams: vi.fn(() => ({ id: "company_1" })),
  usePathname: vi.fn(() => "/admin/companies/company_1/ai/models"),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

// Rates are stored per million tokens, which is how the provider publishes them
// and how `calculateModelCostUsd` applies them.
const models = [
  {
    _id: "model_1",
    modelId: "chat-model",
    providerKey: "openai",
    displayName: "Chat Model",
    friendlyName: "Chat",
    isEnabled: true,
    supportedUseCases: ["chat"],
    standardInputCostBelow200k: 0.5,
    outputResponseCost: 1.5,
  },
  {
    _id: "model_2",
    modelId: "smart-model",
    providerKey: "openai",
    displayName: "Smart Model",
    friendlyName: "Smart",
    isEnabled: true,
    supportedUseCases: ["chat", "router"],
    standardInputCostBelow200k: 2,
    outputResponseCost: 6,
  },
  {
    _id: "model_3",
    modelId: "router-model",
    providerKey: "openai",
    displayName: "Router Model",
    friendlyName: "Router Pro",
    isEnabled: true,
    supportedUseCases: ["router"],
    standardInputCostBelow200k: 0.1,
    outputResponseCost: 0.2,
  },
];

const providers = [{ _id: "provider_1", providerKey: "openai", displayName: "OpenAI" }];

const defaults = {
  defaults: [
    {
      // Overridden for this company, with a platform default behind it.
      useCase: "chat",
      companyDefault: { modelId: "smart-model", providerKey: "openai", model: null },
      globalDefault: { modelId: "chat-model", providerKey: "openai", model: null },
    },
    {
      // Overridden with a model that cannot do this job — what a disabled model
      // or a narrowed provider leaves behind.
      useCase: "router",
      companyDefault: { modelId: "chat-model", providerKey: "openai", model: null },
      globalDefault: { modelId: "router-model", providerKey: "openai", model: null },
    },
    {
      // Overridden with a model that has since been switched off — the commonest
      // way a row ends up stranded. A switched-off model is not in the active
      // list at all, so the row's own summary is the only place its name exists.
      useCase: "report",
      companyDefault: {
        modelId: "retired-model",
        providerKey: "openai",
        model: {
          modelId: "retired-model",
          providerKey: "openai",
          providerModelId: "retired-model",
          displayName: "Retired Model",
          isEnabled: false,
        },
      },
      globalDefault: { modelId: "chat-model", providerKey: "openai", model: null },
    },
    {
      // Following the platform default, which is the state most rows are in.
      useCase: "title",
      companyDefault: null,
      globalDefault: { modelId: "chat-model", providerKey: "openai", model: null },
    },
  ],
};

function getConvexPath(functionReference: unknown) {
  try {
    return getFunctionName(functionReference as never);
  } catch {
    const maybeReference = functionReference as { _path?: unknown; name?: unknown };
    return typeof maybeReference._path === "string"
      ? maybeReference._path
      : typeof maybeReference.name === "string"
        ? maybeReference.name
        : "";
  }
}

describe("CompanyModelDefaultsPage", () => {
  const setCompanyModelDefault = vi.fn();
  const clearCompanyModelDefault = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockImplementation(() => {
      return {
        ...defaults,
        modelPickerOptions: models,
        providerNames: providers,
      } as unknown as ReturnType<typeof useQuery>;
    });
    vi.mocked(useMutation).mockImplementation((mutationFn: Parameters<typeof useMutation>[0]) => {
      const path = getConvexPath(mutationFn);
      if (path.includes("clearCompanyModelDefault")) {
        return clearCompanyModelDefault as unknown as ReturnType<typeof useMutation>;
      }
      return setCompanyModelDefault as unknown as ReturnType<typeof useMutation>;
    });
    setCompanyModelDefault.mockResolvedValue(undefined);
    clearCompanyModelDefault.mockResolvedValue(undefined);
  });

  it("loads the table through one page subscription", () => {
    render(<CompanyModelDefaultsPage />);

    expect(useQuery).toHaveBeenCalledTimes(1);
    expect(getConvexPath(vi.mocked(useQuery).mock.calls[0][0])).toContain("getCompanyModelDefaults");
  });

  it("says what each job is, and names models the way a person would", () => {
    render(<CompanyModelDefaultsPage />);

    expect(screen.getByText("Company AI Model Defaults")).toBeInTheDocument();

    // The rows used to read "Chat", "Router", "Title" with nothing to say what
    // any of them were.
    expect(screen.getByText("Ordinary conversations with people.")).toBeInTheDocument();
    expect(screen.getByText(/Deciding which model or skill should handle a request/)).toBeInTheDocument();
    expect(screen.getByText(/Naming a conversation from its first message/)).toBeInTheDocument();

    // The raw provider key and model id used to be printed under every platform
    // default — the internal key restated.
    expect(screen.queryByText("chat-model")).not.toBeInTheDocument();
    expect(screen.queryByText(/openai \//)).not.toBeInTheDocument();
    expect(screen.getAllByText("OpenAI").length).toBeGreaterThan(0);

    // The dropdown already says whether a row is overridden, so the pill that
    // said it again on every row is gone.
    expect(screen.queryByText("Inherited")).not.toBeInTheDocument();
    expect(screen.queryByText("Override")).not.toBeInTheDocument();
  });

  /**
   * The price shown must be the price this company will actually pay: its own
   * model where it has one, and the platform's where it does not. A stranded
   * override runs neither, so it falls back with the work.
   */
  it("prices the model that will actually run", () => {
    render(<CompanyModelDefaultsPage />);

    // Chat is overridden to Smart, so Smart's price.
    expect(screen.getByText("$2.00 in · $6.00 out")).toBeInTheDocument();
    // Router's override cannot do the job, so the platform default runs instead.
    expect(screen.getByText("$0.10 in · $0.20 out")).toBeInTheDocument();
    // Title follows the platform default, and Report's switched-off override
    // falls back to the same one — neither is priced at the model it names.
    expect(screen.getAllByText("$0.50 in · $1.50 out")).toHaveLength(2);

    expect(screen.getByText(/Prices are per million tokens/)).toBeInTheDocument();
  });

  it("saves a company override and follows the platform default again", async () => {
    render(<CompanyModelDefaultsPage />);

    fireEvent.change(screen.getByLabelText("Router model for this company"), {
      target: { value: "router-model" },
    });
    await waitFor(() => {
      expect(setCompanyModelDefault).toHaveBeenCalledWith({
        companyId: "company_1",
        useCase: "router",
        modelId: "router-model",
      });
    });

    fireEvent.change(screen.getByLabelText("Chat model for this company"), { target: { value: "" } });
    await waitFor(() => {
      expect(clearCompanyModelDefault).toHaveBeenCalledWith({
        companyId: "company_1",
        useCase: "chat",
      });
    });
  });

  /**
   * An override set to a model this row cannot offer must still be visible.
   *
   * The dropdown's value matched no option, so the browser displayed the *first*
   * one — "Follow the platform default" — while the status column beside it still
   * read "Override". The screen contradicted itself, and touching the dropdown
   * fired a change with an empty value and destroyed the setting.
   */
  it("shows an override the row would not otherwise offer, and says it cannot do the job", () => {
    render(<CompanyModelDefaultsPage />);

    const routerSelect = screen.getByLabelText("Router model for this company") as HTMLSelectElement;
    expect(routerSelect.value).toBe("chat-model");

    expect(screen.getByRole("option", { name: /cannot do this job/i })).toBeInTheDocument();
    expect(screen.getAllByText(/the work falls back to the platform default/i).length).toBeGreaterThan(0);
  });

  /**
   * A switched-off model is not in the active list, so its name has to come from
   * the row itself. Reading it from the list instead would leave this covering
   * only the rarer case — a model that is still on but has been narrowed.
   *
   * And it is told apart from a model that cannot do the work: they are fixed on
   * different screens, so naming the wrong one sends the reader to the wrong place.
   */
  it("names a switched-off override rather than dropping it, and says it is switched off", () => {
    render(<CompanyModelDefaultsPage />);

    const reportSelect = screen.getByLabelText("Report model for this company") as HTMLSelectElement;
    expect(reportSelect.value).toBe("retired-model");

    expect(screen.getByRole("option", { name: /Retired Model — is switched off/i })).toBeInTheDocument();
    expect(screen.getByText(/This model is switched off/i)).toBeInTheDocument();
  });
});
