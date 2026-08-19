import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { itBehavesLikeAStandardTableScreen } from "@/src/test/standardTableScreen";
import SalesDataPage from "./page";

/** Opens on the sales tab, so these are sales rows. */

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/navigation", async () => (await import("@/src/test/screenMocks")).nextNavigation({ workspace: "comax" }));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => <header /> }));

const salesRows = [
  {
    _id: "sales_kingsley",
    sourceRow: 2,
    parentAccount: "Kingsley Group",
    groupName: "Kingsley Group",
    accountName: "Kingsley & Co",
    customerType: "TRADE",
    productCode: "DR-100",
    uniqueId: "KC001-DR-100",
    productDescription: "Oak internal door",
    productCategory: "Doors",
    productType: "Internal",
    period1: 1200,
    period2: 1400,
    period3: 1310,
  },
  {
    _id: "sales_halewood",
    sourceRow: 3,
    parentAccount: "Halewood",
    groupName: "Halewood",
    accountName: "Halewood Doors",
    customerType: "RETAIL",
    productCode: "DR-200",
    uniqueId: "HD002-DR-200",
    productDescription: "Composite front door",
    productCategory: "Doors",
    productType: "External",
    period1: 800,
    period2: 910,
    period3: 870,
  },
];

describe("SalesDataPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("as a standard table screen", () => {
    itBehavesLikeAStandardTableScreen({
      renderScreen: () => render(<SalesDataPage />),
      withRows: (rows) => {
        vi.mocked(useQuery).mockImplementation((...args) => {
          const name = getFunctionName(args[0]);
          if (name === "salesData:listSalesRows") {
            return rows === undefined ? undefined : { page: rows, isDone: true, continueCursor: null };
          }
          if (name === "salesData:getSectionOverview") {
            return { sales: 2, categories: 0, areasOfInterest: 0, frequency: 0, periodLabels: ["May", "Jun", "Jul"] };
          }
          if (name === "salesData:listSalesFilterOptions" || name === "salesData:listTableFilterOptions") {
            return { groups: [], types: [], categories: [] };
          }
          return undefined;
        });
      },
      sampleRows: salesRows,
      sampleRowText: "Oak internal door",
      emptyText: "salesData.emptyTitle",
      searchPlaceholder: "salesData.searchPlaceholder.sales",
    });
  });

  /**
   * Clearing everything is admin-only on the backend (maintenance plan
   * M1.2), so the button hides rather than greeting an ordinary member with
   * an authorization error on press.
   */
  describe("the clear-all button", () => {
    const withRole = (role: string) => {
      vi.mocked(useQuery).mockImplementation((...args) => {
        const name = getFunctionName(args[0]);
        if (name === "users:getMe") return { role };
        if (name === "salesData:listSalesRows") {
          return { page: salesRows, isDone: true, continueCursor: null };
        }
        if (name === "salesData:getSectionOverview") {
          return {
            sales: 2,
            categories: 0,
            areasOfInterest: 0,
            frequency: 0,
            periodLabels: ["May", "Jun", "Jul"],
            currentImport: {
              _id: "import_1",
              fileName: "sample.xlsx",
              salesRowCount: 2,
              periodLabels: ["May", "Jun", "Jul"],
            },
          };
        }
        if (name === "salesData:listSalesFilterOptions" || name === "salesData:listTableFilterOptions") {
          return { groups: [], types: [], categories: [] };
        }
        return undefined;
      });
    };

    it("hides from an ordinary member", () => {
      withRole("USER");
      render(<SalesDataPage />);
      expect(screen.queryByText("salesData.clearAllStart")).toBeNull();
    });

    it("shows for an admin", () => {
      withRole("ADMIN");
      render(<SalesDataPage />);
      expect(screen.getByText("salesData.clearAllStart")).toBeInTheDocument();
    });
  });
});
