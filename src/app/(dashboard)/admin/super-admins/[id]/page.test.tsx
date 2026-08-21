import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { itBehavesLikeAStandardTableScreen } from "@/src/test/standardTableScreen";
import { pagedResult } from "@/src/test/screenMocks";
import UserProfilePage from "./page";

/**
 * The conversations table beside the sign-in history only renders once its own
 * query answers, so with that left unmocked this page draws one table.
 */

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", async () => (await import("@/src/test/screenMocks")).nextNavigation({ id: "user123" }));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());

const logins = [
  {
    _id: "login_mac",
    device: "MacBook Pro",
    location: "Guildford, UK",
    ip: "81.2.69.142",
    status: "SUCCESS",
    timestamp: Date.UTC(2026, 7, 15, 8, 40),
  },
  {
    _id: "login_phone",
    device: "iPhone",
    location: "London, UK",
    ip: "81.2.69.160",
    status: "SUCCESS",
    timestamp: Date.UTC(2026, 7, 14, 19, 5),
  },
];

/** The page opens on costs; the sign-in history is the other tab. */
function renderOnLoginsTab() {
  const result = render(<UserProfilePage />);
  fireEvent.click(screen.getByText("Security & Logins"));
  return result;
}

describe("Super-admin UserProfilePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockImplementation((...args) => {
      const name = getFunctionName(args[0]);
      if (name === "users:getUserById") return { _id: "user123", name: "Sam Reed", email: "sam@ronins.co.uk", role: "SUPER_ADMIN" };
      return undefined;
    });
  });

  describe("as a standard table screen", () => {
    itBehavesLikeAStandardTableScreen({
      renderScreen: renderOnLoginsTab,
      withRows: (rows) => {
        // The page runs two paginated queries. Answering both with the same
        // rows fed sign-in records into the conversations filter, which reads
        // a field they do not have.
        vi.mocked(usePaginatedQuery).mockImplementation((...args) =>
          (getFunctionName(args[0]) === "users:getUserLogins"
            ? pagedResult(rows)
            : pagedResult([])) as unknown as ReturnType<typeof usePaginatedQuery>);
      },
      sampleRows: logins,
      sampleRowText: "MacBook Pro",
      emptyText: "No login records found for this user.",
      searchPlaceholder: "Search devices or locations...",
    });
  });

  // Was conditioned on there being more to load, which is the one case where
  // the list is not empty.
  it("says so when the person has no sign-ins at all", () => {
    vi.mocked(usePaginatedQuery).mockImplementation(() => pagedResult([]) as unknown as ReturnType<typeof usePaginatedQuery>);

    renderOnLoginsTab();

    // Said twice on purpose now the table has a numbered footer: once in the
    // table and once in the footer's count slot.
    expect(screen.getAllByText("No login records found for this user.").length).toBeGreaterThan(0);
  });
});
