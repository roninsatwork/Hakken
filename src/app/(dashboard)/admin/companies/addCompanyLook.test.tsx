import { cleanup, renderWithProviders as render } from "@/src/test/renderWithProviders";
import { afterEach, describe, it, vi } from "vitest";

import { expectApprovedLook } from "@/src/test/lookOutline";
import { AddCompanyPage } from "./AddCompanyPage";

/**
 * Manage Companies → Add company holds to the look Anthony chose on the "Add
 * Company as a page" canvas, 2026-10-19 (docs/plans/active/add-company-page-
 * plan.md, board 3; design-drift-plan D4): rendered in English, it reads as the
 * outline saved in docs/plans/assets/add-company-page/look/.
 */

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("next/navigation", async () => (await import("@/src/test/screenMocks")).nextNavigation({}));

afterEach(cleanup);

describe("Add company's approved look", () => {
  it("NameAndWebsite — the company's name and its website", async () => {
    const { container } = render(<AddCompanyPage />);
    await expectApprovedLook(container, "add-company-page", "NameAndWebsite", "Manage Companies → Add company");
  });
});
