import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SystemSettingsEntryPage from "./page";

const replaceMock = vi.hoisted(() => vi.fn());
const searchTabMock = vi.hoisted(() => vi.fn(() => null as string | null));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => ({ get: searchTabMock }),
}));

/**
 * `/admin/settings` is what the sidebar links to and what every `?tab=` link
 * ever written points at, so it forwards to the screen that replaced the tab
 * rather than rendering a page of its own.
 */
describe("system settings entry point", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchTabMock.mockReturnValue(null);
  });

  it("sends a bare visit to the first screen, and shows a spinner while it goes", () => {
    const { container } = render(<SystemSettingsEntryPage />);

    expect(replaceMock).toHaveBeenCalledWith("/admin/settings/identity");
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("forwards each old tab link to its new screen", () => {
    const cases: Array<[string, string]> = [
      ["appearance", "/admin/settings/identity/aesthetics"],
      ["security", "/admin/settings/security"],
      ["purges", "/admin/settings/security/retention"],
      ["options", "/admin/settings/options"],
    ];

    for (const [tab, expected] of cases) {
      replaceMock.mockClear();
      searchTabMock.mockReturnValue(tab);
      const { unmount } = render(<SystemSettingsEntryPage />);
      expect(replaceMock, tab).toHaveBeenCalledWith(expected);
      unmount();
    }
  });

  it("does not strand a link to a tab that no longer exists", () => {
    // The audit trail moved to Governance, and a link to `?tab=audit` outlived it.
    searchTabMock.mockReturnValue("audit");
    render(<SystemSettingsEntryPage />);

    expect(replaceMock).toHaveBeenCalledWith("/admin/settings/identity");
    expect(screen.queryByText(/not found/i)).not.toBeInTheDocument();
  });
});
