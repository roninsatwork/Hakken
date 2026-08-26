import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePaginatedQuery, useQuery } from "convex/react";
import { itBehavesLikeAStandardTableScreen } from "@/src/test/standardTableScreen";
import { pagedResult } from "@/src/test/screenMocks";
import ScrapedDataPage from "./page";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/navigation", async () => (await import("@/src/test/screenMocks")).nextNavigation());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => <header /> }));

const properties = [
  {
    _id: "property_ash",
    address: "12 Ash Road, Guildford",
    propertyType: "Semi-detached",
    agentName: "Kingsley & Co",
    price: 425000,
    bedrooms: 3,
    bathrooms: 1,
    imageUrl: undefined,
  },
  {
    _id: "property_denzil",
    address: "4 Denzil Road, Guildford",
    propertyType: "Terraced",
    agentName: "Halewood",
    price: 399000,
    bedrooms: 3,
    bathrooms: 2,
    imageUrl: undefined,
  },
];

describe("ScrapedDataPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockReturnValue(2);
  });

  describe("as a standard table screen", () => {
    itBehavesLikeAStandardTableScreen({
      renderScreen: () => render(<ScrapedDataPage />),
      withRows: (rows) => {
        vi.mocked(useQuery).mockReturnValue(rows?.length ?? 0);
        vi.mocked(usePaginatedQuery).mockReturnValue(pagedResult(rows) as unknown as ReturnType<typeof usePaginatedQuery>);
      },
      sampleRows: properties,
      sampleRowText: "12 Ash Road, Guildford",
      emptyText: "properties.scrapedData.emptyLabel",
      searchPlaceholder: "properties.scrapedData.searchPlaceholder",
      // The footer is hidden when there is nothing to page through, which is a
      // decision this screen made before the numbered footer became standard.
    });
  });

  it("opens the property delete confirmation from its row action", async () => {
    vi.mocked(usePaginatedQuery).mockReturnValue(
      pagedResult(properties) as unknown as ReturnType<typeof usePaginatedQuery>
    );

    render(<ScrapedDataPage />);
    fireEvent.click(screen.getAllByLabelText("properties.scrapedData.deleteRow")[0]);

    expect(await screen.findByText("properties.scrapedData.deleteTitle")).toBeInTheDocument();
    expect(screen.getByText("properties.scrapedData.cancel")).toBeInTheDocument();
  });
});
