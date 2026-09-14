import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { getFunctionName } from "convex/server";
import { useQuery, useAction, usePaginatedQuery } from "convex/react";
import messages from "@/messages/en.json";
import defaults from "@/sonae.billing.json";
import { ToastProvider } from "@/src/context/ToastContext";
import { BillingOperatorGate } from "./BillingOperatorGate";
import CustomerBilling from "@/src/app/(dashboard)/app/settings/billing/page";
import BillingOverview from "@/src/app/(dashboard)/admin/settings/billing/page";
import BillingSetup from "@/src/app/(dashboard)/admin/settings/billing/setup/page";
import PlanBilling from "@/src/app/(dashboard)/admin/settings/plans/[id]/billing/page";

vi.mock("convex/react", () => ({ useQuery: vi.fn(), useAction: vi.fn(), usePaginatedQuery: vi.fn() }));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "plan_fixture" }) }));
vi.mock("@/src/lib/reportError", () => ({ reportError: vi.fn() }));

const show = (ui: React.ReactNode) => render(<NextIntlClientProvider locale="en" messages={messages} timeZone="UTC"><ToastProvider>{ui}</ToastProvider></NextIntlClientProvider>);
const actions = { save: vi.fn(), prices: vi.fn(), link: vi.fn(), check: vi.fn(), overview: vi.fn(), checkout: vi.fn(), portal: vi.fn(), refresh: vi.fn() };
let user: { role: string; impersonatingCompanyId?: string } | null;
let customer: Record<string, unknown> | null;
const settings = () => ({ config: { ...defaults, enabled: false, mode: "test", offers: [] }, revision: 0,
  secretKeyPresent: false, secretKeyModeMatches: false, webhookSecretPresent: false, webhookUrl: "https://backend.convex.site/stripe/webhook", lastWebhookAt: null, hasAccounts: false });
const report = { startedAt: 1_800_000_000_000, completedAt: 1_800_000_000_000, mode: "test", paidCompanies: 2, paidUsers: 12, totalCompanies: 8,
  totalUsers: 30, billingAccounts: 5, paymentIssues: 1, pending: 2, canceled: 1, cancelling: 1, staleAccounts: 1, monthlyValue: [{ currency: "gbp", amountMinor: 5800 }] };

beforeEach(() => {
  vi.clearAllMocks();
  user = { role: "SUPER_ADMIN" };
  customer = { enabled: false, managed: false, canCheckout: false, hasCustomer: false, status: "manual", accessAllowed: true, paidThrough: 0, cancelAtPeriodEnd: false, offers: [], planName: "" };
  actions.save.mockResolvedValue(null); actions.link.mockResolvedValue(null); actions.overview.mockResolvedValue(report);
  actions.prices.mockResolvedValue({ prices: [{ id: "price_team", name: "Team monthly", amountMinor: 2900, currency: "gbp" }], cursor: null });
  vi.mocked(useQuery).mockImplementation((ref, args = undefined) => {
    if (args === "skip") return undefined;
    switch (getFunctionName(ref)) {
      case "users:getMe": return user;
      case "billing:getStatus": return customer;
      case "billingAdmin:getSettings": return settings();
      case "billingAdmin:getPlan": return { name: "Team", active: true };
      default: return undefined;
    }
  });
  vi.mocked(useAction).mockImplementation(ref => ({
    "billingAdminActions:saveSettings": actions.save, "billingAdminActions:listPrices": actions.prices,
    "billingAdminActions:linkPrice": actions.link, "billingAdminActions:checkConnection": actions.check,
    "billingMetrics:overview": actions.overview, "billingActions:createCheckout": actions.checkout,
    "billingActions:createPortal": actions.portal, "billingActions:refresh": actions.refresh,
  })[getFunctionName(ref)] as ReturnType<typeof useAction>);
  vi.mocked(usePaginatedQuery).mockReturnValue({ results: [], status: "Exhausted", loadMore: vi.fn(), isLoading: false });
});

