import { describe, expect, it, vi } from "vitest";
import AIModelsPage from "./page";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

describe("AIModelsPage", () => {
  it("redirects the legacy models route to the model catalogue", async () => {
    const { redirect } = await import("next/navigation");

    AIModelsPage();

    expect(redirect).toHaveBeenCalledWith("/admin/ai/models/catalogue");
  });
});
