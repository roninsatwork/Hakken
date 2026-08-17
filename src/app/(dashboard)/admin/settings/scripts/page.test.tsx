import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { beforeEach, describe, vi } from "vitest";
import { useQuery } from "convex/react";
import { itBehavesLikeAStandardTableScreen } from "@/src/test/standardTableScreen";
import MaintenanceScriptsPage from "./page";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/navigation", async () => (await import("@/src/test/screenMocks")).nextNavigation());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());

const scripts = [
  {
    id: "reindex-wiki",
    name: "Reindex the wiki",
    category: "Wiki",
    riskLevel: "LOW",
    shortDescription: "Rebuilds the search index from stored pages.",
    lastRun: Date.UTC(2026, 7, 14, 3, 0),
  },
  {
    id: "purge-orphans",
    name: "Purge orphaned uploads",
    category: "Storage",
    riskLevel: "HIGH",
    shortDescription: "Deletes files no record points at.",
    lastRun: undefined,
  },
];

describe("MaintenanceScriptsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("as a standard table screen", () => {
    itBehavesLikeAStandardTableScreen({
      renderScreen: () => render(<MaintenanceScriptsPage />),
      withRows: (rows) => {
        vi.mocked(useQuery).mockReturnValue(rows);
      },
      sampleRows: scripts,
      sampleRowText: "Reindex the wiki",
      emptyText: "No maintenance scripts match your search",
      searchPlaceholder: "Search scripts by name, category, risk, or description...",
    });
  });
});