describe("billing screens", () => {
  test.each(["ADMIN", "USER", "READ_ONLY", "AUDITOR"])("%s cannot mount private platform content", role => {
    user = { role }; show(<BillingOperatorGate><p>Private revenue</p></BillingOperatorGate>);
    expect(screen.queryByText("Private revenue")).not.toBeInTheDocument();
    expect(screen.getByText(messages.billingAdmin.restricted)).toBeInTheDocument();
  });

  test("impersonation cannot mount private platform content", () => {
    user = { role: "SUPER_ADMIN", impersonatingCompanyId: "other" };
    show(<BillingOperatorGate><p>Private revenue</p></BillingOperatorGate>);
    expect(screen.queryByText("Private revenue")).not.toBeInTheDocument();
  });

  test("customer Billing remains visible while setup is disabled and has no Admin links", () => {
    show(<CustomerBilling />);
    expect(screen.getByRole("heading", { name: "Billing" })).toBeInTheDocument();
    expect(screen.getByText(messages.billing.disabled)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: messages.billing.checkout })).not.toBeInTheDocument();
    expect(document.querySelector('a[href^="/admin"]')).toBeNull();
  });

  test("an ineligible customer cannot reach a billing action", () => {
    customer = null; show(<CustomerBilling />);
    expect(screen.getByText(messages.billing.restricted)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  test("customer checkout sends only the server offer key", async () => {
    customer = { ...customer, enabled: true, canCheckout: true, offers: [{ key: "team", name: "Team", amountMinor: 2900, currency: "gbp" }] };
    actions.checkout.mockReturnValue(new Promise(() => {}));
    show(<CustomerBilling />); fireEvent.click(screen.getByRole("button", { name: messages.billing.checkout }));
    await waitFor(() => expect(actions.checkout).toHaveBeenCalledWith({ offerKey: "team" }));
    expect(document.querySelector('a[href^="/admin"]')).toBeNull();
  });

  test("subscribers see their plan, payment status and recovery controls", () => {
    customer = { ...customer, enabled: true, managed: true, hasCustomer: true, status: "past_due", planName: "Team", paidThrough: 1_800_000_000_000, accessAllowed: false, cancelAtPeriodEnd: true };
    show(<CustomerBilling />);
    expect(screen.getByText("Team")).toBeInTheDocument();
    expect(screen.getByText(messages.billing.states.past_due)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: messages.billing.portal })).toBeInTheDocument();
    expect(screen.getByText(messages.billing.cancelScheduled)).toBeInTheDocument();
  });

  test("operator overview labels paid users separately and shows dated currency totals", async () => {
    show(<BillingOverview />);
    const label = await screen.findByRole("heading", { name: "Users on paid subscriptions" });
    expect(within(label.closest("section")!).getByText("12")).toBeInTheDocument();
    expect(screen.getByText("£58.00")).toBeInTheDocument();
    expect(screen.getByText(/not synced successfully/)).toBeInTheDocument();
    expect(screen.getByText(/Report completed/)).toHaveTextContent("Test mode");
    expect(vi.mocked(usePaginatedQuery)).toHaveBeenCalledWith(expect.anything(), { searchTerm: "" }, { initialNumItems: 15 });
    fireEvent.change(screen.getByRole("combobox", { name: "Filter subscription status" }), { target: { value: "past_due" } });
    expect(vi.mocked(usePaginatedQuery)).toHaveBeenLastCalledWith(expect.anything(), { searchTerm: "", status: "past_due" }, { initialNumItems: 15 });
  });

  test("failed totals show an error instead of invented zero counts", async () => {
    actions.overview.mockRejectedValue(new Error("unavailable")); show(<BillingOverview />);
    expect(await screen.findByText(messages.billingAdmin.failed)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Paying companies" })).not.toBeInTheDocument();
  });

  test("setup is accessible before credentials exist and saves non-secret settings", async () => {
    show(<BillingSetup />);
    expect(screen.getByText(messages.billingAdmin.keyMissing)).toBeInTheDocument();
    expect(screen.getByText(messages.billingAdmin.noWebhook)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: messages.billingAdmin.managePrices })).toHaveAttribute("href", "/admin/settings/plans");
    fireEvent.change(screen.getByLabelText("Product app URL"), { target: { value: "https://product.example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Save billing settings" }));
    await waitFor(() => expect(actions.save).toHaveBeenCalledWith({ revision: 0, enabled: false, mode: "test", appOrigin: "https://product.example.com", graceDays: 0 }));
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });

  test("plan picker uses provider names and saves a price binding, never a browser amount", async () => {
    show(<PlanBilling />);
    fireEvent.click(screen.getByRole("button", { name: "Load Stripe prices" }));
    await screen.findByRole("option", { name: "Team monthly — £29.00" });
    fireEvent.change(screen.getByRole("combobox", { name: "Stripe price" }), { target: { value: "price_team" } });
    fireEvent.click(screen.getByRole("button", { name: "Save billing settings" }));
    await waitFor(() => expect(actions.link).toHaveBeenCalledWith({ planId: "plan_fixture", priceId: "price_team", revision: 0 }));
  });
});
