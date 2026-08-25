import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import ModelPricingPage from "./page";

const push = vi.fn();
const setDefaultModel = vi.fn();
const updatePricing = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

function getConvexPath(functionReference: unknown) {
  try {
    return getFunctionName(functionReference as never);
  } catch {
    const maybeReference = functionReference as { _path?: unknown; name?: unknown };
    return typeof maybeReference._path === "string" ? maybeReference._path : typeof maybeReference.name === "string" ? maybeReference.name : "";
  }
}

describe("ModelPricingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDefaultModel.mockResolvedValue(undefined);
    updatePricing.mockResolvedValue(undefined);

    vi.mocked(useQuery).mockImplementation((...args: Parameters<typeof useQuery>) => {
      const queryFn = args[0];
      const path = getConvexPath(queryFn);
      if (path.includes("getModel")) {
        return {
          _id: "model_1",
          modelId: "model-1",
          providerModelId: "provider-model-1",
          providerKey: "openai",
          displayName: "Model One",
          friendlyName: "Friendly Model",
          isEnabled: true,
        } as unknown as ReturnType<typeof useQuery>;
      }
      if (path.includes("getProviders")) return [] as unknown as ReturnType<typeof useQuery>;
      return {
        useCases: ["chat", "title"],
        defaults: [],
      } as unknown as ReturnType<typeof useQuery>;
    });

    vi.mocked(useMutation).mockImplementation((mutationFn) => {
      const path = getConvexPath(mutationFn);
      return (path.includes("setDefaultModel") ? setDefaultModel : updatePricing) as unknown as ReturnType<typeof useMutation>;
    });
  });

  it("loads the unchanged confirmation only after the default action", async () => {
    await act(async () => {
      render(<ModelPricingPage params={Promise.resolve({ id: "model_1" })} />);
      await Promise.resolve();
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Make this the default model" }));
      await Promise.resolve();
    });

    expect(await screen.findByRole("dialog", { name: "Make this the default model" })).toBeInTheDocument();
    expect(setDefaultModel).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Make it the default" }));
    await waitFor(() => expect(setDefaultModel).toHaveBeenCalledWith({ modelId: "model_1" }));
  });
});
