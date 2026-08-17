import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { itBehavesLikeAStandardTableScreen } from "@/src/test/standardTableScreen";
import { pagedResult } from "@/src/test/screenMocks";
import UserProfilePage from "./page";

/**
 * The conversation-costs table beside the sign-in history only renders once the
 * cost query answers, so with that left unmocked this page draws one table.
 */

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
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

describe("UserProfilePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockImplementation((...args) => {
      const name = getFunctionName(args[0]);
      if (name === "users:getUserById") return { _id: "user123", name: "Sam Reed", email: "sam@ronins.co.uk", role: "USER" };
      return undefined;
    });
  });

  describe("as a standard table screen", () => {
    itBehavesLikeAStandardTableScreen({
      renderScreen: () => render(<UserProfilePage />),
      withRows: (rows) => {
        vi.mocked(usePaginatedQuery).mockReturnValue(pagedResult(rows) as unknown as ReturnType<typeof usePaginatedQuery>);
      },
      sampleRows: logins,
      sampleRowText: "MacBook Pro",
      emptyText: "admin.users.profilePage.logins.empty",
      searchPlaceholder: "admin.users.profilePage.logins.searchPlaceholder",
    });
  });

  // Was conditioned on there being more to load, which is the one case where
  // the list is not empty.
  it("says so when the person has no sign-ins at all", () => {
    vi.mocked(usePaginatedQuery).mockReturnValue(pagedResult([]) as unknown as ReturnType<typeof usePaginatedQuery>);

    render(<UserProfilePage />);

    expect(screen.getByText("admin.users.profilePage.logins.empty")).toBeInTheDocument();
  });
});
