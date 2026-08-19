import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_COMPANY_MODULE_KEYS } from "@/convex/utils/coreModules";
import SidebarNavigation from "./SidebarNavigation";

/**
 * Characterisation of the sidebar as it renders today.
 *
 * This exists to make a refactor safe rather than to specify behaviour: it
 * records the exact navigation each role sees, so restructuring the component
 * cannot silently drop, rename or re-link an item. If a snapshot changes, that
 * is either an intentional navigation change (update it, and say so) or a
 * regression.
 *
 * The sibling `SidebarNavigation.test.tsx` holds the intentional rules —
 * which items must *not* appear where. This file is deliberately dumber and
 * broader.
 */

const setIsSidebarOpen = vi.hoisted(() => vi.fn());
const useQueryMock = vi.hoisted(() => vi.fn());
const useMutationMock = vi.hoisted(() => vi.fn());

vi.mock("convex/react", () => ({
  useMutation: (...args: unknown[]) => useMutationMock(...args),
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    agentRunApprovals: { getPendingApprovalCount: "agentRunApprovals:getPendingApprovalCount" },
    scheduler: { getPendingWorkflowApprovalCount: "scheduler:getPendingWorkflowApprovalCount" },
    companies: { getCompanyById: "companies:getCompanyById", getMyWorkspaceModules: "companies:getMyWorkspaceModules" },
    users: { getMe: "users:getMe", impersonateCompany: "users:impersonateCompany" },
  },
}));

vi.mock("@/src/context/UIContext", () => ({
  useUI: () => ({ isSidebarOpen: true, setIsSidebarOpen }),
}));

vi.mock("@/src/context/SystemSettingsContext", () => ({
  useSystemSettings: () => ({
    diagnosticRoutingEnabled: false,
    logoUrlDark: "",
    logoUrlLight: "",
    platformName: "Sonae",
  }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ systemTheme: "dark", theme: "dark" }),
}));

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

// Translation keys pass through as themselves, so a renamed key shows up in the
// snapshot instead of silently resolving to a different string.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

/**
 * Capture every navigation entry reachable for the current role.
 *
 * Sections are toggles, so clicking each one in a single pass closes as many as
 * it opens. Instead this accumulates the union across several passes: whatever
 * a section reveals is recorded the moment it is open, and later toggling it
 * shut cannot remove it from the record.
 */
function captureAllReachableNavigation() {
  const links = new Set<string>();
  const sections = new Set<string>();

  const record = () => {
    for (const link of screen.queryAllByRole("link")) {
      links.add(`${link.textContent?.trim()} -> ${link.getAttribute("href")}`);
    }
    for (const button of screen.queryAllByRole("button")) {
      const label = button.textContent?.trim();
      if (label) sections.add(label);
    }
  };

  record();

  // Re-query by accessible name before each click: React replaces nodes on
  // re-render, so element references captured up front go stale and clicking
  // them does nothing. Several passes, because opening a section can reveal
  // further toggles.
  for (let pass = 0; pass < 3; pass += 1) {
    const names = [
      ...new Set(
        screen
          .queryAllByRole("button")
          .map((button) => button.textContent?.trim())
          .filter((name): name is string => Boolean(name)),
      ),
    ];

    for (const name of names) {
      const button = screen
        .queryAllByRole("button")
        .find((candidate) => candidate.textContent?.trim() === name);
      if (!button) continue;
      fireEvent.click(button);
      record();
    }
  }

  return { sections: [...sections].sort(), links: [...links].sort() };
}

function renderFor(role: string, pathname: string) {
  useQueryMock.mockImplementation((queryRef: unknown) => {
    if (queryRef === "users:getMe") return { role };
    // A workspace with everything, which is what the migration makes of every
    // company that existed before capabilities could be withheld — so these
    // snapshots keep proving the navigation is unchanged for a full workspace.
    if (queryRef === "companies:getMyWorkspaceModules") {
      return { companyName: "Acme", enabledModules: [...DEFAULT_COMPANY_MODULE_KEYS] };
    }
    return undefined;
  });
  vi.mocked(usePathname).mockReturnValue(pathname);
  render(<SidebarNavigation />);
  return captureAllReachableNavigation();
}

describe("sidebar navigation characterisation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMutationMock.mockReturnValue(vi.fn());
  });

  it("super admin navigation is unchanged", () => {
    expect(renderFor("SUPER_ADMIN", "/admin")).toMatchSnapshot();
  });

  it("company admin navigation is unchanged", () => {
    expect(renderFor("ADMIN", "/app")).toMatchSnapshot();
  });

  it("standard user navigation is unchanged", () => {
    expect(renderFor("USER", "/app")).toMatchSnapshot();
  });

  // Snapshot updated 2026-08-18, on purpose: capability sections (Tasks,
  // Calls, Reception, Reports, Properties, workspace Governance) now wait for
  // the workspace's module list, so a signed-out render no longer offers
  // links that would only bounce. The signed-in snapshots above are untouched.
  it("signed-out navigation is unchanged", () => {
    useQueryMock.mockImplementation(() => undefined);
    vi.mocked(usePathname).mockReturnValue("/app");
    render(<SidebarNavigation />);
    expect(captureAllReachableNavigation()).toMatchSnapshot();
  });
});
