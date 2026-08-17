import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { itBehavesLikeAStandardTableScreen } from "@/src/test/standardTableScreen";
import { pagedResult } from "@/src/test/screenMocks";
import ProfileTabs from "./ProfileTabs";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/navigation", async () => (await import("@/src/test/screenMocks")).nextNavigation());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "dark", setTheme: vi.fn() }) }));

const logins = [
  {
    _id: "login_mac",
    device: "MacBook Pro",
    browser: "Safari",
    location: "Guildford, UK",
    ipAddress: "81.2.69.142",
    createdAt: Date.UTC(2026, 7, 15, 8, 40),
  },
  {
    _id: "login_phone",
    device: "iPhone",
    browser: "Safari",
    location: "London, UK",
    ipAddress: "81.2.69.160",
    createdAt: Date.UTC(2026, 7, 14, 19, 5),
  },
];

/** The sign-in history lives on the second tab. */
function renderOnLoginsTab() {
  const result = render(<ProfileTabs />);
  fireEvent.click(screen.getByText("user.logins.tabs.security"));
  return result;
}

describe("ProfileTabs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockReturnValue({ _id: "user_1", role: "SUPER_ADMIN", name: "Anthony Basker" });
  });

  describe("as a standard table screen", () => {
    itBehavesLikeAStandardTableScreen({
      renderScreen: renderOnLoginsTab,
      withRows: (rows) => {
        vi.mocked(usePaginatedQuery).mockReturnValue(pagedResult(rows) as unknown as ReturnType<typeof usePaginatedQuery>);
      },
      sampleRows: logins,
      sampleRowText: "MacBook Pro",
      emptyText: "user.logins.table.empty",
    });
  });

  // The message used to be conditioned on there being more to load, which is
  // the one case where the list is not empty. Anyone with no sign-ins recorded
  // saw a table of headings and nothing else.
  it("says so when there are no sign-ins at all, not just when more could load", () => {
    vi.mocked(usePaginatedQuery).mockReturnValue(pagedResult([]) as unknown as ReturnType<typeof usePaginatedQuery>);

    renderOnLoginsTab();

    expect(screen.getAllByText("user.logins.table.empty").length).toBeGreaterThan(0);
  });
});
