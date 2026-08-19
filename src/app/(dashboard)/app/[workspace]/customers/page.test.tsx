import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { itBehavesLikeAStandardTableScreen } from "@/src/test/standardTableScreen";
import CustomersPage from "./page";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/navigation", async () => (await import("@/src/test/screenMocks")).nextNavigation({ workspace: "comax" }));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => <header /> }));

const customers = [
  {
    accountNameKey: "kingsley-and-co",
    accountName: "Kingsley & Co",
    accountCode: "KC001",
    groupName: "Kingsley Group",
    customerType: "TRADE",
    postcode: "GU1 4AA",
    totalRevenue: 128400,
    record: "CUSTOMER",
    origin: "IMPORT",
    hasDetails: true,
  },
  {
    accountNameKey: "halewood-doors",
    accountName: "Halewood Doors",
    accountCode: "HD002",
    groupName: "Halewood",
    customerType: "RETAIL",
    postcode: "GU2 7XH",
    totalRevenue: 41200,
    record: "PROSPECT",
    origin: "MARKET_DISCOVERY",
    hasDetails: false,
  },
];

describe("CustomersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("as a standard table screen", () => {
    itBehavesLikeAStandardTableScreen({
      renderScreen: () => render(<CustomersPage />),
      withRows: (rows) => {
        vi.mocked(useQuery).mockImplementation((...args) => {
          const name = getFunctionName(args[0]);
          if (name === "salesDataCustomers:listCustomers") {
            return rows === undefined ? undefined : { page: rows, isDone: true, continueCursor: null };
          }
          if (name === "salesDataCustomers:countCustomers") return { customers: 2, prospects: 1 };
          if (name === "salesDataCustomers:listCustomerFilterOptions") return { groups: [], types: [] };
          return undefined;
        });
      },
      sampleRows: customers,
      sampleRowText: "Kingsley & Co",
      emptyText: "salesData.customers.emptyTitle",
      searchPlaceholder: "salesData.customers.searchPlaceholder",
    });
  });

  /**
   * Clearing the workspace is admin-only on the backend (maintenance plan
   * M1.2), so the button hides rather than greeting an ordinary member with
   * an authorization error on press.
   */
  describe("the clear-database button", () => {
    const withRole = (role: string) => {
      vi.mocked(useQuery).mockImplementation((...args) => {
        const name = getFunctionName(args[0]);
        if (name === "users:getMe") return { role };
        if (name === "salesDataCustomers:listCustomers") {
          return { page: customers, isDone: true, continueCursor: null };
        }
        if (name === "salesDataCustomers:countCustomers") return { customers: 2, prospects: 1 };
        if (name === "salesDataCustomers:listCustomerFilterOptions") return { groups: [], types: [] };
        return undefined;
      });
    };

    it("hides from an ordinary member", () => {
      withRole("USER");
      render(<CustomersPage />);
      expect(screen.queryByText("salesData.customers.clearStart")).toBeNull();
    });

    it("shows for an admin", () => {
      withRole("ADMIN");
      render(<CustomersPage />);
      expect(screen.getByText("salesData.customers.clearStart")).toBeInTheDocument();
    });
  });
});
