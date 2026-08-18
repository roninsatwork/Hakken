import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { beforeEach, describe, vi } from "vitest";
import { useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { itBehavesLikeAStandardTableScreen } from "@/src/test/standardTableScreen";
import SalesDataImportPage from "./page";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/navigation", async () => (await import("@/src/test/screenMocks")).nextNavigation({ workspace: "comax" }));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => <header /> }));

const imports = [
  {
    _id: "import_july",
    fileName: "july-sales.xlsx",
    importedByName: "Anthony Basker",
    status: "COMPLETED",
    supersededAt: undefined,
    error: undefined,
    salesRowCount: 4210,
    categoryRowCount: 18,
    areasOfInterestRowCount: 6,
    frequencyRowCount: 12,
    periodLabels: ["May", "Jun", "Jul"],
    startedAt: Date.UTC(2026, 7, 1, 9, 0),
  },
  {
    _id: "import_june",
    fileName: "june-sales.xlsx",
    importedByName: "Anthony Basker",
    status: "SUPERSEDED",
    supersededAt: Date.UTC(2026, 7, 1, 9, 5),
    error: undefined,
    salesRowCount: 3980,
    categoryRowCount: 18,
    areasOfInterestRowCount: 6,
    frequencyRowCount: 12,
    periodLabels: ["Apr", "May", "Jun"],
    startedAt: Date.UTC(2026, 6, 1, 9, 0),
  },
];

describe("SalesDataImportPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("as a standard table screen", () => {
    itBehavesLikeAStandardTableScreen({
      renderScreen: () => render(<SalesDataImportPage />),
      withRows: (rows) => {
        vi.mocked(useQuery).mockImplementation((...args) =>
          getFunctionName(args[0]) === "salesData:listImports" ? rows : undefined);
      },
      // Genuinely missing, not an oversight: this table ends where its last row
      // does, so a short list has nothing under it saying how many there are.
      // It is one of the client-facing screens Anthony held back from the
      // screen-kit plan on 2026-08-17, so it keeps its own shape until that half
      // of the app comes into scope. Turn this on when it moves onto DataTable.
      hasFooter: false,
      sampleRows: imports,
      sampleRowText: "july-sales.xlsx",
      emptyText: "salesData.historyEmptyTitle",
    });
  });
});
