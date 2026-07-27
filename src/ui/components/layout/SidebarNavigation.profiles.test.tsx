import React from "react";
import { render, screen } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SidebarNavigation from "./SidebarNavigation";

/**
 * White-label navigation profiles must actually hide menu items.
 *
 * The profiles in `convex/settingsService.ts` were rendered in the settings
 * screen but consumed by nothing, so "Navigation Profiles" was guidance
 * presented as a feature. These tests are the difference between the two.
 */

const settingsMock = vi.hoisted(() => ({
  current: {
    diagnosticRoutingEnabled: false,
    logoUrlDark: "",
    logoUrlLight: "",
    platformName: "Sonae",
  } as Record<string, unknown>,
}));

const useQueryMock = vi.hoisted(() => vi.fn());
const useMutationMock = vi.hoisted(() => vi.fn());

vi.mock("convex/react", () => ({
  useMutation: (...args: unknown[]) => useMutationMock(...args),
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    agentRuns: { getPendingApprovalCount: "agentRuns:getPendingApprovalCount" },
    scheduler: { getPendingWorkflowApprovalCount: "scheduler:getPendingWorkflowApprovalCount" },
    companies: { getCompanyById: "companies:getCompanyById" },
    users: { getMe: "users:getMe", impersonateCompany: "users:impersonateCompany" },
  },
}));

vi.mock("@/src/context/UIContext", () => ({
  useUI: () => ({ isSidebarOpen: true, setIsSidebarOpen: vi.fn() }),
}));

vi.mock("@/src/context/SystemSettingsContext", () => ({
  useSystemSettings: () => settingsMock.current,
}));

vi.mock("next-themes", () => ({ useTheme: () => ({ systemTheme: "dark", theme: "dark" }) }));

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next/image", () => ({
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt ?? ""} {...props} />
  ),
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: new Proxy(
    {},
    {
      get: (_target, tag: string) => {
        const MotionComponent = React.forwardRef<
          HTMLElement,
          React.HTMLAttributes<HTMLElement> & { layoutId?: string; transition?: unknown }
        >(({ children, ...props }, ref) => {
          const domProps = { ...props };
          delete domProps.layoutId;
          delete domProps.transition;
          return React.createElement(tag, { ...domProps, ref }, children);
        });
        MotionComponent.displayName = `MotionMock(${tag})`;
        return MotionComponent;
      },
    },
  ),
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

function renderSidebar(navigationProfileKey?: string) {
  settingsMock.current = {
    diagnosticRoutingEnabled: false,
    logoUrlDark: "",
    logoUrlLight: "",
    platformName: "Sonae",
    navigationProfileKey,
  };
  vi.mocked(usePathname).mockReturnValue("/admin");
  render(<SidebarNavigation />);
}

function linkHrefs() {
  return screen.queryAllByRole("link").map((link) => link.getAttribute("href"));
}

/** Section labels, which are toggle buttons rather than links. */
function sectionLabels() {
  return screen.queryAllByRole("button").map((button) => button.textContent?.trim());
}

describe("white-label navigation profiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMutationMock.mockReturnValue(vi.fn());
    useQueryMock.mockImplementation((queryRef: unknown) =>
      queryRef === "users:getMe" ? { role: "SUPER_ADMIN" } : undefined,
    );
  });

  it("shows everything when no profile is selected", () => {
    renderSidebar(undefined);

    expect(sectionLabels()).toContain("companies");
    expect(linkHrefs()).toContain("/admin");
  });

  it("hides the items a profile lists, and only those", () => {
    // customerWorkspace hides adminCompanies, releaseCenter, apiKeys and
    // webhookDeliveries.
    renderSidebar("customerWorkspace");

    // The whole section goes, not just its child link — otherwise an empty
    // expandable heading is left behind.
    expect(sectionLabels()).not.toContain("companies");
    expect(linkHrefs()).not.toContain("/admin/companies");
    // Still present: not on that profile's hide list.
    expect(linkHrefs()).toContain("/admin");
  });

  it("ignores an unknown profile rather than hiding everything", () => {
    // A typo in configuration must not blank the navigation.
    renderSidebar("notARealProfile");

    expect(sectionLabels()).toContain("companies");
    expect(linkHrefs()).toContain("/admin");
  });

  it("keeps items that no profile classifies", () => {
    // Deny-by-default would silently remove any newly added menu item.
    // customerWorkspace never mentions agents in visible, owner or hide.
    renderSidebar("customerWorkspace");

    expect(sectionLabels()).toContain("agents");
  });
});
