import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { useAction, useQuery } from "convex/react";
import messages from "@/messages/en.json";
import { ToastProvider } from "@/src/context/ToastContext";
import BillingPage from "./page";

vi.mock("convex/react", () => ({ useQuery: vi.fn(), useAction: vi.fn() }));
vi.mock("@/src/lib/reportError", () => ({ reportError: vi.fn() }));
const perform = vi.fn();
const status = { enabled: true, managed: true, canCheckout: true, hasCustomer: true, status: "pending", accessAllowed: false, paidThrough: 0, cancelAtPeriodEnd: false,
  offers: [{ key: "team", name: "Team", amountMinor: 2900, currency: "gbp" }],
};
beforeEach(() => { vi.clearAllMocks(); vi.mocked(useQuery).mockReturnValue(status); vi.mocked(useAction).mockReturnValue(perform); });
const show = () => render(<NextIntlClientProvider locale="en" messages={messages}><ToastProvider><BillingPage /></ToastProvider></NextIntlClientProvider>);

test.each([undefined, null, { ...status, enabled: false }])("loading, forbidden and disabled screens do not offer a purchase: %j", value => {
  vi.mocked(useQuery).mockReturnValue(value); show();
  expect(screen.getByRole("heading", { name: "Billing" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Continue to Stripe" })).not.toBeInTheDocument();
  expect(perform).not.toHaveBeenCalled();
});
test("failed checkout stays on the page, explains the failure and permits retry", async () => {
  perform.mockRejectedValue(new Error("Please retry checkout."));
  show(); fireEvent.click(screen.getByRole("button", { name: "Continue to Stripe" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Continue to Stripe" })).not.toBeDisabled());
  expect(screen.getByText("Please retry checkout.")).toBeInTheDocument();
  expect(perform).toHaveBeenCalledWith({ offerKey: "team" });
});
test("active and overdue subscriptions keep portal/recovery accessible without another purchase", () => {
  vi.mocked(useQuery).mockReturnValue({ ...status, status: "past_due", canCheckout: false }); show();
  expect(screen.getByText("Payment overdue")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Manage billing in Stripe" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Refresh billing status" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Continue to Stripe" })).not.toBeInTheDocument();
});
