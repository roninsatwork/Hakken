import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { beforeEach, describe, vi } from "vitest";
import type { Doc } from "@/convex/_generated/dataModel";
import { itBehavesLikeAStandardTableScreen } from "@/src/test/standardTableScreen";
import MovementLibraryTable from "./MovementLibraryTable";

/**
 * The one list in the app with no data layer of its own — it is handed its rows
 * — so `withRows` sets a variable rather than a mock.
 *
 * It also said "Loading posture studio..." as a row of text where every other
 * list spins; that is now the kit's spinner, which is what let this screen come
 * under the shared floor at all.
 */

let rows: Doc<"movements">[] | undefined;

const movements = [
  {
    _id: "movement_tall_spine",
    title: "Tall Spine Flow",
    difficulty: "EASY",
    spineGoal: "LENGTHEN",
    createdAt: Date.UTC(2026, 6, 20),
  },
  {
    _id: "movement_hip_open",
    title: "Hip Opener",
    difficulty: "MEDIUM",
    spineGoal: "MOBILISE",
    createdAt: Date.UTC(2026, 7, 2),
  },
] as unknown as Doc<"movements">[];

describe("MovementLibraryTable", () => {
  beforeEach(() => {
    rows = movements;
  });

  describe("as a standard table screen", () => {
    itBehavesLikeAStandardTableScreen({
      renderScreen: () =>
        render(
          <MovementLibraryTable
            movements={rows ?? []}
            isLoading={rows === undefined}
            isLoadingMore={false}
            canLoadMore={false}
            searchTerm=""
            itemsPerPage={15}
            onLoadMore={vi.fn()}
            onPlay={vi.fn()}
            onDebugAutoBaseline={vi.fn()}
            onView={vi.fn()}
            onDelete={vi.fn()}
          />
        ),
      withRows: (next) => {
        rows = next as Doc<"movements">[] | undefined;
      },
      sampleRows: movements,
      sampleRowText: "Tall Spine Flow",
      emptyText: "No Routines Recorded",
    });
  });
});
