import { cleanup, fireEvent, renderWithProviders as render, screen, waitFor } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import { AddCompanyPage } from "./AddCompanyPage";

/**
 * Manage Companies → Add company (docs/plans/active/add-company-page-plan.md):
 * the company's name and website on a page of their own, saved together, then
 * the new company opens. Its look is held by `addCompanyLook.test.tsx`.
 */

const { push, create } = vi.hoisted(() => ({ push: vi.fn(), create: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("next/navigation", async () => ({
  ...(await import("@/src/test/screenMocks")).nextNavigation({}),
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

beforeEach(() => {
  push.mockReset();
  create.mockReset();
  vi.mocked(useQuery).mockImplementation(answerQueries({
    "websites:previewWebsiteHost": { ok: true, host: "nec.ac.uk", displayHost: "nec.ac.uk", alreadyKnown: false, inherits: null },
  }));
  vi.mocked(useMutation).mockImplementation((() => create) as never);
  create.mockResolvedValue("company_new");
});
afterEach(cleanup);

const fillIn = () => {
  fireEvent.change(screen.getByLabelText("Company Name"), { target: { value: " National Extension College " } });
  fireEvent.change(screen.getByLabelText("Website address"), { target: { value: "https://www.nec.ac.uk" } });
};

describe("Add company", () => {
  it("says what the address will be saved as, before it is added", async () => {
    render(<AddCompanyPage />);
    fillIn();
    expect(await screen.findByText("Saved as nec.ac.uk")).toBeInTheDocument();
    expect(screen.getByText("New to the system.")).toBeInTheDocument();
  });

  it("adds the company with its website, then opens the company", async () => {
    render(<AddCompanyPage />);
    fillIn();
    fireEvent.click(screen.getByRole("button", { name: "Add company" }));

    await waitFor(() => expect(create).toHaveBeenCalledWith({ name: "National Extension College", websiteUrl: "https://www.nec.ac.uk" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/companies/company_new"));
  });

  it("stays on the page and says why when the company cannot be added", async () => {
    create.mockRejectedValue(new Error("This company already has that website."));
    render(<AddCompanyPage />);
    fillIn();
    fireEvent.click(screen.getByRole("button", { name: "Add company" }));

    expect(await screen.findByText("This company already has that website.")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
