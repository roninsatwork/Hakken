import React from "react";
import { fireEvent, renderWithProviders as render, screen, waitFor } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import CompanyOverviewPage from "./page";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "company123" }),
}));

const company = {
  _id: "company123",
  _creationTime: 1,
  name: "Acme",
  description: "Original description",
  overview: "Original overview",
  planId: "plan123",
};

const activePlans = [{
  _id: "plan123",
  _creationTime: 1,
  name: "Growth",
  priceGBP: 49,
  messageLimit: 1000,
  isActive: true,
}];

describe("CompanyOverviewPage", () => {
  const updateProfile = vi.fn();
  const assignPlan = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    updateProfile.mockResolvedValue(undefined);
    assignPlan.mockResolvedValue(undefined);
    vi.mocked(useQuery).mockImplementation((...args) => {
      const name = getFunctionName(args[0]);
      if (name === "companies:getCompanyById") return company;
      if (name === "plans:getCompanyPlanStatus") {
        return { planName: "Growth", messagesUsed: 120, messageLimit: 1000 };
      }
      if (name === "users:getMe") return { role: "SUPER_ADMIN" };
      if (name === "plans:getActivePlans") return activePlans;
      return undefined;
    });
    vi.mocked(useMutation).mockImplementation((mutationFn) => {
      const name = getFunctionName(mutationFn);
      if (name === "companies:updateCompanyProfile") {
        return updateProfile as unknown as ReturnType<typeof useMutation>;
      }
      if (name === "companies:assignPlanToCompany") {
        return assignPlan as unknown as ReturnType<typeof useMutation>;
      }
      return vi.fn() as unknown as ReturnType<typeof useMutation>;
    });
  });

  it("keeps all overview queries immediate and saves the same profile and plan payloads", async () => {
    render(<CompanyOverviewPage />);

    const nameField = await screen.findByLabelText("Company name");
    await waitFor(() => expect(nameField).toHaveValue("Acme"));
    expect(vi.mocked(useQuery).mock.calls.map(([queryFn]) => getFunctionName(queryFn))).toEqual([
      "companies:getCompanyById",
      "plans:getCompanyPlanStatus",
      "users:getMe",
      "plans:getActivePlans",
    ]);

    fireEvent.change(nameField, { target: { value: "Acme Updated" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Profile" }));

    await waitFor(() => {
      expect(updateProfile).toHaveBeenCalledWith({
        id: "company123",
        name: "Acme Updated",
        description: "Original description",
        overview: "Original overview",
      });
    });
    expect(assignPlan).toHaveBeenCalledWith({ id: "company123", planId: "plan123" });
    expect(await screen.findByText("Profile successfully updated.")).toBeInTheDocument();
  });
});
